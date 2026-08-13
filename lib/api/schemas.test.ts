import { describe, expect, it } from "vitest";

import { CreateConsultation, PatchConsultation, toFieldErrors } from "./schemas";

/** Future *and* on a 15-minute boundary - the schema now requires both. */
const future = () =>
  new Date(Math.ceil((Date.now() + 7 * 864e5) / 900_000) * 900_000).toISOString();
const offBoundary = () =>
  new Date(new Date(future()).getTime() + 60_000).toISOString();
const past = "2020-01-01T10:00:00.000Z";

const valid = () => ({
  firstName: "Ada",
  lastName: "Lovelace",
  reason: "Help with recursion",
  scheduledAt: future(),
});

describe("CreateConsultation", () => {
  it("accepts a well-formed booking", () => {
    expect(CreateConsultation.safeParse(valid()).success).toBe(true);
  });

  it("rejects a booking in the past", () => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      scheduledAt: past,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a naive timestamp with no offset", () => {
    // The DB stores timestamptz; an offset-less string is ambiguous, so the
    // schema requires one rather than guessing the caller's timezone.
    const result = CreateConsultation.safeParse({
      ...valid(),
      scheduledAt: "2030-06-01T14:30:00",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["firstName", ""],
    ["lastName", ""],
    ["reason", ""],
  ])("rejects an empty %s", (field, value) => {
    const result = CreateConsultation.safeParse({ ...valid(), [field]: value });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only text, not just empty strings", () => {
    const result = CreateConsultation.safeParse({ ...valid(), reason: "   " });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      firstName: "  Ada  ",
    });
    expect(result.success && result.data.firstName).toBe("Ada");
  });

  it.each([
    ["firstName", 101],
    ["lastName", 101],
    ["reason", 1001],
  ])("rejects %s over its column limit", (field, length) => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      [field]: "x".repeat(length),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields, so a client cannot smuggle in a status", () => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      status: "completed",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a time off the 15-minute grid", () => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      scheduledAt: offBoundary(),
    });
    expect(result.success).toBe(false);
  });

  it("names the rule in a message a student can act on", () => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      scheduledAt: offBoundary(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = toFieldErrors(result.error);
      expect(errors.map((e) => e.field)).toContain("scheduledAt");
      expect(errors.map((e) => e.message).join(" ")).toMatch(
        /:00, :15, :30 or :45/,
      );
    }
  });

  it("rejects stray seconds on an otherwise legal minute", () => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      scheduledAt: "2030-06-01T14:30:01.000Z",
    });
    expect(result.success).toBe(false);
  });

  it.each(["00", "15", "30", "45"])("accepts :%s", (minute) => {
    const result = CreateConsultation.safeParse({
      ...valid(),
      scheduledAt: `2030-06-01T14:${minute}:00.000Z`,
    });
    expect(result.success).toBe(true);
  });

  it("reports the offending field", () => {
    const result = CreateConsultation.safeParse({ ...valid(), reason: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).map((e) => e.field)).toContain("reason");
    }
  });
});

describe("PatchConsultation", () => {
  it.each(["scheduled", "completed", "cancelled"])(
    "accepts a status change to %s",
    (status) => {
      expect(PatchConsultation.safeParse({ status }).success).toBe(true);
    },
  );

  it("accepts a reschedule", () => {
    expect(PatchConsultation.safeParse({ scheduledAt: future() }).success).toBe(
      true,
    );
  });

  it("rejects a status and a reschedule together", () => {
    // Two strict object variants, so an ambiguous body is refused outright
    // rather than one field being silently dropped.
    const result = PatchConsultation.safeParse({
      status: "completed",
      scheduledAt: future(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(PatchConsultation.safeParse({}).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(PatchConsultation.safeParse({ status: "archived" }).success).toBe(
      false,
    );
  });

  it("rejects rescheduling into the past", () => {
    expect(PatchConsultation.safeParse({ scheduledAt: past }).success).toBe(
      false,
    );
  });

  it("rejects rescheduling off the 15-minute grid", () => {
    // Booking and rescheduling share `isoFuture`, so the two cannot drift.
    expect(
      PatchConsultation.safeParse({ scheduledAt: offBoundary() }).success,
    ).toBe(false);
  });
});
