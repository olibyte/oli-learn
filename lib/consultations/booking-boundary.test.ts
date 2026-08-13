import { describe, expect, it } from "vitest";

import {
  BOOKING_BOUNDARY_SECONDS,
  isOnBookingBoundary,
  nextBookingBoundary,
} from "./booking-boundary";

describe("isOnBookingBoundary", () => {
  it.each(["00", "15", "30", "45"])("accepts :%s", (minute) => {
    expect(isOnBookingBoundary(`2030-06-01T14:${minute}:00.000Z`)).toBe(true);
  });

  it.each(["01", "07", "14", "16", "29", "31", "44", "46", "59"])(
    "rejects :%s",
    (minute) => {
      expect(isOnBookingBoundary(`2030-06-01T14:${minute}:00.000Z`)).toBe(false);
    },
  );

  it("rejects stray seconds on an otherwise legal minute", () => {
    expect(isOnBookingBoundary("2030-06-01T14:30:01.000Z")).toBe(false);
  });

  it("rejects stray milliseconds on an otherwise legal minute", () => {
    expect(isOnBookingBoundary("2030-06-01T14:30:00.001Z")).toBe(false);
  });

  it("accepts a Date as readily as a string", () => {
    expect(isOnBookingBoundary(new Date("2030-06-01T14:45:00.000Z"))).toBe(true);
  });

  it("treats an unparseable value as off the boundary, not as an error", () => {
    expect(isOnBookingBoundary("not a date")).toBe(false);
    expect(isOnBookingBoundary(Number.NaN)).toBe(false);
  });

  it("holds for a 45-minute UTC offset, the finest one in use", () => {
    // Nepal is +05:45, so a local :15 is an absolute :30. Both are boundaries -
    // this is why the check can ignore timezones entirely.
    expect(isOnBookingBoundary("2030-06-01T14:15:00+05:45")).toBe(true);
    expect(isOnBookingBoundary("2030-06-01T14:20:00+05:45")).toBe(false);
  });

  it("holds across a DST shift, in both directions", () => {
    // Melbourne is +11:00 in December and +10:00 in July; Lord Howe shifts by
    // 30 minutes, the narrowest anywhere. Neither can move a legal time off it.
    expect(isOnBookingBoundary("2030-12-01T09:15:00+11:00")).toBe(true);
    expect(isOnBookingBoundary("2030-07-01T09:15:00+10:00")).toBe(true);
    expect(isOnBookingBoundary("2030-07-01T09:15:00+10:30")).toBe(true);
  });

  it("handles instants before the epoch, where the modulo goes negative", () => {
    expect(isOnBookingBoundary("1969-06-01T14:30:00.000Z")).toBe(true);
    expect(isOnBookingBoundary("1969-06-01T14:37:00.000Z")).toBe(false);
  });
});

describe("nextBookingBoundary", () => {
  it("rounds up to the next boundary", () => {
    expect(
      nextBookingBoundary(new Date("2030-06-01T14:07:30.000Z")).toISOString(),
    ).toBe("2030-06-01T14:15:00.000Z");
  });

  it("moves on rather than standing still when already on one", () => {
    // A consultation must be in the *future*, so returning 14:30 here would
    // hand back a time that has already passed by the time anyone submits.
    expect(
      nextBookingBoundary(new Date("2030-06-01T14:30:00.000Z")).toISOString(),
    ).toBe("2030-06-01T14:45:00.000Z");
  });

  it("carries into the next hour", () => {
    expect(
      nextBookingBoundary(new Date("2030-06-01T14:52:00.000Z")).toISOString(),
    ).toBe("2030-06-01T15:00:00.000Z");
  });

  it("always returns something strictly later, and on a boundary", () => {
    for (let offset = 0; offset < 900_000; offset += 7_919) {
      const from = new Date(Date.UTC(2030, 5, 1, 14, 0, 0) + offset);
      const next = nextBookingBoundary(from);
      expect(next.getTime()).toBeGreaterThan(from.getTime());
      expect(isOnBookingBoundary(next)).toBe(true);
    }
  });
});

describe("BOOKING_BOUNDARY_SECONDS", () => {
  it("is what the input's step attribute needs", () => {
    // `step` on `datetime-local` is measured in seconds, and staying a whole
    // multiple of 60 is what keeps the control at minute precision.
    expect(BOOKING_BOUNDARY_SECONDS).toBe(900);
    expect(BOOKING_BOUNDARY_SECONDS % 60).toBe(0);
  });
});
