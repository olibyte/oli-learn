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

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (res.ok) return { ok: true, data: (await res.json()) as T };

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
