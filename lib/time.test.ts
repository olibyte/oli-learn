import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatTime,
  INSTITUTION_TIME_ZONE,
  zoneLabel,
} from "./time";

/**
 * These assertions are exact strings on purpose. Because the zone and locale
 * are both pinned, output does not depend on the machine running the test - so
 * dropping either option makes these fail everywhere except a machine that
 * happens to be set to Melbourne and en-AU (ADR-0004).
 */

// 9:30 am in Melbourne on a winter date: UTC+10, no DST.
const WINTER = "2026-08-14T23:30:00Z";
// 9:30 am in Melbourne on a summer date: UTC+11, DST in effect.
const SUMMER = "2026-01-14T22:30:00Z";

describe("the institutional clock", () => {
  it("is Melbourne", () => {
    expect(INSTITUTION_TIME_ZONE).toBe("Australia/Melbourne");
  });

  it("formats a winter instant in institution time", () => {
    expect(formatDate(WINTER)).toBe("15 Aug 2026");
    expect(formatTime(WINTER)).toBe("9:30 am");
  });

  it("formats a summer instant in institution time", () => {
    expect(formatDate(SUMMER)).toBe("15 Jan 2026");
    expect(formatTime(SUMMER)).toBe("9:30 am");
  });

  it("accepts a Date as readily as an ISO string", () => {
    expect(formatDate(new Date(WINTER))).toBe(formatDate(WINTER));
  });
});

describe("the zone label", () => {
  /**
   * The reason it is read from the formatter: a hard-coded "AEST" is wrong from
   * roughly October to April.
   */
  it("follows daylight saving rather than naming one fixed zone", () => {
    expect(zoneLabel(WINTER)).toBe("AEST");
    expect(zoneLabel(SUMMER)).toBe("AEDT");
  });

  it("labels the full form with the zone that applies to that instant", () => {
    expect(formatDateTime(WINTER)).toBe("15 Aug 2026, 9:30 am AEST");
    expect(formatDateTime(SUMMER)).toBe("15 Jan 2026, 9:30 am AEDT");
  });
});

describe("determinism", () => {
  /**
   * The property the admin view's zero-client-JS rendering depends on: one
   * instant has exactly one rendering, whatever the runtime's own defaults are.
   */
  it("renders an instant identically however it is expressed", () => {
    const asString = formatDateTime("2026-08-14T23:30:00.000Z");
    const asOffset = formatDateTime("2026-08-15T09:30:00+10:00");
    const asDate = formatDateTime(new Date(Date.UTC(2026, 7, 14, 23, 30)));

    expect(asOffset).toBe(asString);
    expect(asDate).toBe(asString);
  });
});
