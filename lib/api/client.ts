// Browser-side helper for calling the consultation API. Every mutation goes
// through here; reads come from Server Components. See docs/api-contract.md.

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { field: string; message: string }[];
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; problem: Problem };

/**
 * The one problem the server never sends, because when it applies the server
 * never answered at all: `fetch` rejects on a dropped connection, a DNS
 * failure or an offline device. Status is 0, the value `XMLHttpRequest` and
 * the Fetch spec both use for "no response was received" - it is deliberately
 * not one of the codes in docs/api-contract.md, none of which can describe a
 * request that never arrived.
 */
const UNREACHABLE: Problem = {
  type: "/errors/unreachable",
  title: "Could not reach the server",
  status: 0,
  detail: "Check your connection and try again — nothing was changed.",
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  // `fetch` only rejects when the request never completed. Leaving that
  // rejection uncaught made every caller's `await` throw before it could
  // re-enable its control or set an error message, so a dropped connection
  // left the complete toggle disabled for good and the dialogs stuck on
  // "Saving…" - with nothing said, and nothing for a screen reader to
  // announce. Turning it into a Problem puts it on the same path as every
  // other failure the UI already renders into `role="alert"`.
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    return { ok: false, problem: UNREACHABLE };
  }

  if (res.ok) {
    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      // A 2xx whose body died mid-stream. The write may well have landed, so
      // this must not claim otherwise.
      return {
        ok: false,
        problem: {
          type: "/errors/unreachable",
          title: "Could not reach the server",
          status: 0,
          detail:
            "The connection dropped before the reply finished. Reload to see whether the change was saved.",
        },
      };
    }
  }

  // A non-2xx should always carry a problem body, but never assume it: a proxy
  // or an unhandled crash can return something else entirely.
  try {
    return { ok: false, problem: (await res.json()) as Problem };
  } catch {
    return {
      ok: false,
      problem: {
        type: "/errors/internal",
        title: "Something went wrong",
        status: res.status,
      },
    };
  }
}

/**
 * `detail` is written to be shown to users; `title` is the fallback. Field-level
 * issues are appended so a validation failure names the offending field.
 */
export function problemMessage(problem: Problem): string {
  const base = problem.detail ?? problem.title;
  if (!problem.errors?.length) return base;
  return `${base} (${problem.errors.map((e) => `${e.field}: ${e.message}`).join("; ")})`;
}
