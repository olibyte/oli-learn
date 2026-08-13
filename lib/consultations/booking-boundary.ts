/**
 * Consultations are booked in 15-minute blocks: a time is legal only on `:00`,
 * `:15`, `:30` or `:45`, with no seconds.
 *
 * This constrains the *input*. It is not a slot picker and says nothing about
 * whether anyone is free at that time - real availability and double-booking
 * detection are out of scope, and deliberately so (see the readiness doc). The
 * vocabulary here stays "boundary" rather than "slot" so the two never blur.
 *
 * The rule is enforced three times over, because a signed-in student holds a JWT
 * that works directly against PostgREST - the same reasoning that put the state
 * machine in a trigger rather than a route handler:
 *
 *   1. `step` on the `datetime-local` input, so the picker cannot offer a bad
 *      time (`components/consultations/datetime.ts`)
 *   2. this predicate in the zod schemas, so the API rejects one with a message
 *      naming the rule (`lib/api/schemas.ts`)
 *   3. `enforce_consultation_rules()`, which is the only one that actually holds
 *      against a devtools console
 *
 * **The boundary is timezone-independent.** Checking it against UTC is the same
 * check as against any wall clock, because every real UTC offset is a whole
 * multiple of 15 minutes - the finest in use is Nepal's +05:45. So a local
 * `:15` is always an absolute `:15`, and no DST transition can move a legal time
 * off the grid: Melbourne shifts by an hour, and Lord Howe, the narrowest shift
 * anywhere, by 30 minutes.
 */

/** The block size, in minutes. `:00`, `:15`, `:30`, `:45`. */
export const BOOKING_BOUNDARY_MINUTES = 15;

/** The same interval in seconds - what an `<input step>` wants. */
export const BOOKING_BOUNDARY_SECONDS = BOOKING_BOUNDARY_MINUTES * 60;

const BOUNDARY_MS = BOOKING_BOUNDARY_MINUTES * 60_000;

/**
 * One sentence naming the rule and what to do about it, shared by the schema
 * refinement and the trigger's error so a user meets the same words wherever
 * they hit the boundary.
 */
export const BOOKING_BOUNDARY_MESSAGE =
  "Consultations are booked in 15-minute blocks, so the time must be :00, :15, :30 or :45";

/**
 * Whether an instant lands on a booking boundary.
 *
 * The epoch is itself a boundary, so this is a plain modulo - which also
 * catches stray seconds and milliseconds, not just the wrong minute. An
 * unparseable value is not on a boundary rather than a thrown error, because
 * every caller is validating untrusted input.
 */
export function isOnBookingBoundary(at: Date | string | number): boolean {
  const ms = at instanceof Date ? at.getTime() : new Date(at).getTime();
  return Number.isFinite(ms) && ms % BOUNDARY_MS === 0;
}

/**
 * The first boundary strictly after `from`.
 *
 * Strictly, so the result is always a bookable future time: a consultation must
 * be in the future, and `from` landing exactly on a boundary would otherwise
 * hand back an instant that has already passed by the time anyone submits.
 */
export function nextBookingBoundary(from: Date = new Date()): Date {
  return new Date((Math.floor(from.getTime() / BOUNDARY_MS) + 1) * BOUNDARY_MS);
}
