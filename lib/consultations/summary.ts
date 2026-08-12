import type { ConsultationDto } from "@/lib/api/consultations";

/**
 * The student dashboard's arithmetic (docs/design/oli-learn.md §5).
 *
 * The student page fetches every one of that student's consultations, so these
 * are free passes over data already in hand. The admin view deliberately has no
 * equivalent: it is keyset-paginated at 25 rows, so a page knows nothing about
 * system totals, and an exact count over an RLS-filtered table is a full scan.
 */

export type ConsultationCounts = {
  /** Still `scheduled`, and still in the future. Both halves are required. */
  upcoming: number;
  /**
   * Still `scheduled`, but the time has been and gone. These fall outside all
   * three displayed counts, which is why the dashboard says so in a sentence
   * rather than adding a fourth number nobody can act on.
   */
  past: number;
  completed: number;
  cancelled: number;
};

const isUpcoming = (c: ConsultationDto, now: number) =>
  c.status === "scheduled" && new Date(c.scheduledAt).getTime() > now;

const hasPassed = (c: ConsultationDto, now: number) =>
  c.status === "scheduled" && new Date(c.scheduledAt).getTime() <= now;

/**
 * `now` is injected so the caller decides the instant once. Counting every
 * `scheduled` row as upcoming is the obvious way to get this wrong, and it is
 * silent - the number simply reads high.
 */
export function countConsultations(
  consultations: readonly ConsultationDto[],
  now: number = Date.now(),
): ConsultationCounts {
  return {
    upcoming: consultations.filter((c) => isUpcoming(c, now)).length,
    past: consultations.filter((c) => hasPassed(c, now)).length,
    completed: consultations.filter((c) => c.status === "completed").length,
    cancelled: consultations.filter((c) => c.status === "cancelled").length,
  };
}

/**
 * The soonest consultation still ahead of the viewer, which is what the "Next
 * up" card exists to answer. `undefined` when there is nothing upcoming - a
 * student with only past or cancelled rows gets no card rather than an empty
 * one.
 */
export function nextUpConsultation(
  consultations: readonly ConsultationDto[],
  now: number = Date.now(),
): ConsultationDto | undefined {
  return consultations
    .filter((c) => isUpcoming(c, now))
    .reduce<ConsultationDto | undefined>(
      (soonest, c) =>
        !soonest || new Date(c.scheduledAt) < new Date(soonest.scheduledAt)
          ? c
          : soonest,
      undefined,
    );
}
