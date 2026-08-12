// RFC 9457 Problem Details responses. See docs/api-contract.md.

export type FieldError = { field: string; message: string };

type ProblemInit = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: FieldError[];
};

function problem({ type, title, status, detail, instance, errors }: ProblemInit) {
  return Response.json(
    { type, title, status, ...(detail && { detail }), ...(instance && { instance }), ...(errors?.length && { errors }) },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

export const malformedJson = (instance?: string) =>
  problem({
    type: "/errors/malformed-json",
    title: "Malformed JSON",
    status: 400,
    detail: "The request body could not be parsed as JSON.",
    instance,
  });

/**
 * The 401 body, shared with `lib/supabase/proxy.ts`. The proxy has to build its
 * own `NextResponse` so it can carry refreshed auth cookies, so the shape lives
 * here to keep one source of truth.
 */
export const unauthenticatedBody = (instance?: string) => ({
  type: "/errors/unauthenticated",
  title: "Not signed in",
  status: 401,
  ...(instance && { instance }),
});

export const unauthenticated = (instance?: string) =>
  Response.json(unauthenticatedBody(instance), {
    status: 401,
    headers: { "Content-Type": "application/problem+json" },
  });

export const notFound = (instance?: string) =>
  problem({
    type: "/errors/not-found",
    title: "Not found",
    status: 404,
    detail: "No such consultation.",
    instance,
  });

export const validationFailed = (errors: FieldError[], instance?: string) =>
  problem({
    type: "/errors/validation-failed",
    title: "Validation failed",
    status: 422,
    detail: "The request body did not match the expected shape.",
    instance,
    errors,
  });

export const invalidTransition = (detail: string, instance?: string) =>
  problem({
    type: "/errors/invalid-transition",
    title: "Invalid transition",
    status: 422,
    detail,
    instance,
  });

/** Carries no detail: a 500 must never leak internals. */
export const internal = (instance?: string) =>
  problem({
    type: "/errors/internal",
    title: "Something went wrong",
    status: 500,
    instance,
  });

// The rules trigger raises check_violation with messages we wrote. They are
// mapped to our own text rather than passed through, so rewording the trigger
// cannot silently change the public API. An unrecognised message falls back to a
// generic line instead of leaking raw Postgres output.
const TRANSITION_MESSAGES: Record<string, string> = {
  "A consultation cannot be booked in the past":
    "A consultation must be scheduled for a future date and time.",
  "A new consultation must start as scheduled":
    "A new consultation cannot be created as already completed or cancelled.",
  "Only status and scheduled_at may change after booking":
    "Only the status and the scheduled time can be changed after booking.",
  "A cancelled consultation cannot be changed":
    "This consultation has been cancelled and can no longer be changed.",
  "A completed consultation cannot be cancelled":
    "A consultation that already took place cannot be cancelled.",
  "Only a scheduled consultation can be rescheduled":
    "Only an upcoming consultation can be rescheduled.",
  "A consultation cannot be rescheduled into the past":
    "A consultation must be rescheduled to a future date and time.",
};

type Postgrestish = { code?: string; message?: string };

/**
 * Translates a PostgREST error into a response.
 *
 * `42501` becomes 404, not 403: RLS hides the row, so "not yours" and "does not
 * exist" are indistinguishable, and telling them apart would leak which ids are
 * real. See docs/api-contract.md.
 */
export function fromDatabaseError(error: Postgrestish, instance?: string) {
  if (error.code === "23514") {
    const mapped = TRANSITION_MESSAGES[(error.message ?? "").trim()];
    return invalidTransition(
      mapped ?? "That change is not allowed for this consultation.",
      instance,
    );
  }

  if (error.code === "42501") return notFound(instance);

  return internal(instance);
}
