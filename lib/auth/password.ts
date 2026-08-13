/**
 * The password rule, written once.
 *
 * The authoritative check is GoTrue's, configured in `supabase/config.toml`
 * (`minimum_password_length`). Everything here is a *client-side hint* so a user
 * is told before submitting rather than after — it is not a security boundary
 * and must never be the only thing enforcing the rule. Keep it in step with the
 * config; the README's Security model records why the numbers are what they are.
 */

/**
 * Length, not composition, is the rule. NIST SP 800-63B advises against forced
 * character classes - they push people towards `Password1!` and its cousins,
 * which is predictable in exactly the way the rule was meant to prevent - and
 * towards a longer minimum instead. `password_requirements` is deliberately left
 * empty in the config for the same reason.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * bcrypt truncates at 72 bytes and GoTrue checks that ceiling *before* the
 * minimum, so a password past it is rejected outright rather than silently cut.
 * Bytes, not characters: one emoji spends four of them.
 */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Returns a message to show the user, or `null` when the password is acceptable.
 * Deliberately not a boolean - every caller needs the reason, not just the fact.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `Password is too long. The limit is ${MAX_PASSWORD_BYTES} bytes, and accented or emoji characters count as more than one.`;
  }

  return null;
}
