import { cache } from "react";

/**
 * One instant per server request, shared by every component that asks for it.
 *
 * The student dashboard measures "upcoming" against a `now` taken on the server
 * and passed down, so the server render and hydration cannot disagree about
 * which side of it a consultation falls on. Reading the clock straight into JSX
 * did that correctly but not *idempotently*, which is what `react-hooks/purity`
 * objects to: a component whose body calls `Date.now()` returns something
 * different every time it renders, and not re-rendering to a different answer is
 * the one thing React assumes of a render.
 *
 * `cache()` scopes the read to a single request, so any number of renders within
 * that request see the identical value - the property the rule is actually
 * protecting. Hiding the call behind a plain helper would silence the rule just
 * as well and leave the instability exactly where it was.
 *
 * This is *not* what keeps the instant out of the prerendered shell. `/protected`
 * reads cookies inside its Suspense boundary, and a request-time API is itself
 * the suspension point - so the shell never carried an instant, before this
 * change or after it. See `io()`'s "When you don't need io()".
 */
export const requestNow = cache(() => Date.now());
