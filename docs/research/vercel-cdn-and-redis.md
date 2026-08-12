# Vercel's CDN, and whether Redis earns its place

**Research ticket:** #40
**Next.js version verified:** `16.3.0` (`node_modules/next/package.json`)
**Primary sources:** the docs bundled inside the installed package at
`/Users/oliverbennett/with-supabase-app/node_modules/next/dist/docs/` (cited
relative to that directory), the Vercel documentation at `vercel.com/docs`, and
the Supabase documentation at `supabase.com/docs`. Where a claim is about *this*
app rather than about a product, it is backed by a `next build` run against this
tree — that output is reproduced verbatim in [§1.1](#11-the-build-says-it-plainly).
Where the docs were silent or ambiguous, this is flagged under
[Open questions](#open-questions).

---

## TL;DR — the eight things that actually matter

1. **The CDN is already doing the most it can for three of the four routes.**
   `/` and `/protected` both build to a Partial Prerender: a real prerendered
   HTML shell on disk (15,757 and 5,639 bytes) that Vercel serves from the edge
   before your function has done anything.
2. **`/protected/admin` is the one route with no shell at all** — `htmlSize: 0`,
   `"response": "empty"`, `"compute": "blocking"`. It is the only place in the
   app where the CDN is being left on the table.
3. **There is no CDN *configuration* change worth making.** `next.config.ts`
   needs nothing added. The only improvement available is a *code* change on
   `/protected/admin`, and its own trade-off is discussed honestly in
   [§3.4](#34-the-one-change-available-and-its-real-size).
4. **`/api/consultations` is uncacheable by construction**, and not because of
   anything Next.js does: the app exposes only `POST` and `PATCH`, and Vercel's
   CDN only caches `GET` and `HEAD`. There is no `Cache-Control` to add.
5. **The landing page is already PPR'd with only the auth-dependent part
   streamed.** That is not a proposal — it is what `next build` emits today,
   because `AuthButton` already sits inside `<Suspense>` in
   `components/site-header.tsx`.
6. **Redis has nothing to cache here.** Sessions are verified locally with
   WebCrypto (no round trip); `user_roles` is read only inside the Postgres auth
   hook at token-mint time and is `revoke all`'d from the Data API, so there is
   no per-request lookup in existence to cache; consultation reads are per-user
   and mutable, which is the exact shape Next's own docs say produces
   "near-zero" cache utilisation.
7. **Vercel KV no longer exists**, and the thing people reach for Redis to get is
   already provisioned: Vercel **Runtime Cache** is a managed, regional,
   tag-invalidated remote cache wired directly to `use cache: remote`, with zero
   setup. If a "Redis" need ever appears, that is the door, not the Marketplace.
8. **Connection pooling is not in this app's path.** `@supabase/ssr` talks to
   PostgREST over HTTPS. No function in this repo ever opens a Postgres
   connection, so Supavisor — session mode, transaction mode, port 6543 — is
   answering a question this app does not ask.

---

## 1. What is actually cached today

### 1.1 The build says it plainly

Running `next build` against this tree (Next 16.3.0, Turbopack, Cache Components
on) produces:

```
Route (app)
┌ ◐ /
├ ○ /_not-found
├ ƒ /api/consultations
├ ƒ /api/consultations/[id]
├ ○ /apple-icon.png
├ ƒ /auth/confirm
├ ◐ /auth/error
├ ○ /auth/forgot-password
├ ○ /auth/login
├ ○ /auth/sign-up
├ ○ /auth/sign-up-success
├ ○ /auth/update-password
├ ○ /icon.png
├ ○ /opengraph-image.png
├ ◐ /protected
└ ƒ /protected/admin

ƒ Proxy (Middleware)

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
ƒ  (Dynamic)            server-rendered on demand
```

Two things are worth pausing on. First, **`/protected` is a Partial Prerender,
not a dynamic route** — an auth-gated page still ships a prerendered shell.
Second, **there is no `Revalidate` or `Expire` column**, because nothing in this
app uses `use cache`, so no route has a revalidation window.

The on-disk artefacts under `.next/server/app/` confirm it:

| Route | Artefact | Size |
| --- | --- | --- |
| `/` | `index.html` | 15,757 bytes |
| `/protected` | `protected.html` | 5,639 bytes |
| `/protected/admin` | *(none)* | 0 bytes |

And `.next/prerender-manifest.json` gives the mechanism:

```json
"/":                 { "renderingMode": "PARTIALLY_STATIC", "response": "initial", "compute": "resuming", "htmlSize": 15757, "initialRevalidateSeconds": false }
"/protected":        { "renderingMode": "PARTIALLY_STATIC", "response": "initial", "compute": "resuming", "htmlSize": 5639,  "initialRevalidateSeconds": false }
"/protected/admin":  { "renderingMode": "PARTIALLY_STATIC", "response": "empty",   "compute": "blocking", "htmlSize": 0,     "initialRevalidateSeconds": false }
```

`"compute": "resuming"` is PPR working: Vercel serves the stored shell, then the
function *resumes* the postponed render to fill the holes. `"compute":
"blocking"` with `htmlSize: 0` is the opposite — nothing to serve, so the
request waits for the origin.

Confirming that the shells contain what we think: `index.html` contains the hero
copy (`Book time with a tutor`) **and** the `animate-pulse rounded bg-muted`
skeleton that `site-header.tsx` passes as the `AuthButton` fallback. The header's
auth state is a hole; everything around it is bytes on disk.

### 1.2 What each route serves, and why

**`/` — the static shell, plus a streamed hole.**

The shell is prerendered at build time and pushed to Vercel's durable store. Per
Vercel's PPR documentation:

> At deployment time, Vercel writes the shell to the global ISR cache. On the
> first request in each region, Vercel pulls the shell into the regional CDN
> cache.

and

> This is the key difference from ISR: even when the shell is served from the CDN
> cache, your function still runs to render the dynamic holes. It is possible to
> have a fully cached page, but most PPR requests incur a function invocation.

So `/` is a CDN hit *and* a function invocation, on the same request. The
`AuthButton` hole is why.

**`/protected` — same shape, and this surprises people.**

Being auth-gated does not make a route dynamic under Cache Components. The
`Consultations` read sits inside `<Suspense>` in `app/protected/page.tsx`, so the
header, footer and `TableSkeleton` prerender into a 5.6 KB shell and the
per-user table streams. `08-caching.md` states the rule directly:

> Reading `cookies()` here doesn't opt-in the whole route into dynamic rendering,
> the way the previous rendering model did. The Suspense boundary provides
> fallback UI where the runtime access streams, while static and cached content
> still ship in the initial HTML.

**`/protected/admin` — nothing.**

`app/protected/admin/page.tsx` awaits `createClient()` and `getClaims()` at the
top level of the page body, outside any `<Suspense>`, and carries `export const
instant = false`. The result is an empty shell. Every visit pays full origin
latency for the first byte.

**`/api/consultations` — not a cache question at all.**

The file exports only `POST`; `[id]/route.ts` exports only `PATCH`. Vercel's
cacheable-response criteria open with:

> - Request uses `GET` or `HEAD` method.

There is no `GET` route handler on `/api/consultations` to cache, so no
`Cache-Control` header on it would do anything. (`app/auth/confirm/route.ts` does
export a `GET`, but it calls `verifyOtp` and `redirect()` on every path — a
single-use token exchange, correctly `ƒ`.)

### 1.3 `Cache-Control` and `x-vercel-cache`, per route

Next's `02-guides/cdn-caching.md` states the header it sets by rendering
strategy:

> - **Static pages** (no revalidation): `s-maxage=31536000` (one year)
> - **ISR pages** (time-based revalidation): `s-maxage={revalidate},
>   stale-while-revalidate={expire - revalidate}` …
> - **Dynamic pages** (no caching): `private, no-cache, no-store, max-age=0,
>   must-revalidate`

Vercel then rewrites what the *browser* sees. From `/docs/headers/response-headers`:

> If you use this header to instruct the CDN to cache data, such as with the
> `s-maxage` directive, Vercel returns the following `cache-control` header to
> the client:
> - `cache-control: public, max-age=0, must-revalidate`

and from `/docs/caching/cdn-cache`:

> If you set `Cache-Control` without a `CDN-Cache-Control`, the Vercel CDN strips
> `s-maxage` and `stale-while-revalidate` from the response before sending it to
> the browser.

That is why you cannot read the CDN's behaviour off the browser's
`cache-control`. `x-vercel-cache` is the header that tells you anything.

| Route | Shell in CDN? | Function runs? | Expected `x-vercel-cache` | Browser `cache-control` |
| --- | --- | --- | --- | --- |
| `/` | Yes | Yes (fills the auth hole) | `PRERENDER` / `HIT`, then `MISS` on a cold region | `public, max-age=0, must-revalidate` |
| `/protected` | Yes | Yes (fills the consultations hole) | `PRERENDER` / `HIT` | `public, max-age=0, must-revalidate` |
| `/protected/admin` | No | Yes, blocking | `MISS`, with no reason recorded | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/api/consultations` | No — not a `GET` | Yes | not a cacheable request | whatever the handler sets (it sets none) |

The `MISS`-with-no-reason on the admin route is Vercel's documented behaviour for
genuinely dynamic paths:

> A miss isn't always a problem. Dynamic routes are generated on every request,
> so a miss there is expected and shows no reason.

Two more values will show up in logs and are worth recognising:

- **`BYPASS` / "Prerender Bypass"** for crawlers. The prerender manifest emits an
  `experimentalBypassFor` entry matching a long crawler `user-agent` regex
  (`Googlebot`, `Bingbot`, `facebookexternalhit`, `Slackbot`, `Twitterbot`, …).
  Vercel documents this exact interaction: *"On Partial Prerendering routes, a
  matching bot User-Agent resolves to this same reason."* Next explains why in
  `08-caching.md` — *"because they need a complete document, Next.js skips the
  shell and renders the entire page dynamically at request time."* So a Slack
  unfurl of the landing page is a full origin render, by design.
- **`REVALIDATED`** if anyone ever calls `revalidateTag()` without a lifetime.
  Nothing in this app does.

### 1.4 The static assets, which are the biggest win and cost nothing

`headers.md` (§ Cache-Control):

> Next.js sets the `Cache-Control` header of `public, max-age=31536000,
> immutable` for truly immutable assets. It cannot be overridden.

Vercel:

> Static files are **automatically cached on Vercel's global network** for the
> lifetime of the deployment after the first request.

This covers the JS, the CSS, and — relevant here — the two self-hosted variable
font files. The build writes them into `/_next/static/media/` and emits a
preload `link` header on the prerendered shell, which I can read directly out of
`.next/server/app/index.meta`:

```
link: </_next/static/media/1b99372b3eaef0c8-s.p.…woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2", …
```

Same file also carries `x-nextjs-prerender: 1` and `x-nextjs-stale-time: 300`.
The latter is the *client router's* stale window (the `default` profile's 5
minutes), not a CDN directive — worth knowing so it is not mistaken for one.

### 1.5 Where `proxy.ts` sits, and what it costs

Vercel is unambiguous about ordering:

> Routing Middleware **executes code *before* a request is processed on a site**
> … Because it runs globally before the cache, Routing Middleware is an effective
> way of providing personalization to statically generated content.

So `proxy.ts` does **not** prevent the CDN from serving `/`'s shell. It does mean
every matched request is a billed fluid-compute invocation before the cache is
even consulted, and the matcher in `proxy.ts` currently excludes only
`_next/static`, `_next/image`, `favicon.ico` and bare image extensions.

One interaction to be aware of when reading the cacheability rules. Vercel's
criteria for storing a response include:

> - Response doesn't contain the `set-cookie` header.
> - Response doesn't contain the `private`, `no-cache` or `no-store` directives
>   in the `Cache-Control` header.

`lib/supabase/proxy.ts` attaches rotated auth cookies to the response whenever
Supabase refreshes the session. That is a criterion about *storing* a response,
not about *serving* an already-stored shell, and the shell for `/` and
`/protected` is written at deploy time rather than populated from a user's
response — so the two do not collide in the obvious way. The docs do not spell
out the combination explicitly; see [Open questions](#open-questions).

---

## 2. Configuration this app is not using

For each: does it apply here?

| Mechanism | Applies to this app? | Why |
| --- | --- | --- |
| `use cache` | **No** | Every read in the app is per-user and reached through a client that calls `cookies()`. `use-cache.md` forbids runtime APIs inside the scope and the restriction "follows the call stack", so `'use cache'` above `createClient()` throws. The framework blocks the mistake. |
| `use cache: private` | **No** | Permits `cookies()`, but caches only in browser memory and is *"not available in Route Handlers"*. For a booking flow where a student must see their own change immediately, a stale client copy is a correctness bug. |
| `use cache: remote` | **No** (today) | This is the Redis-shaped option. Fully covered in [§4](#4-redis). |
| `cacheLife` profiles | **No** | `cacheLife` *"can only be used within a cache directive scope"* and *"cannot be used at module scope"*. With no `use cache` anywhere, there is no scope to put one in. |
| `cacheTag` + `revalidateTag` | **No** | Same reason — tags attach to cached data, and there is none. Worth knowing for when there is: `revalidateTag(tag, profile)` now takes a **mandatory second argument**, and the recommended value is `"max"`; calling it without one is deprecated and forces a blocking revalidate. |
| ISR | **No** | ISR fills in concrete pages for *dynamic route params*. This app has exactly one dynamic segment, `/api/consultations/[id]`, and it is a `PATCH`-only route handler. There is nothing to statically generate per-param. |
| `Cache-Control` on route handlers | **No** | There is no `GET` route handler carrying cacheable data. `POST` and `PATCH` are outside the CDN's cacheable-request criteria entirely. |
| Image optimisation | **No** | The app imports `next/image` zero times. The landing page's iconography is inline SVG from `lucide-react`; there is no `/public` directory. `app/icon.png`, `app/apple-icon.png` and `app/opengraph-image.png` are metadata *file conventions* — they build to route bodies with `cache-control: public, max-age=0, must-revalidate` and never touch `/_next/image`. Adopting `next/image` here would add billed transformations for no gain — Vercel itself lists *"Small icons or thumbnails (under 10 KB)"* and *"Vector image formats such as SVG"* under cases where optimisation *"may not be necessary or beneficial"*. |
| `stale-while-revalidate` at the edge | **No** | `s-maxage`/`stale-while-revalidate` are emitted for **ISR pages** — routes with a revalidation window. Every route here has `initialRevalidateSeconds: false`. There is no interval to be stale for. The shells are still cached: Vercel's ISR store *"persists content for 31 days, or until you revalidate it,"* scoped per deployment. |
| `expireTime` in `next.config.ts` | **No** | It only tunes the `stale-while-revalidate` figure on ISR-enabled pages. No ISR, no effect. |
| `next.config.ts` `headers()` | **No** | Would let you set `Cache-Control` per route, but every candidate route is per-user. Setting a cacheable header on any of them would be a data-leak bug, not an optimisation. |

The pattern is not a coincidence. Every knob in this list exists to cache
**shared** data, and this app's language — `docs/design/oli-learn.md`, `CONTEXT.md`
— has no shared data in it. A Consultation belongs to exactly one Student. There
is no catalogue, no public listing, no tutor-availability table. The cache
surface is genuinely empty.

---

## 3. The landing page

### 3.1 It is already PPR'd

The question was whether `/` can be fully static, or PPR'd with only the
auth-dependent part streamed. **The second one is already true**, and has been
since `cacheComponents: true` went into `next.config.ts`.

`components/site-header.tsx` wraps `<AuthButton />` in `<Suspense>` with a
skeleton fallback. That single boundary is the whole mechanism. Next's public
pages guide describes exactly this shape:

> The fallback is prerendered alongside the rest of our static and cached
> content. The inner component streams in later, once its async work completes.
> … At **build time**, most of the page … is rendered, cached and pushed to a
> content delivery network. At **request time**, the prerendered part is served
> instantly from a CDN node close to the user.

The 15,757-byte `index.html` on disk, containing both the hero copy and the
pulse-skeleton, is that sentence made concrete.

### 3.2 Fully static is not available, and should not be wanted

To make `/` a `○` rather than a `◐`, the auth-dependent hole would have to
disappear from the server render — meaning `AuthButton` becomes a Client
Component that reads the session in the browser. That trades a streamed hole for
a client-side fetch waterfall and a flash of the wrong header. The `◐` already
gives the thing static was wanted for: the shell arrives at CDN latency.

There is a second reason not to chase `○`. Vercel's own guidance names this exact
page type as the PPR use case:

> **Articles and marketing pages**: static content with personalized
> recommendations or an auth-aware header.

### 3.3 What would make the shell *bigger* — and it is nothing

The lever Next gives you for PPR is "push the async work deeper", per
`08-caching.md`:

> The deeper your async work sits in the tree, the more of the page can be
> prerendered.

On `/` there is nothing left to push. The only async work in the tree is
`AuthButton`, and it is already at the leaf, already behind a boundary. `VALUES`
and `ROLES` are module-scope constants; `CredentialsCard` and `SiteFooter` are
synchronous. The landing page is finished.

### 3.4 The one change available, and its real size

The only route in the app where the CDN is left on the table is
`/protected/admin`, and closing that gap is a code change, not a configuration
change.

The empty shell is caused by `await createClient()` / `getClaims()` running in
the page body outside `<Suspense>`. `export const instant = false` does not
*cause* it — per `instant.md`, `false` merely *"indicate[s] that this segment is
allowed to block"* and disables the static-shell validation that would otherwise
flag it:

> Cache Components also validates that each page in your app produces a non-empty
> static shell at prerender time. To opt a route out of this validation, ensure
> the highest `instant` config in the route's tree is `false`.

The reason the guard was hoisted into the page body is documented in the code —
a `notFound()` thrown inside the Suspense boundary would arrive after a 200 was
committed. **But that reason has already been superseded.** `lib/supabase/proxy.ts`
now performs the admin check itself and rewrites to `/_not-found` with an
explicit 404, and its own comment says why: *"`instant = false` does not help: it
marks a segment as *allowed* to block, not required to. The status has to be
decided before anything streams, which means here."*

So the status code is settled upstream, and the page-body guard is now defence in
depth that costs the route its entire shell.

**Honest sizing before anyone acts on this.** The payoff is a ~5 KB CDN-served
shell on the lowest-traffic route in the app — an admin-only listing. It removes
origin latency from the first byte for a handful of users. Against that: it
relocates a security-relevant guard, and Next's docs are explicit that the proxy
*is not an authorization boundary*. RLS remains the real one, and the admin
query's exposure is already bounded by RLS regardless of which guard fires. This
is a legitimate improvement and a small one. It is emphatically **not** a reason
to reach for infrastructure.

---

## 4. Redis

### 4.1 What Vercel actually offers today

**Vercel KV is gone.** From `/docs/redis`:

> Vercel KV is no longer available. If you had an existing Vercel KV store, we
> automatically moved it to Upstash Redis in December 2024. For new projects,
> install a Redis integration from the Marketplace.

Redis is now a Marketplace integration — you *"Select a Redis provider"*,
*"Provision and configure a Redis database with minimal setup"*, and *"Have
credentials and environment variables injected into your Vercel project."* It is
a third-party database with third-party billing, sitting in your request path.

**But the thing Redis is usually reached for is already provisioned.** Vercel
**Runtime Cache** is:

> a regional, ephemeral cache you can use for storing and retrieving data across
> Vercel Functions, Routing middleware, and build execution within a Vercel
> region.

with these properties: *Regional*, *Isolated by environment*, *Persistent across
deployments*, *Ephemeral* (LRU eviction), and — the important one —
***Automatic***: *"When runtime cache is enabled, Vercel handles caching for
you."* It supports TTLs and tag invalidation, has an observability page with hit
rate and eviction charts, and is wired straight into Next 16:

> **`use cache: remote`**: A directive that caches entire functions or components
> with Runtime cache. Requires enabling `cacheComponents` in your config.

`cacheComponents` is already `true` in this repo. **The remote cache is one
directive away, with no provisioning, no connection string, and no second
vendor.** Any argument for Redis here has to first explain why Runtime Cache is
insufficient — and no such argument exists in this codebase.

### 4.2 Candidate one: session data — nothing to cache

The session is a cookie-borne JWT. `getClaims()` on this project verifies it
locally. This is not inference; it is what the shipped implementation does. From
`@supabase/auth-js@2.112.2`, `GoTrueClient.js`:

```js
const signingKey = !header.alg || header.alg.startsWith('HS') || !header.kid ||
  !('crypto' in globalThis && 'subtle' in globalThis.crypto)
    ? null
    : await this.fetchJwk(header.kid, …)
// …
const isValid = await crypto.subtle.verify(algorithm, publicKey, signature,
  stringToUint8Array(`${rawHeader}.${rawPayload}`))
```

and its own doc comment:

> If your project is using asymmetric JWT signing keys, then the verification is
> done locally usually without a network request using the WebCrypto API.

The only network call is the JWKS fetch, and it is **already triple-cached**:

1. **In the process.** `fetchJwk` reads through a module-level `GLOBAL_JWKS` map
   keyed by storage key, with `JWKS_TTL = 10 * 60 * 1000` (10 minutes). Creating a
   fresh client per request — which `lib/supabase/server.ts` correctly does — does
   *not* re-fetch, because the cache is module-scoped, not instance-scoped.
2. **At Supabase's edge.** The JWKS docs state the endpoint *"is served directly
   from the Auth server, but is also additionally cached by the Supabase Edge for
   10 minutes."* The library's own comment adds: *"Supabase provides a
   network-edge cache providing fast responses for these situations."*
3. **By Fluid compute.** Vercel's model is not one-invocation-per-microVM:
   *"multiple invocations can share the same physical instance (a global
   state/process) concurrently."* Warm instances keep `GLOBAL_JWKS` populated
   across requests.

A Redis lookup for the JWKS would replace an edge-cached HTTPS GET with… a
different network round trip, at the same order of latency, plus a dependency.
**Strictly worse.** Nothing to win.

### 4.3 Candidate two: the `user_roles` lookup — it does not exist per request

This one resolves by reading the migration.
`supabase/migrations/20260811214508_create_user_roles_and_auth_hook.sql` puts the
lookup inside `public.custom_access_token_hook`, which Supabase runs *before a
token is issued* — at sign-in and at refresh, in Postgres, not in the request
path. The JWT then carries `user_role`, and `proxy.ts` and the admin page read it
straight off the claims.

The table is also, deliberately, unreachable:

```sql
revoke all on table public.user_roles from authenticated, anon, public;
alter table public.user_roles enable row level security;
grant all on table public.user_roles to supabase_auth_admin;
```

with the comment *"Deliberately unreachable through the Data API."*

**There is no per-request role lookup to cache, because the architecture already
removed it.** Caching it in Redis would mean re-introducing a query in order to
have something to cache. `docs/adr/0001-rbac-via-jwt-claim-and-rls.md` settled
this.

### 4.4 Candidate three: consultation reads — the wrong shape, twice

Consultation reads fail the test on two independent grounds.

**Cache utilisation.** `use-cache-remote.md` lists when to avoid remote caching:

> - If cache keys have mostly unique values per request (search filters, price
>   ranges, user-specific parameters), cache utilisation will be near-zero
> - If data changes frequently (seconds to minutes), cache hits will quickly go
>   stale, leading to frequent misses and waiting for upstream revalidation

Both apply. `student_id` is the cache key, so there is one entry per student and
each entry serves one person. The doc's own prescription is to *"find the
dimension with fewer unique values"* — there is no such dimension here. A
consultation belongs to exactly one student, by definition.

It also says outright:

> For user-specific data, use `'use cache: private'` instead of
> `'use cache: remote'`

**Correctness.** A student books a consultation and expects to see it. A shared
server cache between the write and the read introduces a window where they do
not. This app has no Server Actions (`AGENTS.md`: *"ALWAYS use APIs, NEVER use
Server Actions"*), so `updateTag()` and `refresh()` — the immediate-consistency
tools — are unavailable, leaving `revalidateTag(tag, 'max')`, whose documented
semantics are stale-while-revalidate:

> When using `profile="max"`, `revalidateTag` marks tagged data as stale, but
> fresh data is only fetched when pages using that tag are next visited.

That is the right trade for a product catalogue and the wrong one for "did my
booking save".

Also worth noting for anyone tempted: a remote-cached entry would not survive a
deploy anyway. *"Remote cache entries do not persist across deploys. The cache key
includes the `deploymentId` (when configured) or the `buildId`."*

### 4.5 What integrating it would actually cost

Even granting a use case, the bill is not just the Marketplace subscription:

- **A second vendor** in the request path, with its own availability, its own
  region, and its own dashboard.
- **Latency on every lookup.** `use-cache-remote.md`: *"This comes with
  tradeoffs: infrastructure cost and network latency during cache lookups,"* and
  it names the threshold — *"If operations are already fast (< 50ms) due to
  proximity or local access, the remote cache lookup might not improve
  performance."* A PostgREST call from a co-located function is in that range.
- **Environment variables and provisioning** to keep in sync across preview and
  production.
- **A cache-invalidation problem** the app does not currently have, in a domain
  (`Reschedule`, `Cancel`, `Complete` — see `CONTEXT.md`) where every one of the
  three verbs mutates the thing being read.

### 4.6 The verdict, stated as a finding rather than an opinion

Every read in this application is one of: (a) already local (JWT verification),
(b) already eliminated (the role lookup, moved into the token), or (c) per-user
and mutable (consultations), which the framework's own documentation identifies
as the shape that produces near-zero cache utilisation.

**There is no third-party cache to add, because there is no repeated shared read
to remove.** If one ever appears — a course catalogue, tutor availability windows,
a public listing — the correct first move is `'use cache: remote'` against
Vercel's Runtime Cache, which is already available to this project and requires
no provisioning. A Marketplace Redis would only become interesting for something
Runtime Cache is not: distributed rate limiting, idempotency keys, or locks.
None of those are in scope.

---

## 5. Connection pooling

### 5.1 There is no Postgres connection to pool

This is the part usually meant when someone says "we need Redis for scale", and
for this app it dissolves on inspection.

`lib/supabase/server.ts` and `lib/supabase/proxy.ts` both use
`createServerClient` from `@supabase/ssr`. That is an HTTP client. Supabase
documents the Data API as:

> Supabase provides a RESTful API using PostgREST, a thin API layer on top of
> Postgres.

> The REST API resolves all requests to a single SQL statement leading to fast
> response times and high throughput.

The function's outbound call is a `fetch` to `https://<ref>.supabase.co/rest/v1/…`.
`.env.example` corroborates it from the other side: the only two variables the
application reads are `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **There is no connection string in this
repo**, because nothing in it opens a connection.

### 5.2 What Supavisor is for, and why it is not in this path

Supavisor is a server-side pooler in front of *direct* Postgres connections:

> **Transaction Mode (port 6543):** "A client is allowed to make a single query
> before being sent back to the figurative 'waiting room'." … **Session Mode
> (port 5432):** "Once the pooler assigns a direct connection, it stays with that
> client until voluntarily surrendered."

and the recommendation people are usually quoting:

> Use pooler transaction mode for application traffic from temporary clients (for
> example, serverless or edge functions).

That advice is correct — **for an app that connects to Postgres.** This one does
not. Supabase's own troubleshooting docs place the Data API outside Supavisor
entirely: PostgREST *"rel[ies] on internal application poolers"* rather than going
through Supavisor, and it is configured separately. The connection-monitoring
docs make the separation visible — connections are attributed by username, and
*"authenticator - Data API (PostgREST)"* is its own bucket alongside
`supabase_auth_admin` for Auth.

So the answer to "is this app using the right connection mode" is: **the question
does not apply.** There is no mode to get wrong.

### 5.3 The pooling limit that *does* apply, and it is not an app change

PostgREST's internal pool is real and finite, and it is the actual ceiling for
this architecture. Supabase's guidance:

> The general rule is that if you are heavily using the PostgREST database API,
> you should be conscientious about raising your pool size past 40% of the
> Database Max Connections.

That is a **Supabase dashboard setting**, not a code change and not something
Redis addresses. If this app ever hits a connection ceiling, the lever is
PostgREST's pool size and the database compute size — not a cache.

### 5.4 The instruction already in the codebase is the right one

Both Supabase clients carry the comment *"Don't put this client in a global
variable. Always create a new client within each function."* Under Fluid compute
that is not superstition — Vercel states that *"multiple invocations can share the
same physical instance (a global state/process) concurrently"*, so a
module-scoped client holding one request's cookies would leak it into another's.
The existing per-request construction is correct and should stay. Note that it
costs nothing in JWKS fetches, for the module-scope reason established in
[§4.2](#42-candidate-one-session-data--nothing-to-cache).

### 5.5 When this section would need rewriting

If the app ever adds a direct Postgres client — Drizzle, Prisma, `pg`, or
`postgres.js` — for something PostgREST cannot express, then and only then:
transaction mode on port 6543, per the guidance quoted above, and a fresh look at
pool sizing. Until then, pooling is not in the path.

---

## Open questions

Stated plainly rather than guessed at.

1. **Whether a response carrying rotated Supabase auth cookies interacts with the
   already-stored PPR shell.** Vercel lists *"Response doesn't contain the
   `set-cookie` header"* among the criteria for a response to be *stored*, and
   `lib/supabase/proxy.ts` attaches refreshed cookies when Supabase rotates the
   session. Because the PPR shell for `/` and `/protected` is written at deploy
   time rather than populated from a user's response, the two should not collide —
   but no Vercel doc states the combination explicitly, and I did not have a live
   deployment to observe `x-vercel-cache` against. **This should be verified
   empirically** with `curl -I` against production, signed in and signed out.

2. **Whether segment-prefetch requests pass through `proxy.ts`.** Under Cache
   Components, prefetches use pathname-based routes — the build emits
   `index.segments/_tree.segment.rsc` and friends — and `cdn-caching.md` says
   *"CDNs can cache these with standard pathname-based cache keys."* The matcher
   in `proxy.ts` excludes `_next/static` and `_next/image` but nothing resembling
   `.segments`. If these requests do traverse the proxy, every prefetch is a
   billed middleware invocation on a response the CDN could otherwise serve
   untouched. **The Vercel docs do not describe the routing order for these paths
   and I could not determine it from the docs alone.** This is the one place where
   a matcher change might pay for itself, and it needs measurement — the
   Observability → Routing Middleware invocation count, broken down by path,
   would settle it in minutes.

3. **The precise `x-vercel-cache` value for a PPR route's first byte.** The
   `MISS` documentation says ISR and PPR paths *"are meant to be served as a
   `PRERENDER` or `HIT`"*, which is why the table in §1.3 lists both, but no doc
   states which of the two a warm PPR shell reports. Observable in one request
   against production.

4. **Vercel Runtime Cache's storage limit.** The docs give item size (2 MB), tags
   per item (128) and tag length (256 bytes), and say each cache has *"a fixed
   storage limit"* with LRU eviction — but do not publish the figure. Immaterial
   here (nothing is being cached) and noted only so a future reader does not
   assume it is unbounded.

5. **Whether `experimentalBypassFor`'s crawler list can be tuned.** The prerender
   manifest emits it automatically and Vercel describes it as *"configure[d]"* by
   frameworks; Next's bundled docs contain no API for adjusting it. Only relevant
   if crawler traffic to `/` ever becomes a meaningful share of origin renders.

---

## Appendix — sources

### Next.js 16.3.0, bundled at `node_modules/next/dist/docs/`

- `01-app/01-getting-started/08-caching.md`
- `01-app/01-getting-started/15-route-handlers.md`
- `01-app/02-guides/cdn-caching.md`
- `01-app/02-guides/deploying-to-platforms.md`
- `01-app/02-guides/public-static-pages.md`
- `01-app/03-api-reference/01-directives/use-cache.md`
- `01-app/03-api-reference/01-directives/use-cache-private.md`
- `01-app/03-api-reference/01-directives/use-cache-remote.md`
- `01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`
- `01-app/03-api-reference/04-functions/cacheLife.md`
- `01-app/03-api-reference/04-functions/revalidateTag.md`
- `01-app/03-api-reference/05-config/01-next-config-js/expireTime.md`
- `01-app/03-api-reference/05-config/01-next-config-js/headers.md`

### Vercel

- <https://vercel.com/docs/caching/cdn-cache>
- <https://vercel.com/docs/caching/cache-status>
- <https://vercel.com/docs/caching/runtime-cache>
- <https://vercel.com/docs/headers/response-headers>
- <https://vercel.com/docs/incremental-static-regeneration>
- <https://vercel.com/docs/partial-prerendering>
- <https://vercel.com/docs/routing-middleware>
- <https://vercel.com/docs/fluid-compute>
- <https://vercel.com/docs/image-optimization>
- <https://vercel.com/docs/redis>

### Supabase

- <https://supabase.com/docs/guides/api>
- <https://supabase.com/docs/guides/auth/jwts>
- <https://supabase.com/docs/guides/auth/custom-claims-and-role-based-access-control-rbac>
- <https://supabase.com/docs/guides/database/connecting-to-postgres>
- <https://supabase.com/docs/guides/database/connection-management>
- <https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI>

### This repository

Read for context: `next.config.ts`, `proxy.ts`, `app/layout.tsx`, `app/page.tsx`,
`app/protected/layout.tsx`, `app/protected/page.tsx`,
`app/protected/admin/page.tsx`, `app/api/consultations/route.ts`,
`app/api/consultations/[id]/route.ts`, `app/auth/confirm/route.ts`,
`components/site-header.tsx`, `components/auth-button.tsx`,
`lib/supabase/server.ts`, `lib/supabase/proxy.ts`, `.env.example`,
`supabase/migrations/20260811214508_create_user_roles_and_auth_hook.sql`.

Build evidence produced by running `next build` against this tree, reading
`.next/prerender-manifest.json`, `.next/server/app/index.meta`,
`.next/server/app/protected.meta` and the emitted HTML. The build artefacts were
removed afterwards; nothing outside `docs/research/` was modified.

Implementation consulted: `@supabase/auth-js@2.112.2`
(`dist/main/GoTrueClient.js`, `dist/main/lib/constants.js`) for `getClaims`,
`fetchJwk`, `GLOBAL_JWKS` and `JWKS_TTL`.

**No claim in this document is sourced from a blog post or from model recall.**
