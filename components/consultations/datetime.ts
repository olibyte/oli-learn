import { nextBookingBoundary } from "@/lib/consultations/booking-boundary";
import { formatDateTime } from "@/lib/time";

// `<input type="datetime-local">` yields a naive local string like
// "2030-06-01T14:30". The API requires an ISO timestamp with an offset, so the
// browser's own timezone does the conversion - which is also why timezone
// *selection* is out of scope: the user's device already answers it.

// Both attributes the picker needs travel together, because they are coupled:
// `step` counts *from* `min`, so re-export the interval beside the function
// that produces a `min` it can legally count from.
export { BOOKING_BOUNDARY_SECONDS } from "@/lib/consultations/booking-boundary";

export const toIsoFromLocalInput = (value: string) =>
  value ? new Date(value).toISOString() : "";

/** Pads a number to two digits for the datetime-local format. */
const pad = (n: number) => String(n).padStart(2, "0");

/** Renders an instant as the naive local string the input expects. */
const toLocalValue = (at: Date) =>
  `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;

/**
 * `min` for the picker: the next 15-minute boundary, in local time.
 *
 * It must land on a boundary, and that is not cosmetic. `step` on a
 * `datetime-local` is measured in seconds *from the step base*, which is `min`
 * whenever `min` is set - so a `min` of `14:37` would make `14:37`, `14:52`,
 * `15:07` the legal values and every genuinely legal time a step mismatch. The
 * rounding is what makes the grid line up with `:00`/`:15`/`:30`/`:45`.
 *
 * Rounding *up* also keeps `min` in the future, which the old truncate-to-minute
 * version did not: it returned the current minute, already partly spent.
 * The database enforces both rules regardless.
 */
export function localInputMin(from: Date = new Date()) {
  return toLocalValue(nextBookingBoundary(from));
}

/**
 * Prefills the reschedule picker with the consultation's existing time.
 *
 * Deliberately exact, not rounded: this is what the row currently says, and
 * silently moving it would show the student a time they never chose. A row
 * predating the boundary rule therefore prefills as a step mismatch, which is
 * the honest outcome - it cannot be rescheduled without being moved onto the
 * grid, and that is the rule doing its job.
 */
export function toLocalInput(iso: string) {
  return toLocalValue(new Date(iso));
}

/**
 * What the picker's current value means on the institution's clock, for the
 * echo shown beneath it (ADR-0004). The input keeps meaning the viewer's own
 * zone; this is what makes the difference legible rather than surprising.
 *
 * Returns null while there is nothing to echo. A `datetime-local` reports ""
 * when empty and can report a partial value mid-edit, so an unparseable string
 * is an ordinary state here, not an error - `Intl` would throw on it.
 */
export function institutionEcho(value: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return formatDateTime(at);
}
