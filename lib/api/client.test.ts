import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch, problemMessage } from "./client";

/**
 * The case this file exists for: `fetch` *rejects*, rather than answering with
 * a status. A dropped connection, an offline device, a DNS failure.
 *
 * Before this was handled, the rejection escaped `apiFetch` and took every
 * caller's `await` with it - so the line that re-enables the control never
 * ran, and neither did the one that sets the error message. Measured against
 * the running app with the request aborted: the complete toggle stayed
 * `aria-checked="false"` and went permanently `disabled`, the reschedule
 * dialog stayed on "Saving…" and disabled, no `role="alert"` appeared, and the
 * only trace was `TypeError: Failed to fetch` in a console no user reads.
 *
 * A control that is dead and says nothing is worse for a screen-reader user
 * than one that fails loudly, which is why this is an accessibility fix
 * (WCAG 3.3.1 Error Identification) and not only a robustness one.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubFetch = (impl: () => Promise<Response>) =>
  vi.stubGlobal("fetch", vi.fn(impl));

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("apiFetch when the request never completes", () => {
  it("resolves rather than throwing", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    // The whole defect in one assertion: this used to reject.
    await expect(apiFetch("/api/consultations")).resolves.toBeDefined();
  });

  it("reports a problem the UI can render", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await apiFetch("/api/consultations/x");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.problem.type).toBe("/errors/unreachable");
    // Status 0 - "no response was received". Deliberately not one of the codes
    // in docs/api-contract.md, none of which can describe a request that never
    // arrived.
    expect(result.problem.status).toBe(0);
    expect(problemMessage(result.problem)).toMatch(/connection/i);
  });

  it("says nothing was changed, because nothing was", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await apiFetch("/api/consultations");
    if (result.ok) throw new Error("unreachable");

    expect(problemMessage(result.problem)).toMatch(/nothing was changed/i);
  });

  it("does not claim that when the reply died mid-stream", async () => {
    // A 2xx whose body never finished. The write may well have landed, so the
    // message must not tell the user it did not.
    stubFetch(async () => {
      const res = new Response("{ truncated", { status: 200 });
      return res;
    });

    const result = await apiFetch("/api/consultations");
    if (result.ok) throw new Error("unreachable");

    expect(result.problem.type).toBe("/errors/unreachable");
    expect(problemMessage(result.problem)).not.toMatch(/nothing was changed/i);
    expect(problemMessage(result.problem)).toMatch(/whether the change was saved/i);
  });
});

describe("apiFetch when the server does answer", () => {
  it("passes a success body through", async () => {
    stubFetch(async () => json({ id: "c1" }, 200));

    const result = await apiFetch<{ id: string }>("/api/consultations");

    expect(result).toEqual({ ok: true, data: { id: "c1" } });
  });

  it("passes a problem body through untouched", async () => {
    const problem = {
      type: "/errors/validation-failed",
      title: "Validation failed",
      status: 422,
      errors: [{ field: "scheduledAt", message: "must be in 15-minute blocks" }],
    };
    stubFetch(async () => json(problem, 422));

    const result = await apiFetch("/api/consultations");
    if (result.ok) throw new Error("unreachable");

    expect(result.problem).toEqual(problem);
    expect(problemMessage(result.problem)).toBe(
      "Validation failed (scheduledAt: must be in 15-minute blocks)",
    );
  });

  it("falls back when a non-2xx carries no problem body", async () => {
    // A proxy or an unhandled crash: a status, but not the contract's shape.
    stubFetch(async () => new Response("<html>502</html>", { status: 502 }));

    const result = await apiFetch("/api/consultations");
    if (result.ok) throw new Error("unreachable");

    expect(result.problem.type).toBe("/errors/internal");
    // The real status survives, which is what distinguishes this from the
    // never-arrived case above.
    expect(result.problem.status).toBe(502);
  });
});
