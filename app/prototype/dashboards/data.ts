/**
 * PROTOTYPE — throwaway. Ticket #24. Fake rows, shaped like the real DTO.
 *
 * The asymmetry this prototype exists to expose: the **student** dashboard
 * fetches every one of that student's consultations (`app/protected/page.tsx`
 * has no `limit`), so any tile is free arithmetic over data already in hand.
 * The **admin** view is keyset-paginated at 25 rows (`PAGE_SIZE`, and the
 * `(scheduled_at desc, id desc)` index exists precisely to walk it), so a page
 * knows nothing about the system totals.
 */

export type Row = {
  id: string;
  firstName: string;
  lastName: string;
  reason: string;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled";
  student?: string;
};

const iso = (days: number, hour: number, minute = 0) => {
  const d = new Date("2026-08-13T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  // Melbourne is UTC+10 in August (AEST, no DST).
  d.setUTCHours(hour - 10, minute, 0, 0);
  return d.toISOString();
};

export const STUDENT_ROWS: Row[] = [
  {
    id: "1",
    firstName: "Oliver",
    lastName: "Bennett",
    reason: "Methods — trigonometry before Friday's SAC",
    scheduledAt: iso(1, 9, 30),
    status: "scheduled",
  },
  {
    id: "2",
    firstName: "Oliver",
    lastName: "Bennett",
    reason: "Specialist — complex numbers, second pass",
    scheduledAt: iso(6, 16),
    status: "scheduled",
  },
  {
    id: "3",
    firstName: "Oliver",
    lastName: "Bennett",
    reason: "Chemistry — rates and equilibrium, exam technique",
    scheduledAt: iso(-4, 11),
    status: "completed",
  },
  {
    id: "4",
    firstName: "Oliver",
    lastName: "Bennett",
    reason: "Methods — probability, everything I got wrong in the practice exam",
    scheduledAt: iso(-11, 15, 30),
    status: "completed",
  },
  {
    // The state that forces "upcoming" to be defined properly: still scheduled,
    // but its time has passed. It is not upcoming, and it is not completed.
    id: "6",
    firstName: "Oliver",
    lastName: "Bennett",
    reason: "English — text response structure",
    scheduledAt: iso(-1, 14),
    status: "scheduled",
  },
  {
    id: "5",
    firstName: "Oliver",
    lastName: "Bennett",
    reason: "Physics — motion, could not make it",
    scheduledAt: iso(-2, 10),
    status: "cancelled",
  },
];

const NAMES = [
  ["Amara", "Okafor"],
  ["Wei", "Zhang"],
  ["Priya", "Nair"],
  ["Tom", "Callaghan"],
  ["Sofia", "Marchetti"],
];

export const ADMIN_ROWS: Row[] = Array.from({ length: 8 }, (_, i) => {
  const [firstName, lastName] = NAMES[i % NAMES.length];
  const statuses = ["scheduled", "completed", "cancelled"] as const;
  return {
    id: `a${i}`,
    firstName,
    lastName,
    reason: [
      "Methods — trigonometry before Friday's SAC",
      "English — text response structure",
      "Chemistry — rates and equilibrium",
      "Specialist — complex numbers",
      "Biology — genetics revision",
    ][i % 5],
    scheduledAt: iso(3 - i, 9 + (i % 6), i % 2 ? 30 : 0),
    status: statuses[i % 3],
    student: `${firstName.toLowerCase()}@example.com`,
  };
});

/** ADR-0004: one institutional clock, zone and locale both pinned. */
export const TZ = "Australia/Melbourne";
const dateFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));

/** The zone abbreviation, taken from the formatter rather than hard-coded. */
export function zoneLabel(iso: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/**
 * "Upcoming" needs both halves of the definition: still `scheduled`, and in the
 * future. A scheduled consultation whose time has passed is not upcoming, and
 * counting it as such is the obvious way to get this wrong.
 */
export const counts = (rows: Row[], now = Date.now()) => ({
  upcoming: rows.filter(
    (r) => r.status === "scheduled" && new Date(r.scheduledAt).getTime() > now,
  ).length,
  past: rows.filter(
    (r) => r.status === "scheduled" && new Date(r.scheduledAt).getTime() <= now,
  ).length,
  completed: rows.filter((r) => r.status === "completed").length,
  cancelled: rows.filter((r) => r.status === "cancelled").length,
  total: rows.length,
});

export const nextUp = (rows: Row[], now = Date.now()) =>
  rows
    .filter((r) => r.status === "scheduled" && new Date(r.scheduledAt).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )[0];
