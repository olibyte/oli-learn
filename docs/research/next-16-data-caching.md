# Next.js 16.3.0 — data fetching & caching for an auth-gated, per-user dashboard

**Research ticket:** #2
**Next.js version verified:** `16.3.0` (`node_modules/next/package.json`)
**Primary source:** the docs bundled inside the installed package at
`/Users/oliverbennett/with-supabase-app/node_modules/next/dist/docs/`.
Every claim below cites the doc file it came from, relative to that directory.
Where the docs were silent or ambiguous, this is flagged explicitly under
[Open questions](#open-questions).

---

## TL;DR — the seven things that actually matter

1. **`cacheComponents: true` is already enabled** in this repo's `next.config.ts`.
   Every conclusion below is conditioned on that. It is not a neutral flag: it
   turns on Partial Prerendering, changes the default rendering model, and
   **removes** the `dynamic` / `revalidate` / `fetchCache` route segment configs.
2. **Do not cache per-user data with `use cache`.** `use cache` is a shared,
   cross-request server cache. It also *cannot* read `cookies()`/`headers()`,
   which is precisely how the Supabase session is resolved — so the framework
   physically blocks the most dangerous mistake for you.
3. **There is nothing to "turn off."** Under Cache Components, uncached is the
   default. `export const dynamic = 'force-dynamic'`, `unstable_noStore()`, and
   `fetchCache` are all obsolete — the correct way to declare "never cache this"
   is simply *not adding a cache directive*, and wrapping the read in `<Suspense>`.
4. **Route handler signature:** `params` is a `Promise` and must be awaited.
   Prefer the globally-available generated `RouteContext<'/path/[id]'>` helper.
5. **`proxy.ts` is session refresh + optimistic redirect only.** It is explicitly
   *not* an authorization boundary. Real authz belongs in RLS + a re-check in
   each route handler.
6. **No Server Actions in this app means `updateTag()` and `refresh()` are
   unavailable** — both throw outside a Server Action. Mutating route handlers
   must use `revalidateTag(tag, 'max')`, which now takes a **mandatory second
   argument**.
7. **`io()` is new in 16.3.0** and is now the preferred replacement for
   `connection()`.

---

## 1. Do Cache Components / `use cache` / `cacheLife` / `cacheTag` apply here?

### 1.1 Cache Components is already on in this repo

`/Users/oliverbennett/with-supabase-app/next.config.ts` currently reads:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

This matters more than it looks. Per
`01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`:

> Cache Components enables component and function-level caching using the
> `use cache` directive. Data fetching is dynamic by default, and you choose what
> to cache at the page, component, or function level.

and:

> Additionally, `cacheComponents` implements **Partial Prerendering (PPR)** as the
> default behavior in the App Router.

The version-16 upgrade guide is blunt that this is not a cosmetic flag
(`01-app/02-guides/upgrading/version-16.md`):

> Enabling `cacheComponents` is not a rename-only change: it can surface build
> errors for uncached data outside of `<Suspense>` and requires adopting the
> Cache Components model.

**Consequence for this app:** every route is dynamic by default and every
uncached or runtime data access must sit behind a `<Suspense>` boundary, or the
dev overlay raises a validation insight.

### 1.2 Answer: user-scoped authenticated data is categorically the wrong thing to put in `use cache`

Three independent facts from the docs establish this.

**(a) `use cache` is a shared cache keyed only on inputs, not on identity.**
From `01-app/03-api-reference/01-directives/use-cache.md`, the cache key is:

> 1. **Build ID** … 2. **Function ID** … 3. **Serializable arguments** — Props
> (for components) or function arguments 4. **HMR refresh hash** (development only)

There is no implicit per-user or per-session component to the key. If two users
call the same cached function with the same arguments, **they get the same entry**.
That is the leak.

**(b) `use cache` cannot read the session at all.** Same file, "Constraints →
Request-time APIs":

> Cached functions and components **cannot** access runtime APIs like `cookies()`,
> `headers()`, or `searchParams`, and the restriction follows the call stack: a
> helper the cached function calls that reads one of these fails the same way,
> with the `next-request-in-use-cache` error.

Note the "follows the call stack" clause — this is the important one for us.
`lib/supabase/server.ts` calls `await cookies()` inside `createClient()`. So
`'use cache'` anywhere above a Supabase server-client call **throws**, even
though the `cookies()` call is several frames down. The framework enforces the
correct behaviour here; you cannot accidentally cache a Supabase read.

That same section adds a nasty deployment-timing caveat worth internalising:

> On a dynamically rendered route this surfaces when the route runs, so it can
> pass `next build` and fail under `next start`.

**(c) Where cached content is stored is not private.** From
`01-app/01-getting-started/08-caching.md` ("Where cached content is stored"), a
cached payload can end up as prerendered HTML on disk/CDN, in a shared
cross-instance store, or in the browser. None of those are per-user-safe for
authenticated LMS data.

### 1.3 What about `use cache: private`?

16.x ships a third directive specifically for runtime-dependent data:
`01-app/03-api-reference/01-directives/use-cache-private.md`.

> The `'use cache: private'` directive allows functions to access runtime request
> APIs like `cookies()`, `headers()`, and `searchParams` within a cached scope.
> However, results are **never stored on the server**, they're cached only in the
> browser's memory and do not persist across page reloads.

It permits `cookies()`/`headers()`/`searchParams` (see the allow-table in that
file), which `use cache` does not.

**Recommendation: do not adopt it for this dashboard, at least not initially.**
Reasons, all sourced:

- The docs frame it as a fallback, not a default. Same file: reach for it when
  refactoring to pass values as arguments "is not practical", or when
  "Compliance requirements prevent storing certain data on the server".
  `use-cache.md` reinforces: "Very rarely, for compliance requirements or when you
  can't refactor your code…".
- **It is not available in Route Handlers.** `use-cache-private.md`:
  "> **Good to know**: This directive is not available in Route Handlers."
- It introduces a browser-memory cache of user data with a timing window. For a
  booking/consultation flow where a student expects to see their own change
  immediately, a stale client cache is a correctness bug, not an optimisation.
- It only pays off in combination with runtime prefetching, which is extra
  machinery this app has not adopted.

If it is ever adopted, note the threshold from that file: `stale` must be ≥ 30s
for runtime prefetching, and ≥ 5 min to reach the App Shell.

### 1.4 The correct way to declare "do not cache" in 16.3

**There is no opt-out flag, because there is no opt-in by default.** From
`01-app/02-guides/migrating-to-cache-components.md`:

| Old (Next 14/15)              | 16.3 with Cache Components                                    |
| ----------------------------- | ------------------------------------------------------------- |
| `export const dynamic = 'force-dynamic'` | **"Not needed.** All pages are dynamic by default." |
| `export const revalidate = N` | Replace with `cacheLife` inside a `use cache` scope            |
| `export const fetchCache`     | **"Not needed."**                                             |
| `unstable_noStore()` / `noStore()` | **"Not needed.** … With Cache Components, nothing is cached unless you add `use cache`, so you can remove it." |
| `export const experimental_ppr = true` | Removed; `cacheComponents` supersedes it             |

And these are not merely redundant — they are **removed and will error**. From
`01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`,
Version History:

> `v16.0.0` — `dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed
> when Cache Components is enabled.

Confirmed by `migrating-to-cache-components.md`:

> After enabling the flag, route segments that still export `dynamic`,
> `revalidate`, or `fetchCache` will error.

**So the answer to "how do I declare caching off?" is: write no cache directive,
and wrap the read in `<Suspense>`.** That is the whole mechanism.

The remaining surviving segment config options are only
`dynamicParams`, `runtime`, `preferredRegion` (deprecated), and `maxDuration`
(same index file).

### 1.5 Where `cacheTag` / `cacheLife` *would* legitimately apply in a mini-LMS

They are not useless here — they apply to genuinely shared, non-user-scoped data.
Candidates in this domain:

- Course catalogue / module listings identical for all students
- Consultation slot *templates* or tutor availability windows (not bookings)
- Static marketing content on the landing page

Shape for those, per `01-app/01-getting-started/08-caching.md` and
`01-app/03-api-reference/04-functions/cacheLife.md`:

```ts
// lib/data/catalogue.ts  — SHARED data only. No session, no user id.
import { cacheLife, cacheTag } from "next/cache";

export async function getCourseCatalogue() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");

  // Must use a NON-session Supabase client here (see §4.4) —
  // calling cookies() inside this scope throws.
  return fetchCatalogueWithServiceRole();
}
```

`cacheLife` guidance worth following (`04-functions/cacheLife.md`):

> We recommend setting a `cacheLife` in every `use cache` scope so its behavior is
> clear at the call site.

Preset profiles from that file:

| Profile   | `stale`    | `revalidate` | `expire` |
| --------- | ---------- | ------------ | -------- |
| `default` | 5 min      | 15 min       | never    |
| `seconds` | 30 s       | 1 s          | 1 min    |
| `minutes` | 5 min      | 1 min        | 1 hour   |
| `hours`   | 5 min      | 1 hour       | 1 day    |
| `days`    | 5 min      | 1 day        | 1 week   |
| `weeks`   | 5 min      | 1 week       | 30 days  |
| `max`     | 5 min      | 30 days      | 1 year   |

Also from that file — a real trap: nesting a short-lived `use cache` inside one
**without** an explicit `cacheLife` throws during prerendering, and the nested
cache may live in an imported module or a third-party dependency.

---

## 2. Route Handler conventions in `app/api/`

### 2.1 Exact signature

From `01-app/03-api-reference/03-file-conventions/route.md`. Supported methods:
`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`. An undefined method
returns `405` automatically
(`01-app/01-getting-started/15-route-handlers.md`), and `OPTIONS` is synthesised
with a correct `Allow` header if you don't define it.

### 2.2 `params` is async — confirmed

Yes. `route.md`, "context (optional)":

> **`params`**: a promise that resolves to an object containing the dynamic route
> parameters for the current route.

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string }> }
) {
  const { team } = await params;
}
```

The version history in that file dates this to `v15.0.0-RC`, and
`01-app/02-guides/upgrading/version-16.md` confirms the Next 15 synchronous
compatibility shim is **fully removed in 16**:

> Starting with **Next.js 16**, synchronous access is fully removed. These APIs
> can only be accessed asynchronously. — `cookies`, `headers`, `draftMode`,
> `params` in `layout.js`, `page.js`, `route.js` …, `searchParams` in `page.js`

### 2.3 Preferred typing — use the generated `RouteContext` helper

Both `route.md` and `15-route-handlers.md` document a globally-available typegen
helper. This is the idiomatic 16.x form and avoids hand-writing the Promise type:

```ts
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/users/[id]">) {
  const { id } = await ctx.params;
  return Response.json({ id });
}
```

> **Good to know** — Types are generated during `next dev`, `next build` or
> `next typegen`. After type generation, the `RouteContext` helper is globally
> available. It doesn't need to be imported. — `route.md`

### 2.4 `Request` vs `NextRequest`

Both are valid. `route.md`:

> The `request` object is a `NextRequest` object, which is an extension of the Web
> `Request` API. `NextRequest` gives you further control over the incoming
> request, including easily accessing `cookies` and an extended, parsed, URL
> object `nextUrl`.

`01-app/02-guides/backend-for-frontend.md` adds:

> You can pass `NextRequest` to any function expecting `Request`. Likewise, you
> can return `NextResponse` where a `Response` is expected.

**Recommendation for this app:** type as `NextRequest` when you need `nextUrl`
or `request.cookies`; plain `Request` is fine otherwise. Return `Response.json()`
for ordinary payloads and `NextResponse` when you need cookie/redirect helpers.

### 2.5 Reading the Supabase session inside a handler — the correct shape

The repo's `lib/supabase/server.ts` `createClient()` uses `cookies()` from
`next/headers`, which is fully supported in route handlers (`route.md`,
"Cookies" example). It also already handles the Server-Component write case by
swallowing the `setAll` error.

Combining the Next.js auth guidance
(`01-app/02-guides/authentication.md`, "Route Handlers") with the project's
RLS-plus-recheck architecture:

```ts
// app/api/bookings/[id]/route.ts
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/bookings/[id]">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  // 1. Authentication. Never trust the proxy for this (see §3).
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    return new Response(null, { status: 401 });
  }

  // 2. Validate the body before it reaches the DB.
  const body = await request.json();
  const parsed = BookingPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  // 3. Mutate. RLS is the real authorization boundary; this call is
  //    executed as the signed-in user, so a row they don't own returns 0 rows.
  const { data: updated, error: dbError } = await supabase
    .from("bookings")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  // 4. Double-check: RLS returning nothing is an authz failure, not a 500.
  if (dbError || !updated) {
    return new Response(null, { status: 403 });
  }

  return Response.json({ booking: updated });
}
```

Doc support for each step:

- Two-tier auth check (401 then 403) is exactly the pattern in
  `02-guides/authentication.md` → "Route Handlers".
- "Treat Route Handlers with the same security considerations as public-facing
  API endpoints" — same file.
- Input validation: `02-guides/backend-for-frontend.md` → "Verify payloads"
  ("Never trust incoming request data"), and `02-guides/data-security.md` →
  "Validating client input".
- Ownership checks prevent IDOR — `02-guides/data-security.md` explicitly names
  Insecure Direct Object Reference as the risk.
- Don't leak internals in errors: "Avoid exposing sensitive information in error
  messages sent to the client" — `backend-for-frontend.md`.
- `request.json()` can only be read once; `clone()` if needed — same file.

### 2.6 Caching in route handlers under Cache Components

`GET` handlers now behave like pages
(`01-app/01-getting-started/15-route-handlers.md` → "With Cache Components"):

> When Cache Components is enabled, `GET` Route Handlers follow the same model as
> normal UI routes in your application. They run at request time by default, can
> be prerendered when they don't access uncached or runtime data…

Prerendering stops as soon as the handler touches request data — the list is
explicit in that file: network requests, database queries, async fs operations,
`req.url`, `request.headers`, `request.cookies`, `request.body`, `cookies()`,
`headers()`, `connection()`, or non-deterministic operations.

**For this app every `app/api/` handler reads the session, so all of them are
request-time. Nothing to configure.**

One syntax constraint if a handler ever serves shared data
(`15-route-handlers.md`):

> `use cache` cannot be used directly inside a Route Handler body; extract it to a
> helper function.

And a build-noise gotcha from `migrating-to-cache-components.md`:

> Reading uncached or runtime data in a `GET` handler bails out of prerendering by
> **throwing**. A `try/catch` you already have around other operations will catch
> that bail-out. If the `catch` block logs the error, it adds noise to the build
> output. Set `experimental.hideLogsAfterAbort: true` to hide logs emitted after a
> bail-out.

This is a real hazard for the defensive `try/catch` style in §2.5 — a broad catch
will swallow the framework's own control-flow throw.

---

## 3. What `proxy.ts` can and cannot do in 16.3

### 3.1 The rename and the runtime

`01-app/01-getting-started/16-proxy.md`:

> Starting with Next.js 16, Middleware is now called Proxy to better reflect its
> purpose. The functionality remains the same.

`01-app/03-api-reference/03-file-conventions/proxy.md` version history:

> `v16.0.0` — Middleware is deprecated and renamed to Proxy. Proxy defaults to the
> Node.js runtime

And critically:

> Proxy defaults to using the Node.js runtime. The `runtime` config option is
> **not available** in Proxy files. Setting the `runtime` config option in Proxy
> will throw an error.

The upgrade guide adds that edge is simply gone here
(`02-guides/upgrading/version-16.md`): "The `edge` runtime is **NOT** supported in
`proxy`." This is good news for Supabase — the Node runtime removes the old
edge-compatibility friction, and `02-guides/authentication.md` explicitly notes:
"Proxy uses the Node.js runtime, check if your Auth library and session
management library are compatible."

The repo's `proxy.ts` already exports a named `proxy` function, which matches the
required convention (`proxy.md`: "The file must export a single function, either
as a default export or named `proxy`").

### 3.2 It is NOT an authorization boundary — this is stated repeatedly

This is the single most emphasised point across the 16.3 docs.

`01-app/01-getting-started/16-proxy.md`:

> Proxy is _not_ intended for slow data fetching. While Proxy can be helpful for
> **optimistic checks** such as permission-based redirects, **it should not be used
> as a full session management or authorization solution.**

`01-app/02-guides/authentication.md`:

> However, since Proxy runs on every route, including prefetched routes, it's
> important to only read the session from the cookie (optimistic checks), and
> avoid database checks to prevent performance issues.

> While Proxy can be useful for initial checks, **it should not be your only line
> of defense in protecting your data.** The majority of security checks should be
> performed as close as possible to your data source.

`01-app/02-guides/backend-for-frontend.md`:

> Always verify credentials before granting access. **Do not rely on proxy alone
> for authentication and authorization.**

And a specific structural failure mode from
`03-api-reference/03-file-conventions/proxy.md` → "Execution order":

> A matcher change or a refactor that moves a Server Function to a different route
> can silently remove Proxy coverage. Always verify authentication and
> authorization inside each Server Function rather than relying on Proxy alone.

There is also an architectural warning that makes proxy unreliable as a security
gate by design (`proxy.md`):

> Proxy is meant to be invoked separately of your render code and **in optimized
> cases deployed to your CDN** for fast redirect/rewrite handling, you should not
> attempt relying on shared modules or globals.

**Verdict: `proxy.ts` in this app should do exactly two things — refresh the
Supabase session cookie, and perform an optimistic redirect of logged-out users
to `/auth/login`. That is precisely what `lib/supabase/proxy.ts` does today.
It is correct. Do not add authorization logic to it.**

### 3.3 Is the existing global-deny matcher still the recommended shape?

**Yes.** The current matcher in `/Users/oliverbennett/with-supabase-app/proxy.ts`:

```
"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
```

This matches the documented recommendation. `proxy.md` → "Matcher":

> Without a `matcher`, Proxy runs on **every request**, including static files
> (`_next/static`), image optimizations (`_next/image`), and assets in the
> `public/` folder. Consider using a negative match pattern to exclude these
> paths, otherwise auth logic or redirects can unintentionally block CSS, JS, or
> images from loading.

And `02-guides/authentication.md` is explicit that broad coverage is *wanted* for
auth:

> You can use the `matcher` property in the Proxy to specify which routes Proxy
> should run on. Although, **for auth, it's recommended Proxy runs on all routes.**

Two refinements worth knowing, both from `proxy.md`:

- **Do not exclude `/api` from the matcher** if you want session cookie refresh on
  API calls. The doc's sample matchers often exclude `api`, and
  `02-guides/authentication.md` uses
  `['/((?!api|_next/static|_next/image|.*\\.png$).*)']`. **The current repo matcher
  deliberately does *not* exclude `api`, which is the safer choice here** given
  every mutation goes through `app/api/`. Keep it that way.
- `_next/data` cannot be escaped even if you try:

  > Even when `_next/data` is excluded in a negative matcher pattern, proxy will
  > still be invoked for `_next/data` routes. This is intentional behavior to
  > prevent accidental security issues where you might protect a page but forget
  > to protect the corresponding data route.

**One caveat on the current implementation.** `lib/supabase/proxy.ts` treats any
path that is not `/`, `/login*`, or `/auth*` as protected. Since the matcher also
covers `/api/*`, an unauthenticated API call currently receives a **302 redirect
to `/auth/login`** rather than a `401`. For a JSON API that is a poor contract —
`fetch` will follow the redirect and the client will parse an HTML login page as
JSON. `proxy.md` → "Producing a response" documents the fix, returning JSON
directly:

```ts
if (!isAuthenticated(request)) {
  return Response.json(
    { success: false, message: "authentication failed" },
    { status: 401 }
  );
}
```

Recommend branching on `pathname.startsWith("/api")` to return 401 JSON instead
of a redirect. **This is a behavioural observation about the current code, not a
Next.js requirement.**

### 3.4 Cookie handling contract

`lib/supabase/proxy.ts` carries the standard Supabase warning about returning
`supabaseResponse` unmodified. Next's own docs corroborate why this is delicate —
`proxy.md` distinguishes:

> - `NextResponse.next({ request: { headers: requestHeaders } })` to make
>   `requestHeaders` available **upstream**
> - **NOT** `NextResponse.next({ headers: requestHeaders })` which makes
>   `requestHeaders` available **to clients**

Getting this backwards leaks headers to the browser. The existing code uses the
correct `{ request }` form.

---

## 4. Caching / revalidation semantics for never-shared Server Component reads

### 4.1 The required shape

Under Cache Components the rule is mechanical: **uncached data and runtime APIs
must be inside a `<Suspense>` boundary.** From
`01-app/01-getting-started/08-caching.md`:

> For components that fetch data from an asynchronous source such as an API, a
> database, or any other async operation, and require fresh data on every request,
> **do not use `"use cache"`.** Instead, wrap the component in `<Suspense>` and
> provide a fallback UI.

And:

> Reading `cookies()` here doesn't opt-in the whole route into dynamic rendering,
> the way the previous rendering model did. The Suspense boundary provides fallback
> UI where the runtime access streams, while static and cached content still ship
> in the initial HTML.

**The repo already does this correctly.** `app/protected/page.tsx` isolates the
session read into a child component and wraps it:

```tsx
async function UserDetails() {
  const supabase = await createClient();          // reads cookies()
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/auth/login");
  return JSON.stringify(data.claims, null, 2);
}

export default function ProtectedPage() {
  return (
    /* … static shell … */
    <Suspense>
      <UserDetails />
    </Suspense>
  );
}
```

Note `ProtectedPage` is **not** `async` and does not await anything — that is
what lets the static shell prerender.

### 4.2 The canonical per-user dashboard read

```tsx
// app/dashboard/page.tsx
import { Suspense } from "react";
import { BookingsSkeleton } from "@/components/bookings-skeleton";
import { getMyBookings } from "@/lib/data/bookings";

// NOT async. Nothing awaited at this level, so the shell prerenders.
export default function DashboardPage() {
  return (
    <>
      <h1>Your consultations</h1>
      <Suspense fallback={<BookingsSkeleton />}>
        <MyBookings />
      </Suspense>
    </>
  );
}

// Runtime-bound: reads the session. No cache directive. Streams per request.
async function MyBookings() {
  const bookings = await getMyBookings();
  return <BookingList bookings={bookings} />;
}
```

```ts
// lib/data/bookings.ts
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getMyBookings = cache(async () => {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return [];

  // RLS scopes this to the caller. Select explicit columns — never `*`.
  const { data } = await supabase
    .from("bookings")
    .select("id, starts_at, status, tutor_name");

  return data ?? [];
});
```

Three doc-backed choices there:

- **`import 'server-only'`** — `02-guides/data-security.md`: "This ensures that
  proprietary code or internal business logic stays on the server by causing a
  build error if the module is imported in the client environment."
- **`React.cache`, not `use cache`** — this is the crucial distinction. From
  `01-getting-started/06-fetching-data.md`:

  > **Good to know**: `React.cache` is scoped to the current request only. **Each
  > request gets its own memoization scope with no sharing between requests.**

  That is exactly the semantics user-scoped data needs: dedupe within one render,
  never across users. `02-guides/data-security.md` recommends the same for the DAL
  (`export const getCurrentUser = cache(async () => {…})`).
- **Explicit columns** — `02-guides/authentication.md`: "Explicitly return the
  columns you need rather than the whole user object."

### 4.3 Push the session read *down*, not up

`01-app/01-getting-started/08-caching.md` → "Maximizing the static shell":

> The deeper your async work sits in the tree, the more of the page can be
> prerendered.

`02-guides/authentication.md` → "Auth and streaming" makes the cost concrete:

> A top-level `await` on `cookies()`, `headers()`, or the DAL in a layout delays
> the first streamed chunk for that segment and holds `{children}` behind that
> work.

The repo's `app/protected/layout.tsx` already does this right — `<AuthButton />`
is wrapped in its own `<Suspense>` rather than the layout awaiting the session.

### 4.4 Footguns that could leak one user's data to another

Ranked by likelihood of actually happening in this codebase.

**F1 — Adding `'use cache'` to a page or layout that transitively reads the session.**
The highest-severity mistake, and the one an agent working from Next 14/15 memory
is most likely to make. Mitigated by the framework: `use-cache.md` says the
restriction "follows the call stack" and throws `next-request-in-use-cache`.
**But** note the deployment-timing caveat: "On a dynamically rendered route this
surfaces when the route runs, so it can pass `next build` and fail under
`next start`." Do not assume a green build means safety.

**F2 — Passing a user id into a `use cache` function to "make it per-user".**
This *appears* to work, because `use-cache.md` confirms arguments and closed-over
variables join the cache key. It is still wrong for authenticated data: the entry
lands in a **shared server store** whose correctness now depends on you never
mistyping the key, and on the id being the only identity-relevant input. The docs
show this pattern (`08-caching.md` → "Passing runtime values to cached
functions") but its example is *recommendations*, i.e. non-sensitive personalised
content — not authorization-scoped records. For RLS-protected LMS data, the blast
radius of one wrong key is another student's bookings. **Do not use this pattern
for anything RLS protects.**

**F3 — Caching a layout while children are per-user.**
`use-cache.md`: "To prerender an entire route, add `use cache` to the top of
**both** the `layout` and `page` files. Each of these segments are treated as
separate entry points … and will be cached independently." A cached layout with
uncached children is legal via the interleaving/`children` pass-through pattern —
but only if the cached function never *introspects* `children`. Easy to get
subtly wrong; avoid caching layouts in an all-authenticated app.

**F4 — Relying on a layout to gate access.**
`02-guides/authentication.md`:

> A layout also does not control whether the rest of the route renders. Route
> segments and parallel route slots are rendered by the router, so a layout that
> hides or swaps them **does not stop them from running or from appearing in the
> RSC Payload**.

Plus: "Due to Partial Rendering, be cautious when doing checks in Layouts as these
don't re-render on navigation, meaning the user session won't be checked on every
route change." And returning `null` from a top-level component is called out as
"**not recommended**".

**F5 — Over-broad props to Client Components.**
`02-guides/data-security.md` demonstrates passing a whole `userData` row into a
`'use client'` component: "**EXPOSED:** This exposes all the fields in userData to
the client." Serialised props ship to the browser in the RSC payload regardless of
what the component renders. Return DTOs.

**F6 — CDN caching of authenticated responses.**
`02-guides/cdn-caching.md` documents that dynamic pages get
`private, no-cache, no-store, max-age=0, must-revalidate`, which is correct by
default. The risk is misconfiguration at the edge. That file also warns:

> `proxy.js` should run **before** the CDN cache so it remains the source of truth
> for auth, redirects, and rewrites. If your deployment places `proxy.js` behind
> the CDN, configure the cache layer to bypass caching for routes that depend on
> `proxy.js` decisions.

**F7 — App Shell containing session-derived content.**
`08-caching.md`: "An App Shell that reads `cookies()` or `headers()` is
session-specific, cached per session on the client rather than in the shared
server cache." Correct by design, but it means the shell is *not* neutral — worth
knowing before enabling Partial Prefetching.

**F8 — Mutations during render.**
`02-guides/data-security.md`: "Next.js explicitly prevents setting cookies or
triggering cache revalidation within render methods." Relevant because
`lib/supabase/server.ts` swallows the cookie-write error in `setAll` exactly for
this reason.

**Optional hardening:** React's taint APIs, enabled via `experimental.taint`
(`02-guides/data-security.md`) — `experimental_taintObjectReference` /
`experimental_taintUniqueValue`. The docs frame it as defence in depth: "it's an
additional layer of protection, you should still filter and sanitize the data in
your DAL."

### 4.5 Revalidation without Server Actions — a real constraint for this app

The project bans Server Actions. Two 16.x APIs are therefore **unavailable**:

- `updateTag` — `04-functions/updateTag.md`: "can **only** be called from within
  Server Actions. It cannot be used in Route Handlers, Client Components, or any
  other context." The file even shows the exact failure:
  `// Error: updateTag can only be called from within a Server Action`.
- `refresh` — `04-functions/refresh.md`: "can **only** be called from within
  Server Actions."

So the only available invalidation API in a route handler is `revalidateTag`,
whose signature **changed in 16** (`02-guides/upgrading/version-16.md`):

> `revalidateTag` now requires a second argument specifying a `cacheLife` profile.
> The single-argument form is deprecated and will produce a TypeScript error.

```ts
// Before (Next 15)        // After (Next 16)
revalidateTag('posts')     revalidateTag('posts', 'max')
```

From `04-functions/revalidateTag.md`, the second argument selects semantics:

- `'max'` (recommended) — stale-while-revalidate.
- `{ expire: 0 }` — immediate expiry. The doc names this as the pattern "necessary
  when external systems call your Route Handlers and require data to expire
  immediately."
- Omitted — deprecated legacy immediate-expiry behaviour.

Also note: `revalidateTag` "cannot be called in Client Components or Proxy."

**Practical consequence.** Since this app cannot use `updateTag`, the
read-your-own-writes guarantee after a booking mutation must come from
`revalidateTag(tag, { expire: 0 })` plus a client-side router refresh — *not* from
`refresh()`. In practice, because per-user reads are uncached anyway (§4.1), there
is usually **no tag to invalidate at all**; the next request simply re-queries.
Tag invalidation only matters for the shared/catalogue caches described in §1.5.

There is also a CDN caveat (`02-guides/cdn-caching.md`):

> CDN-level caching alone does not support on-demand revalidation …: those calls
> invalidate the Next.js server cache, but the CDN will continue serving its cached
> copy until the `s-maxage` TTL expires.

---

## 5. Other 16.3 changes that would trip up someone working from Next 14/15 memory

Ordered by how likely each is to bite on this project.

**5.1 `io()` — brand new in 16.3.0.** `04-functions/io.md` version history:
"`v16.3.0` — `io` added." It is now preferred over `connection()`:

> `connection()` … stays suspended until a full user navigation reaches the
> server, so it also blocks prefetches. `io()` suspends like any other
> asynchronous function… **Prefer `io()` over `connection()`**, and reach for
> `connection()` only when you need to wait for a real user request.

`04-functions/connection.md` agrees: "With Cache Components, prefer `io()`".
Relevant if the LMS renders `new Date()` for "upcoming" slot logic.

**5.2 Synchronous IO now fails the build.** `migrating-to-cache-components.md`:

> Calls like `new Date()`, `Date.now()`, `Math.random()`, and `crypto.randomUUID()`
> during prerender throw a build error that `instant = false` does not clear.

A booking UI computing "is this slot in the past?" at module/render scope will
break the build. Fix: `await io()` inside a `<Suspense>` boundary, or move it to a
Client Component. `08-caching.md` notes `performance.now()` is exempt.

**5.3 `<Activity>` — component state now survives navigation.**
`config/cacheComponents.md`:

> Rather than unmounting the previous route when you navigate away, Next.js sets
> the Activity mode to `"hidden"`. … Component state is preserved when navigating
> between routes.

`migrating-to-cache-components.md` lists the fallout: dropdowns stay open,
dialog init effects don't re-fire, **and "forms after submission: input values and
`useActionState` results (success/error messages) persist when returning."** For a
booking form this means a stale success toast can reappear. Reset explicitly.

**5.4 `generateStaticParams` returning `[]` now errors.**
`migrating-to-cache-components.md`: must return at least one param, else
`empty-generate-static-params`. Relevant for any `/courses/[slug]` route.

**5.5 Client routing hooks need Suspense under dynamic params.**
Same file: `usePathname`, `useParams`, `useSelectedLayoutSegment(s)` suspend when
the pathname isn't fully known — "A nav or breadcrumb in a shared layout, for
instance, suspends while Next.js generates the App Shell." And "`useSearchParams`
**always** needs a `<Suspense>` boundary." A nav component in the dashboard
layout is a likely victim.

**5.6 Parallel routes now require `default.js`.**
`upgrading/version-16.md`: "All parallel route slots now require explicit
`default.js` files. **Builds will fail without them.**"

**5.7 Turbopack is the default** for `next dev` and `next build`
(`upgrading/version-16.md`). A custom webpack config now **fails** the build
unless you pass `--webpack`.

**5.8 `cacheLife`/`cacheTag` are stable** — drop the `unstable_` aliases
(`upgrading/version-16.md`).

**5.9 Node 20.9+, TypeScript 5.1+** minimums (`upgrading/version-16.md`).

**5.10 `next lint` removed**; `next build` no longer lints
(`upgrading/version-16.md`). This repo already has `eslint.config.mjs` flat
config, which matches the new default.

**5.11 `unstable_rootParams` removed** → `next/root-params`.

**5.12 New `instant` segment config** (`route-segment-config/instant.md`) — the
incremental-adoption escape hatch. `export const instant = false` marks a segment
as *allowed to block*. It does **not** force dynamic rendering and does **not**
clear synchronous-IO build errors. Confirmed in source: `next/dist/build/analysis/
get-page-static-info.js:501` throws `E1162` if `instant` is used without
`cacheComponents`, and `:517` throws `E1322` for `prefetch`.

**5.13 `forbidden()` / `unauthorized()` remain experimental**, gated behind
`experimental.authInterrupts` (`config/authInterrupts.md`). **Do not adopt** — for
an app this size, plain `redirect()` and explicit status codes are the safer call.

**5.14 Scroll behavior override changed** — Next no longer overrides
`scroll-behavior: smooth` unless you add `data-scroll-behavior="smooth"` to
`<html>` (`upgrading/version-16.md`).

---

## Open questions / could not determine

Stated plainly rather than guessed at.

1. **The exact failure mode of `export const dynamic` under `cacheComponents`.**
   Two docs assert it errors —
   `route-segment-config/index.md` ("removed when Cache Components is enabled")
   and `migrating-to-cache-components.md` ("will error"). I confirmed the
   analogous guards for `instant` (`E1162`) and `prefetch` (`E1322`) directly in
   `next/dist/build/analysis/get-page-static-info.js`, but **could not locate the
   corresponding `dynamic`/`revalidate`/`fetchCache` guard in the compiled `dist`
   output**, so I cannot state whether it is a build-time throw or a warning, nor
   quote an error code. The practical guidance (don't use them) is unaffected.

2. **Whether `revalidateTag` is callable from a Route Handler during a streaming
   response.** `revalidateTag.md` confirms Route Handlers are a valid context but
   says nothing about ordering relative to a streamed body.

3. **Supabase-specific: `getClaims()` vs `getUser()` trust semantics.** The repo
   uses `getClaims()` in both `lib/supabase/proxy.ts` and `app/protected/page.tsx`.
   Whether `getClaims()` performs local JWT verification or a network round-trip to
   the auth server — and therefore whether it is sufficient as the authentication
   check in a route handler — **is a Supabase question, not a Next.js one, and is
   not answerable from the bundled Next docs.** Worth a follow-up ticket against
   the Supabase docs before hardening the API layer, since §2.5 depends on it.

4. **Interaction between `use cache: private` and Supabase cookie rotation.** The
   directive permits `cookies()`, but the docs don't describe behaviour when the
   underlying session cookie is refreshed mid-flight by the proxy. Moot given the
   recommendation not to adopt it.

5. **`experimental.hideLogsAfterAbort`** is referenced in
   `migrating-to-cache-components.md` but has **no dedicated API reference page**
   in the bundled docs, so its default value and stability are unconfirmed.

---

## Appendix — files reviewed

Under `/Users/oliverbennett/with-supabase-app/node_modules/next/dist/docs/`:

- `01-app/01-getting-started/06-fetching-data.md`
- `01-app/01-getting-started/08-caching.md`
- `01-app/01-getting-started/15-route-handlers.md`
- `01-app/01-getting-started/16-proxy.md`
- `01-app/02-guides/authentication.md`
- `01-app/02-guides/backend-for-frontend.md`
- `01-app/02-guides/cdn-caching.md`
- `01-app/02-guides/data-security.md`
- `01-app/02-guides/migrating-to-cache-components.md`
- `01-app/02-guides/upgrading/version-16.md`
- `01-app/03-api-reference/01-directives/use-cache.md`
- `01-app/03-api-reference/01-directives/use-cache-private.md`
- `01-app/03-api-reference/03-file-conventions/proxy.md`
- `01-app/03-api-reference/03-file-conventions/route.md`
- `01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`
- `01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`
- `01-app/03-api-reference/04-functions/cacheLife.md`
- `01-app/03-api-reference/04-functions/connection.md`
- `01-app/03-api-reference/04-functions/io.md`
- `01-app/03-api-reference/04-functions/refresh.md`
- `01-app/03-api-reference/04-functions/revalidateTag.md`
- `01-app/03-api-reference/04-functions/updateTag.md`
- `01-app/03-api-reference/05-config/01-next-config-js/authInterrupts.md`
- `01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`

Source consulted: `next/dist/build/analysis/get-page-static-info.js`.

Repo files reviewed: `next.config.ts`, `proxy.ts`, `lib/supabase/proxy.ts`,
`lib/supabase/server.ts`, `app/protected/page.tsx`, `app/protected/layout.tsx`,
`package.json`.

**No claim in this document is sourced from the public nextjs.org website or from
model recall.**
