import { describe, expect, it } from "vitest";

import { ADMIN_HOME, STUDENT_HOME, routeForRole } from "./role-routing";

describe("routeForRole", () => {
  describe("a student", () => {
    it("keeps their own dashboard", () => {
      expect(routeForRole(STUDENT_HOME, "student")).toEqual({ kind: "allow" });
    });

    it("cannot see that the admin view exists", () => {
      expect(routeForRole(ADMIN_HOME, "student")).toEqual({
        kind: "not-found",
      });
    });

    it("cannot reach a page nested under the admin view either", () => {
      expect(routeForRole(`${ADMIN_HOME}/anything`, "student")).toEqual({
        kind: "not-found",
      });
    });
  });

  describe("an admin", () => {
    it("is sent from the booking dashboard to the admin view", () => {
      expect(routeForRole(STUDENT_HOME, "admin")).toEqual({
        kind: "redirect",
        to: ADMIN_HOME,
      });
    });

    it("is sent there from the trailing-slash form too", () => {
      // Not a path the app can produce: Next 308s `/protected/` to `/protected`
      // before the proxy runs, verified over HTTP. This pins the function's
      // behaviour on the input, not a claim about the request.
      expect(routeForRole(`${STUDENT_HOME}/`, "admin")).toEqual({
        kind: "redirect",
        to: ADMIN_HOME,
      });
    });

    it("stays on the admin view rather than bouncing between the two", () => {
      // `/protected/admin` starts with `/protected`, so the order the two rules
      // are checked in is load-bearing: get it wrong and this is a loop.
      expect(routeForRole(ADMIN_HOME, "admin")).toEqual({ kind: "allow" });
    });

    it("is left alone on pages that are not the booking dashboard", () => {
      expect(routeForRole("/", "admin")).toEqual({ kind: "allow" });
      expect(routeForRole("/auth/login", "admin")).toEqual({ kind: "allow" });
    });
  });

  describe("a claim that is not `admin`", () => {
    // Only the exact string opens the admin view. A missing claim, a renamed
    // role, or anything else the token might carry is not an admin.
    it.each([undefined, null, "", "Admin", "ADMIN", "administrator", true, 1])(
      "%p is refused the admin view",
      (role) => {
        expect(routeForRole(ADMIN_HOME, role)).toEqual({ kind: "not-found" });
      },
    );
  });

  it("matches a route segment, not a string prefix", () => {
    // `/protected/administrators` is a different route from `/protected/admin`.
    // It does not exist today; the test is here so that adding it does not
    // silently inherit this rule, and so a future guard for it is written on
    // purpose. Nothing is exposed either way - RLS decides what it could read.
    expect(routeForRole("/protected/administrators", "student")).toEqual({
      kind: "allow",
    });
  });
});
