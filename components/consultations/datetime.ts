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
