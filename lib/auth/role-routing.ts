/**
 * Where a role sends a request. One function, so the repo says it once.
 *
 * This is *routing*, not authorization. RLS is the boundary that decides what
 * anyone may read, and Next's docs are explicit that the proxy is not one. What
 * this decides is which page a signed-in user should be looking at, and it is
 * deliberately separate from the proxy so it can be tested without a request.
 *
 * Both directions matter, and they are the same decision seen from either end:
 * an Admin has no booking dashboard because an Admin does not book (CONTEXT.md:
 * "An Admin observes; they do not book"), and a Student has no admin view.
 */

/** The consultation table for every student. Admins land here. */
export const ADMIN_HOME = "/protected/admin";

/** The student's own consultations. Students land here. */
export const STUDENT_HOME = "/protected";

export type RoleRouting =
  /** Let the request through untouched. */
  | { kind: "allow" }
  /**
   * Render the not-found page with a 404. Not a 403: a 403 confirms the route
   * exists to someone who may not use it, which is the same stance the API
   * takes on rows you cannot see.
   */
  | { kind: "not-found" }
  /** Send the user to where their role belongs. */
  | { kind: "redirect"; to: string };

const ALLOW: RoleRouting = { kind: "allow" };

/**
 * Belt and braces, and measured as such: with the default `trailingSlash:
 * false`, Next answers `/protected/` with a 308 to `/protected` *before* the
 * proxy runs, so this branch is unreachable through the app as configured. It
 * stays because this function is unit-tested on bare strings and should be
 * total over them - and because flipping `trailingSlash` would make the slashed
 * form canonical, at which point the guard would need it. It does not stay
 * because the proxy sees both spellings today; it does not.
 */
function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * A route and everything nested under it - `/protected/admin` and
 * `/protected/admin/anything`, but not `/protected/admin-reports`, which is a
 * different route and gets its own decision rather than inheriting this one by
 * an accident of spelling.
 */
function isUnder(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * @param pathname the request path, without query string
 * @param role the `user_role` claim - `unknown` because it arrives off a
 *   decoded JWT, where anything absent or unexpected simply is not `"admin"`
 */
export function routeForRole(pathname: string, role: unknown): RoleRouting {
  const path = normalise(pathname);
  const isAdmin = role === "admin";

  // Checked first: the admin view is nested under the student one, so the
  // narrower rule has to win.
  if (isUnder(path, ADMIN_HOME)) {
    return isAdmin ? ALLOW : { kind: "not-found" };
  }

  // Only the dashboard itself, not everything under `/protected`. An admin is
  // being sent away from a page that offers them a "Book your first
  // consultation" button, not fenced out of a section of the app.
  if (isAdmin && path === STUDENT_HOME) {
    return { kind: "redirect", to: ADMIN_HOME };
  }

  return ALLOW;
}
