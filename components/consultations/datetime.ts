import { formatDateTime } from "@/lib/time";

// `<input type="datetime-local">` yields a naive local string like
// "2030-06-01T14:30". The API requires an ISO timestamp with an offset, so the
// browser's own timezone does the conversion - which is also why timezone
// *selection* is out of scope: the user's device already answers it.

export const toIsoFromLocalInput = (value: string) =>
  value ? new Date(value).toISOString() : "";

/** Pads a number to two digits for the datetime-local format. */
const pad = (n: number) => String(n).padStart(2, "0");

/** `min` for the picker: now, in local time. The DB enforces this regardless. */
export function localInputMin(from: Date = new Date()) {
  return `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}T${pad(from.getHours())}:${pad(from.getMinutes())}`;
}

/** Prefills the reschedule picker with the consultation's existing time. */
export function toLocalInput(iso: string) {
  return localInputMin(new Date(iso));
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
