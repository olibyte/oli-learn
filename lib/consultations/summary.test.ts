import { describe, expect, it } from "vitest";

import type { ConsultationDto } from "@/lib/api/consultations";
import { countConsultations, nextUpConsultation } from "./summary";

const NOW = Date.parse("2026-08-13T00:00:00Z");
const hours = (n: number) => new Date(NOW + n * 3_600_000).toISOString();

let seq = 0;
function consultation(
  status: ConsultationDto["status"],
  scheduledAt: string,
): ConsultationDto {
  seq += 1;
  return {
    id: `c${seq}`,
    firstName: "Oliver",
    lastName: "Bennett",
    reason: "Methods — trigonometry",
    scheduledAt,
    status,
    createdAt: hours(-100),
    updatedAt: hours(-100),
  };
}

describe("counting consultations", () => {
  it("counts nothing for an empty list", () => {
    expect(countConsultations([], NOW)).toEqual({
      upcoming: 0,
      past: 0,
      completed: 0,
      cancelled: 0,
    });
  });

  it("requires both halves of 'upcoming': still scheduled, and in the future", () => {
    const counts = countConsultations(
      [
        consultation("scheduled", hours(24)),
        consultation("scheduled", hours(-24)),
        consultation("completed", hours(-48)),
        consultation("cancelled", hours(48)),
      ],
      NOW,
    );

    expect(counts.upcoming).toBe(1);
  });

  /**
   * The gap the design handles with a sentence instead of a fourth tile: a
   * still-scheduled row whose time has passed is in none of the three counts,
   * so they do not sum to the row count. That is intended, and this pins it.
   */
  it("leaves a passed-but-still-scheduled row out of all three counts", () => {
    const rows = [
      consultation("scheduled", hours(24)),
      consultation("scheduled", hours(-1)),
      consultation("completed", hours(-48)),
      consultation("cancelled", hours(-72)),
    ];
    const { upcoming, past, completed, cancelled } = countConsultations(
      rows,
      NOW,
    );

    expect(past).toBe(1);
    expect(upcoming + completed + cancelled).toBe(rows.length - past);
  });

  it("treats a consultation scheduled for exactly now as passed, not upcoming", () => {
    const counts = countConsultations([consultation("scheduled", hours(0))], NOW);

    expect(counts).toMatchObject({ upcoming: 0, past: 1 });
  });

  it("does not count a cancelled future consultation as upcoming", () => {
    const counts = countConsultations(
      [consultation("cancelled", hours(72))],
      NOW,
    );

    expect(counts).toMatchObject({ upcoming: 0, cancelled: 1 });
  });
});

describe("the next-up consultation", () => {
  it("is the soonest one still ahead, not merely the first in the list", () => {
    const soon = consultation("scheduled", hours(2));
    const later = consultation("scheduled", hours(48));

    expect(nextUpConsultation([later, soon], NOW)?.id).toBe(soon.id);
  });

  it("ignores rows that have passed, are completed, or are cancelled", () => {
    const upcoming = consultation("scheduled", hours(96));

    const found = nextUpConsultation(
      [
        consultation("scheduled", hours(-1)),
        consultation("completed", hours(-2)),
        consultation("cancelled", hours(1)),
        upcoming,
      ],
      NOW,
    );

    expect(found?.id).toBe(upcoming.id);
  });

  it("is undefined when nothing is upcoming, so no card is rendered", () => {
    expect(
      nextUpConsultation(
        [
          consultation("completed", hours(-5)),
          consultation("cancelled", hours(5)),
        ],
        NOW,
      ),
    ).toBeUndefined();
  });

  it("does not mutate the list it is given", () => {
    const rows = [
      consultation("scheduled", hours(48)),
      consultation("scheduled", hours(2)),
    ];
    const order = rows.map((c) => c.id);

    nextUpConsultation(rows, NOW);

    expect(rows.map((c) => c.id)).toEqual(order);
  });
});
