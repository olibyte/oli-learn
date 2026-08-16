/**
 * The one way to reach a human about this deployment.
 *
 * Two screens promise the same person on the other end and must not drift: the
 * landing page's request-access card, for a visitor with no account, and
 * `/auth/forgot-password`, for a visitor who has one and cannot get in. When it
 * was a `const` inside the card, the second screen had nowhere to import it
 * from.
 */
export const CONTACT_URL = "https://www.linkedin.com/in/olivercbennett";
