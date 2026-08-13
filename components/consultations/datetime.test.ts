import { describe, expect, it } from "vitest";

import { isOnBookingBoundary } from "@/lib/consultations/booking-boundary";
import { localInputMin, toIsoFromLocalInput, toLocalInput } from "./datetime";

// These assert properties rather than literal strings, because the functions
// return *local* time and the suite runs in whatever zone the machine is in.
// The properties hold in every real zone: offsets are whole multiples of 15
// minutes, so a local boundary is an absolute one.

describe("localInputMin", () => {
  it("lands on a 15-minute boundary, which is what makes `step` work", () => {
    // The regression this guards: `step` on a `datetime-local` counts from
    // `min`, so a `min` of 14:37 makes 14:37 / 14:52 / 15:07 the legal values
    // and every genuinely legal time a step mismatch. The old version returned
    // the current minute, whatever it happened to be.
    for (let minute = 0; minute < 60; minute++) {
      const from = new Date(2030, 5, 1, 14, minute, 37, 500);
      expect(isOnBookingBoundary(new Date(localInputMin(from)))).toBe(true);
    }
  });

  it("is strictly in the future, so the value it offers is bookable", () => {
    const from = new Date(2030, 5, 1, 14, 30, 0, 0);
    expect(new Date(localInputMin(from)).getTime()).toBeGreaterThan(
      from.getTime(),
    );
  });

  it("never rounds down, and never skips more than one block", () => {
    for (let minute = 0; minute < 60; minute++) {
      const from = new Date(2030, 5, 1, 14, minute, 0, 0);
      const min = new Date(localInputMin(from)).getTime();
      expect(min).toBeGreaterThan(from.getTime());
      expect(min - from.getTime()).toBeLessThanOrEqual(900_000);
    }
  });

  it("emits the zero-padded shape the input parses", () => {
    expect(localInputMin(new Date(2030, 0, 5, 9, 1))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("carries across an hour, a day and a year boundary", () => {
    expect(localInputMin(new Date(2030, 5, 1, 14, 52))).toBe("2030-06-01T15:00");
    expect(localInputMin(new Date(2030, 5, 1, 23, 52))).toBe("2030-06-02T00:00");
    expect(localInputMin(new Date(2030, 11, 31, 23, 52))).toBe(
      "2031-01-01T00:00",
    );
  });
});

describe("toLocalInput", () => {
  it("renders the row's own time exactly, without rounding it", () => {
    // Prefill must not silently move a consultation to a time the student
    // never chose. A pre-boundary-rule row therefore prefills as a step
    // mismatch, which is the honest outcome.
    const iso = new Date(2030, 5, 1, 14, 37).toISOString();
    expect(toLocalInput(iso)).toBe("2030-06-01T14:37");
  });

  it("round-trips a boundary time through the input and back", () => {
    const iso = new Date(2030, 5, 1, 14, 45).toISOString();
    expect(toIsoFromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(isOnBookingBoundary(iso)).toBe(true);
  });
});
