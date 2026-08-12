/**
 * One institutional clock, authoritative for display (ADR-0004).
 *
 * `scheduled_at` is `timestamptz`, so the *instant* was never in question. What
 * was in question is the wall-clock time each viewer is shown: the student list
 * formatted in the browser's zone while the admin view - a pure Server
 * Component - formatted in the server's, which is UTC on Vercel. One
 * consultation read as two different times depending on who opened it.
 *
 * Every call site here pins **both** the zone and the locale. `undefined` as a
 * locale asks each runtime for its own defaults, and that is the entire bug;
 * naming both makes rendering deterministic, which is what lets the admin view
 * stay a Server Component with no client JavaScript.
 *
 * Booking is the deliberate exception: `<input type="datetime-local">` keeps
 * meaning the viewer's own clock, with an echo showing the institutional
 * equivalent. Converting a naive string to an instant in a named zone has real
 * DST edge cases twice a year - times that never occur, and times that occur
 * twice - and leaving that with the browser leaves it where it is solved.
 */

export const INSTITUTION_TIME_ZONE = "Australia/Melbourne";
export const INSTITUTION_LOCALE = "en-AU";

/**
 * How to name the clock in prose, where no particular instant is in view.
 *
 * Deliberately not an abbreviation. `AEST` and `AEDT` each describe an offset
 * that applies for part of the year, so a standing sentence cannot use either
 * without being wrong for the other part; the zone itself is what is true all
 * year. Times on screen still carry the abbreviation for their own instant,
 * which is where it actually disambiguates something.
 */
export const INSTITUTION_TIME_ZONE_NAME = "Melbourne time";

const dateFormat = new Intl.DateTimeFormat(INSTITUTION_LOCALE, {
  timeZone: INSTITUTION_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat(INSTITUTION_LOCALE, {
  timeZone: INSTITUTION_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const zoneFormat = new Intl.DateTimeFormat(INSTITUTION_LOCALE, {
  timeZone: INSTITUTION_TIME_ZONE,
  timeZoneName: "short",
});

/** `14 Aug 2026` */
export const formatDate = (at: string | Date): string =>
  dateFormat.format(new Date(at));

/** `9:30 am` */
export const formatTime = (at: string | Date): string =>
  timeFormat.format(new Date(at));

/**
 * The zone abbreviation for a given instant, read from the formatter rather
 * than hard-coded - Melbourne is `AEST` in winter and `AEDT` in summer, so any
 * fixed string is wrong for roughly half the year.
 */
export function zoneLabel(at: string | Date): string {
  const parts = zoneFormat.formatToParts(new Date(at));
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
}

/** `14 Aug 2026, 9:30 am AEST` - the full labelled form. */
export const formatDateTime = (at: string | Date): string =>
  `${formatDate(at)}, ${formatTime(at)} ${zoneLabel(at)}`;
