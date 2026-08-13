import { describe, expect, it } from "vitest";

import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  passwordProblem,
} from "./password";

describe("passwordProblem", () => {
  it("accepts a password at exactly the minimum", () => {
    expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects one character short, and says the number", () => {
    const problem = passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1));
    expect(problem).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("rejects the old six-character floor", () => {
    // The value this project shipped with, kept as a test so a regression in
    // config.toml and a regression here cannot pass each other silently.
    expect(passwordProblem("abc123")).not.toBeNull();
  });

  it("does not impose composition rules", () => {
    // Length is the whole rule - no uppercase, digit or symbol requirement.
    expect(passwordProblem("correcthorsebatterystaple")).toBeNull();
  });

  it("accepts a password at exactly the byte ceiling", () => {
    expect(passwordProblem("a".repeat(MAX_PASSWORD_BYTES))).toBeNull();
  });

  it("rejects one byte over the ceiling", () => {
    expect(passwordProblem("a".repeat(MAX_PASSWORD_BYTES + 1))).not.toBeNull();
  });

  it("counts bytes rather than characters at the ceiling", () => {
    // 24 four-byte emoji are 24 characters but 96 bytes, so this is over the
    // limit even though `.length` says it is comfortably under it.
    const emoji = "🔒".repeat(24);
    expect(emoji.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(passwordProblem(emoji)).toContain("bytes");
  });
});
