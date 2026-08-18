# Production readiness

What this application does under load, what protects it, what it cannot do yet, and how you
can check every one of those claims yourself.

Its governing constraint is [ADR-0005](adr/0005-security-evidence-must-be-publicly-verifiable.md):
whoever reads this has the repository and the deployed URL, and no Vercel or Supabase
dashboard. So nothing here is evidenced by a screenshot or a dashboard graph. Every claim
names the file that implements it, the command that reproduces it, or the number that was
measured and the conditions it was measured under.

Where a measurement is local, it says so. Local numbers at a stated depth are not production
figures, and are not offered as any.

---

## Security posture

### How to read this section

This is a **threat model** — organised by surface, by what each one answers to a stranger,
and by where the evidence for it stops. It is deliberately not a question-and-answer list,
for one reason: [README's Security model](../README.md#security-model) already answers the
questions, describing the four layers this application is *built* from. A Q&A here would
restate those layers in different words, and this repository has already caught four
written claims that had drifted from the code they sat beside
([#36](https://github.com/olibyte/oli-learn/issues/36),
[#39](https://github.com/olibyte/oli-learn/issues/39),
[#48](https://github.com/olibyte/oli-learn/issues/48), and the `user_roles` comment
corrected alongside this section). A second prose description of the same layers is a
fifth one waiting to happen. So the README keeps the layers and this section takes the
axis it cannot: **what is exposed**, in the order an attacker meets it.

Everything marked **measured** was run against the deployed project on **2026-08-17**
using nothing but the two `NEXT_PUBLIC_` values already shipped to every browser. No
account was created, no row was written, and no credential's value appears anywhere in
this document.

### Reproducing every measurement in this section

The two values you need are public by construction — the application sends them to the
browser, so they are in the JavaScript the site serves you:

```bash
curl -sS https://oli-learn.vercel.app/auth/login \
  | grep -o '/_next/static/[^"]*\.js' | sort -u \
  | while read -r u; do curl -sS "https://oli-learn.vercel.app$u"; done \
  | grep -o 'https://[a-z]\{20\}\.supabase\.co\|sb_publishable_[A-Za-z0-9_-]\{20,\}' | sort -u
```

That returns exactly two lines: the project URL and the publishable key. Export them as
`$SUPA` and `$KEY`, and every `curl` below runs as written. Printing them here is the
section's first claim demonstrated rather than asserted — those two values are meant to be
public, and everything that follows is about what they do and do not buy.

### What is worth taking

| Asset | Where it lives | Worst case |
| --- | --- | --- |
| Consultation rows — a student's name, their stated reason, their times | `public.consultations` | Disclosure of low-sensitivity personal data. There is no payment, health or credential data in this schema. |
| Which email addresses have accounts | `auth.users`, via GoTrue's own endpoints | Enumeration. Real, and partly open — see [GoTrue](#surface-3-gotrue-the-auth-api). |
| Who is an admin | `public.user_roles` | Target selection. The rows are unreachable; the table's *existence* is not. |
| The publishable key | The browser bundle, by design | Nothing on its own. It authenticates as `anon` until a session upgrades it. |
| The **secret** key | Nowhere in this repository | Total. `service_role` bypasses RLS, so it would void every proof below at once. |
| The Supabase **personal access token** | One developer's un-tracked `.env` | The real blast radius, and the only unrecoverable one. See [Durability](#data-durability-and-blast-radius). |

### The actors, and the one that matters

Four, in ascending order of what they hold:

1. **An anonymous stranger** with the two public values. Everything in
   [Surface 1](#surface-1-this-applications-own-api) through
   [Surface 4](#surface-4-graphql-and-why-there-is-not-one) is reachable by them.
2. **A signed-in student.** The interesting one, and the reason the boundaries are where
   they are — see below.
3. **An admin.** Adds a read across all students and takes nothing away. There is no
   admin write policy, so an admin acting on someone else's row is refused by the same
   rules that refuse a student.
4. **The holder of the personal access token.** Outside the application entirely; owns
   the project.

**Why the signed-in student is the load-bearing actor.**
[`lib/supabase/client.ts`](../lib/supabase/client.ts) is a **browser** client. A student
who is signed in holds a JWT that reaches PostgREST directly from the devtools console —
they do not have to go through this application to talk to the database. That single fact
decides the whole design: **every rule that matters is in the database**, because a rule
in a route handler is one `fetch` away from being skipped by the very person it applies
to. It is why the state machine is a trigger and not a validator
([ADR-0003](adr/0003-consultation-state-machine.md)), why the 15-minute booking rule is
implemented at three layers but *trusted* only at the database, and why `proxy.ts` is
explicitly **not** an authorization boundary.

### The trust boundaries

```
                      ┌──────────────────────────────────────────┐
  browser ────────────│ Vercel edge → proxy.ts → route handler   │──┐
    │                 └──────────────────────────────────────────┘  │
    │                     routing + a second auth check              │
    │                     (defence in depth, NOT the boundary)       │
    │                                                                ▼
    └──────────────────────────────────────────────────────►  PostgREST / GoTrue
              the same JWT, straight from the console                 │
                                                                      ▼
                                                    ┌─────────────────────────────┐
                                                    │ GRANTS  →  RLS  →  triggers │
                                                    └─────────────────────────────┘
                                                        the actual boundary
```

The lower arrow is the one worth staring at. Anything the upper path enforces, the lower
path can skip; anything the box at the bottom enforces, neither can.

---

### Surface 1: this application's own API

Two endpoints, both writes: `POST /api/consultations` and
`PATCH /api/consultations/[id]`. Reads are Server Components, not HTTP
([ADR-0002](adr/0002-apis-for-writes-rsc-for-reads.md)), so there is no `GET` to secure.
The full contract is [`docs/api-contract.md`](api-contract.md); what follows is only the
part that is a security property.

**Authentication happens before the body is touched.**
[`app/api/consultations/route.ts:19-40`](../app/api/consultations/route.ts) and
[`app/api/consultations/[id]/route.ts:25-45`](../app/api/consultations/%5Bid%5D/route.ts)
both call `getClaims()` and return `401` before `request.json()` runs. The reason is
narrow and worth stating: validation errors are informative by design — they name fields
and constraints — so a handler that parsed first would let an unauthenticated caller read
the schema out of its own error messages. Measured against the deployed application:

```
POST /api/consultations        body: {}                 → 401
POST /api/consultations        body: not json at all    → 401
POST /api/consultations        Authorization: Bearer aaa.bbb.ccc → 401
PATCH /api/consultations/not-a-uuid                     → 401
GET  /api/consultations   (no GET handler exists)       → 401
```

Every one of those is `application/problem+json` carrying
`{"type":"/errors/unauthenticated","title":"Not signed in","status":401}` and the
requested path as `instance`.

**A caveat about what that measurement proves.** Those `401`s come from
[`lib/supabase/proxy.ts:52-80`](../lib/supabase/proxy.ts), not from the handlers — the
matcher in [`proxy.ts`](../proxy.ts) covers `/api`, so an unauthenticated request never
reaches handler code. The handlers' own check is therefore *invisible from outside* and is
defence in depth, which is exactly why it is written down here rather than assumed away.
It is the check that survives a change to the matcher, and there is an open ticket that
would change the matcher — [#57](https://github.com/olibyte/oli-learn/issues/57).

**`getClaims()` is the authoritative check, and it is local.** This project uses
asymmetric ES256 signing keys, so the token is verified against a cached JWKS rather than
by asking the auth server whether it is still valid. The security consequence is stated
plainly because it cuts both ways: a token is trusted until it expires
(`jwt_expiry = 3600`), so a revoked session remains usable for up to an hour. Related and
already recorded by [#31](https://github.com/olibyte/oli-learn/issues/31): **changing a
password does not revoke existing GoTrue sessions** — a rotation needs a
`delete from auth.sessions` beside it, or the old session outlives the old password.

**A malformed id is answered `404`, before any database contact.**
[`route.ts:32`](../app/api/consultations/%5Bid%5D/route.ts) validates the id as a uuid
*after* authenticating and *before* the update, so `/api/consultations/not-a-uuid` and
`/api/consultations/<a real id you do not own>` are the same response. Without it the
malformed id would reach Postgres as `22P02 invalid input syntax`, which is a different
answer and therefore an oracle. This is not inferred:
[#48](https://github.com/olibyte/oli-learn/issues/48) relied on exactly that ordering —
its safety probe is a `PATCH` at a malformed id, chosen because it is answered after
authentication and before the database is touched, so the one request that runs before
that script's guarantee exists cannot itself write.

**Zero rows affected is `404`, not `200`.**
[`route.ts:63-67`](../app/api/consultations/%5Bid%5D/route.ts). RLS does not raise an
error when a student targets a row that is not theirs; it matches nothing and returns
`data: []`, `error: null` — which is also what a successful no-op looks like. A handler
that only checked `error` would answer `200` for a write that changed nothing, which is
both wrong and a disclosure: the caller would learn their id was accepted.
`tests/integration/security.test.ts` asserts the database half of this by checking the
target row is *unchanged afterwards*, not merely that no rows came back.

**`42501` is mapped to `404`, never `403`.**
[`lib/api/problem.ts`](../lib/api/problem.ts). A row you cannot see must be
indistinguishable from one that does not exist, or the API becomes an id oracle — which
is also why the primary key is a `uuid` rather than a sequence. This falls out of the
architecture rather than being maintained by discipline: RLS returns zero rows in both
cases, so the handler **cannot** tell them apart without the secret key that
[ADR-0001](adr/0001-rbac-via-jwt-claim-and-rls.md) bans from application code.

**Postgres errors are translated, never passed through.** The rules trigger raises
`check_violation` with messages this repository wrote, and `fromDatabaseError` maps each
one to text of its own; an unrecognised message falls back to a generic line rather than
leaking raw Postgres output. `500` carries a title and nothing else. So rewording a
trigger cannot silently change the public API, and an unexpected database error cannot
become a schema disclosure.

#### What is not on this surface, and why

- **No rate limit on `POST /api/consultations`.** This is the known gap, costed in
  [Gaps](#the-gaps-named-and-costed).
- **No CORS headers at all** — measured: an `OPTIONS` preflight carrying
  `Origin: https://evil.example` is answered `401` by the proxy, with no
  `Access-Control-Allow-Origin` in the response. That is the correct posture for an API
  with no third-party consumers: a browser will not let another origin's script read the
  response. It is a *default* rather than a decision, and it is recorded here so that
  adding a consumer later is a conscious act.
- **A request size limit exists, but this repository did not write it.** Measured against
  production: a 4,000,014-byte body reaches the `401`; a 4,500,014-byte body is refused
  `413` before any of this project's code runs. That is Vercel's ~4.5 MB platform limit,
  not `next.config.ts` — [`next.config.ts`](../next.config.ts) sets only
  `cacheComponents: true`. Worth knowing precisely because it is inherited: a different
  host would not have it, and the `reason` column's own ceiling (1,000 characters, a check
  constraint) is what actually bounds what gets stored.

---

### Surface 2: the Data API, reached directly

This is the surface the README's layer model does not put in front of you, and it is the
one a reviewer should probe first. PostgREST is public. The measurements below are what a
stranger with the two public values gets.

**Anonymous reads are refused at the grant, not at RLS.** Measured:

```bash
curl -sS "$SUPA/rest/v1/consultations?select=id" -H "apikey: $KEY"
```

```
401  {"code":"42501", … "message":"permission denied for table consultations"}
```

`user_roles` answers identically. That is the *outer* gate doing its job:
[`…_create_consultations.sql`](../supabase/migrations/20260811213255_create_consultations.sql)
revokes everything from `anon` and `authenticated` and grants back only
`select, insert, update` to `authenticated`;
[`…_create_user_roles_and_auth_hook.sql`](../supabase/migrations/20260811214508_create_user_roles_and_auth_hook.sql)
grants `user_roles` to nobody at all. Two things follow that are stronger than they look:

- **No role holds `DELETE` on `consultations`, and `TRUNCATE` is revoked.** Not "there is
  no delete policy" — the *privilege* is absent, so a mistakenly-added `for delete` policy
  later would be dead code rather than a breach. `TRUNCATE` matters separately because the
  PostgreSQL manual is explicit that whole-table operations are **not** subject to row
  security; RLS would not have stopped it.
- **The RPCs are refused too.** `admin_consultations_page` and
  `custom_access_token_hook` both answer `401 42501 permission denied for function` to an
  anonymous caller. The hook's revoke is therefore live on the deployed project, not just
  in a migration file.

**What the revokes do not hide: existence.** Measured, and this is a real disclosure
rather than a theoretical one:

| Request | Answer |
| --- | --- |
| `/rest/v1/consultations` | `401` · `42501` · *permission denied for table consultations* |
| `/rest/v1/user_roles` | `401` · `42501` · *permission denied for table user_roles* |
| `/rest/v1/profiles` | `404` · `PGRST205` · *Could not find the table 'public.profiles'* |
| `/rest/v1/no_such_table_xyz` | `404` · `PGRST205` · *Could not find the table …* |

`401` means "it is there and you may not have it"; `404` means "it is not there". So the
Data API is a **table-existence oracle for anonymous callers**, and PostgREST's `hint`
helpfully names `public.user_roles` back to the person asking. The same holds for
functions: sending a body matching `(event jsonb)` confirms `custom_access_token_hook`
exists and confirms its signature, revoke notwithstanding.

This is not a vulnerability — nothing is readable, and the schema is in a public
repository anyway, so the oracle discloses something already published. It is written down
because **the schema used to claim otherwise**: `user_roles` carried a table comment
reading *"Deliberately unreachable through the Data API"*, which overclaims by exactly the
distinction above. [#38](https://github.com/olibyte/oli-learn/issues/38) measured it first;
[`…_correct_user_roles_comment.sql`](../supabase/migrations/20260817092000_correct_user_roles_comment.sql)
fixes the sentence. That is a new migration rather than an edit to the applied one,
because rewriting a migration that has already run would leave the file describing
something other than what was applied — the same class of mistake as the sentence it
corrects.

**One thing is better than prior knowledge would suggest.** OpenAPI introspection at
`/rest/v1/` is now **blocked** for publishable keys, per Supabase's
[March 2026 changelog](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key).
Measured:

```
401  {"message":"Secret API key required",
      "hint":"Only secret API keys can be used for this endpoint."}
```

The entire schema used to be dumpable from the browser key. It is not any more — so a
reviewer working from pre-2026 experience should check that before assuming this project
publishes its schema shape. (It publishes it anyway, in `supabase/migrations/`. The
difference is that a public repository is a deliberate disclosure and an introspection
endpoint is not.)

---

### Surface 3: GoTrue, the auth API

Also public, also reachable without this application, and the surface where the honest
answer is least comfortable.

**The password floor is live, and it is observable.** Measured — a request that creates
no account, because a rejected password cannot become one:

```bash
curl -sS -X POST "$SUPA/auth/v1/signup" -H "apikey: $KEY" \
  -H 'Content-Type: application/json' \
  --data '{"email":"anything@example.com","password":"short"}'
```

```
422  {"error_code":"weak_password","msg":"Password should be at least 12 characters.",
      "weak_password":{"reasons":["length"]}}
```

`reasons` contains `length` and **nothing else**, which is the positive evidence that
composition rules are off rather than merely unmentioned — GoTrue accumulates every
reason it has. The argument for that configuration (NIST SP 800-63B withdrew composition
rules) is in [`supabase/config.toml`](../supabase/config.toml) beside the setting and in
[README](../README.md#signup-and-the-password-rule); it is not repeated here.

That measurement does a second job worth naming. `config.toml` is a *file*, and a file is
only evidence about a deployed project if the two are known to agree. This one request
shows that `minimum_password_length = 12` is live, which is the observable half of
"`supabase config push` sends the whole configuration, not a diff"
([README §2](../README.md#2-supabase-config-push-pushes-the-entire-auth-config)). It is
the reason the rest of this section is willing to cite that file.

**Signup does not disclose whether an address already has an account** — at least not at
this stage. Measured with the same under-length password against a seeded address and an
unknown one:

```
admin@example.com                       → 422 weak_password, reasons:["length"]
definitely-not-a-user-4f2a@example.com  → 422 weak_password, reasons:["length"]
```

Identical. Password validation runs before the existence check, so that path is closed.
**Deliberately not measured beyond this point**: settling what a *valid* password returns
for an unknown address means creating an account on the production project with no way to
delete it, which is the same line
[#60](https://github.com/olibyte/oli-learn/issues/60) declined to cross.

**Password recovery is an account-existence oracle, and this application cannot fix it.**
Measured, three requests, all of which create nothing:

```
POST /auth/v1/recover  {"email":"admin@example.com"}     → 400 email_address_invalid
POST /auth/v1/recover  {"email":"student@example.com"}   → 400 email_address_invalid
POST /auth/v1/recover  {"email":"definitely-not-a-user-4f2a@example.com"}
                                                          → 200 {}
```

Same domain on both sides of that line, so the discriminator is **existence, not
deliverability**: hosted GoTrue looks the user up before it validates the address. The
`200 {}` exists precisely to prevent enumeration, and the `400` defeats it.

The product-side consequence has already been dealt with:
[#60](https://github.com/olibyte/oli-learn/issues/60) replaced `/auth/forgot-password`'s
form with a card that makes no request, so the login page's own link is no longer a
one-click oracle and the two demo accounts no longer render a red *"Email address is
invalid"* to anyone who uses them. **The API-side oracle remains, and it is not this
application's to close** — it is behaviour of hosted GoTrue, on an endpoint that answers
whether or not this application calls it. Closing it needs custom SMTP on a domain we own,
which is the same prerequisite as email confirmation
([#32](https://github.com/olibyte/oli-learn/issues/32)) and the same deferral.

**`/auth/update-password` is reachable without a session, and renders.** Found while
writing this section. `proxy.ts` exempts everything under `/auth` — it must, or nobody
could reach the login page — and
[`app/auth/update-password/page.tsx`](../app/auth/update-password/page.tsx) has no guard
of its own, so `GET /auth/update-password` answers **`200`** to an anonymous visitor.

It is worth being precise about *how* unguarded: `next build` marks the route `○ (Static)`
with a 16,750-byte prerendered page, so it is a build artifact served from the CDN. There
is no request-time decision to make there at all — not a check that passes, an absence of
one.

The boundary holds one layer down, and that was measured rather than assumed. The form
calls `supabase.auth.updateUser()` from the browser, which is
`PUT /auth/v1/user`:

```
PUT /auth/v1/user   no Authorization header        → 401 no_authorization
PUT /auth/v1/user   Authorization: Bearer aaa.bbb.ccc → 403 bad_jwt
```

So a stranger can load a password form that cannot change a password. Two things about it
are still worth recording. It is an **unlinked** route — nothing in the application points
at it now that no reset email is sent — so it is a live surface nobody navigates to and
therefore nobody notices; and its `secure_password_change = false` means a *signed-in*
visitor who types the URL changes their password without re-entering the old one, which
matters if a session is ever left open on a shared machine. What to do about the route
— surface it properly, delete it, or leave it — is a product decision handed to
[#44](https://github.com/olibyte/oli-learn/issues/44). Its security posture is stated
here: reachable, harmless without a session, and not a place to add anything.

**Rate limiting on this surface exists, unlike the other two.**
[`[auth.rate_limit]`](../supabase/config.toml) sets 30 sign-in/sign-up requests per 5
minutes per IP, 150 token refreshes per 5 minutes per IP, and 30 OTP verifications. Those
are per-IP and therefore not a defence against a distributed attempt, but they are real,
and they are the only rate limits anywhere in this system. `email_sent` is deliberately
commented out — it was dead config that the CLI never pushed, and a line that reads as a
protection which is not there is worse than no line.

---

### Surface 4: GraphQL, and why there is not one

[`supabase/config.toml`](../supabase/config.toml) exposes `graphql_public` alongside
`public`, and pg_graphql is enabled by default on new Supabase projects. Reasoning from
those two facts, [#36](https://github.com/olibyte/oli-learn/issues/36) recorded that the
deployed project "may well have a REST-equivalent surface with zero local coverage" — a
second API in front of the same tables that no test in this repository touches.

**Measured, it does not.**

```bash
curl -sS -X POST "$SUPA/graphql/v1" -H "apikey: $KEY" \
  -H 'Content-Type: application/json' \
  --data '{"query":"{ __schema { queryType { name } } }"}'
```

```
200  {"errors": [{"message": "pg_graphql extension is not enabled."}]}
```

A real query gets the same answer, so this is not an introspection-only restriction — the
resolver is absent. The route itself exists (`graphql_public` *is* exposed, which is why
the request is routed at all and answered `200` with a GraphQL error envelope rather than
`404`); what is missing is the extension behind it. Extensions are installed per
database, not per role, so a signed-in caller gets the same answer — which is why settling
this needed no live credentials. The local stack returns the identical string, so local
and deployed agree: run the same command against `http://127.0.0.1:54321` after
`pnpm supabase start`.

Two honest qualifications. First, this measurement agrees with
[#38](https://github.com/olibyte/oli-learn/issues/38), which probed the same endpoint and
recorded "no GraphQL introspection surface" — so **two findings in this repository's own
issue history have contradicted each other since 2026-08-13**, one measured and one
reasoned, and this settles it in favour of the measured one. That is the pattern this
document exists to interrupt, and it is why nothing above is asserted from
documentation alone. Second, the absence is a fact about the project today, not a
guarantee: pg_graphql
is one `create extension` away, and nothing in `supabase/migrations/` would notice. If it
is ever enabled, the surface appears immediately — under the same policies, since RLS is a
property of the tables rather than of the API in front of them, so it would be a coverage
gap in the tests rather than a hole in the boundary.

---

### What holds the boundary

The proof is a suite, not a paragraph, so this is deliberately short.

`tests/integration/security.test.ts` — **50 tests**, run against a real Postgres by
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)'s *Security suite (local
Supabase)* job on every push and pull request to `main`, and by `pnpm test` locally. They
cover read isolation in both directions by id and in bulk, that a student cannot edit or
reassign another's row, that nobody can delete anything, that an admin can read everything
and write only their own, and that `user_roles` is unreachable both unfiltered and
filtered.

**What makes them worth citing is that they were verified by mutation** — breaking the
policy is shown to break the tests:

| Mutation | Tests that turn red |
| --- | --- |
| `select` policy widened to `using (true)` | 6 |
| `delete` granted to `authenticated` | 3 |
| `user_roles` made readable | 2 |
| Update `USING` widened and `WITH CHECK` dropped | 2 |
| `admin_consultations_page` flipped to `security definer` | 1 |

Run them yourself: `pnpm supabase start && pnpm supabase db reset && pnpm test`. Or read
the public log — the run prints `50 passed`, and the badge in
[README](../README.md) links to it.

Two structural points that the suite alone does not make:

- **Grants and RLS are independent gates.** Grants decide whether a role may touch the
  object; RLS decides which rows. `user_roles` has both closed. Supabase's own RBAC guide
  creates the read policy but never enables RLS, which leaves the policy inert — safe only
  because of the revoke, and one careless `grant` away from being wide open *with a policy
  giving false assurance*. This schema enables it.
- **The auth hook is deliberately not `security definer`**, so it runs as
  `supabase_auth_admin` and stays subject to that policy. The signup trigger beside it
  **must** be `security definer`, because it writes to a default-deny table. Getting the
  two backwards fails silently in opposite directions — a null role claim that looks
  exactly like the hook not running, or a wider privilege than the write needs.

---

### Secrets

**What is in this repository, checked rather than asserted.**
[`lib/security/secret-key-ban.test.ts`](../lib/security/secret-key-ban.test.ts) — 17
tests, no infrastructure, in `pnpm test:unit` — runs two scans that cite two different
documents:

1. **Source** (`app/`, `components/`, `lib/`, `scripts/`, `tests/`, `proxy.ts`) must not
   *mention* the secret key: the two env var names, the `service_role` string, an
   `sb_secret_…` literal, or a pasted legacy key — that last one found by base64-decoding
   any JWT-shaped literal, because `pnpm supabase status` prints a `SERVICE_ROLE_KEY`
   whose `role` claim is inside the payload and invisible to a string search. This answers
   to [ADR-0001](adr/0001-rbac-via-jwt-claim-and-rls.md).
2. **Every file git tracks** must not carry a live credential *value*. This answers to a
   different requirement — that publishing this repository publishes no credential — and
   it is why the two scans differ: the first fires on a mention, the second only on a
   value.

The check never prints what it matched: it reports the file, the line and the *name* of
the variable. Both scans are verified by mutation, and both assert they looked at
something real, because a walk that finds nothing would otherwise pass a "no violations"
test. `docs/` is not scanned, deliberately — [ADR-0001](adr/0001-rbac-via-jwt-claim-and-rls.md)
has to be able to state its own rule, and so does this paragraph.

**Why this check earns its place.** All 50 isolation tests reach PostgREST with the
publishable key. A single `createClient` built with the secret key would void every one of
them and turn **none** of them red. This is the one bypass that would leave the strongest
evidence in the repository green while making it meaningless, which is why it is the one
static check that exists.

**Two things are committed on purpose, and neither is a credential.**

- [`.env.example`](../.env.example) ships `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pointing at **localhost**, at the Supabase CLI's
  fixed defaults — identical on every machine, reachable only on loopback. They are
  committed so that `pnpm supabase start && pnpm supabase db reset && pnpm dev` gives a
  working application with both roles seeded, with no account anywhere and nothing to
  request from anyone. The two `SUPABASE_*` slots below them are empty.
- [`supabase/seed.sql`](../supabase/seed.sql) sets a **local-only** password on the two
  seeded accounts, so `db reset`, the integration suite and `scripts/verify-api.mjs` work
  with no configuration. It unlocks a Docker container on the reader's own machine.

The live demo accounts carry a long random password that is **not** in this repository and
never was; it reaches a reviewer out of band ([README](../README.md#reaching-both-roles)).
Those two facts are not in tension: publishing a password that unlocks your own laptop is
configuration, publishing one that unlocks the deployed demo hands write access to
anyone who scrolls that far.

**The credential that would actually hurt is not a project credential.** `.env` on a
developer's machine holds `SUPABASE_ACCESS_TOKEN`, a **personal** access token. Supabase's
documentation is explicit that a PAT carries the same privileges as the user account, with
no documented way to scope one to a project or an operation. Its holder can read every API
key including the secret key, run arbitrary SQL, and delete the project outright — an
endpoint documented with no confirmation step. Supabase auto-revokes `sb_secret_` keys
found in public GitHub repositories; that safety net does not cover PATs.

`.env` is git-ignored and has never been committed, verified by
`git log --all -- .env` returning empty, and `.gitignore` was tightened during
[#52](https://github.com/olibyte/oli-learn/issues/52) — it had matched `.env` and
`.env*.local` but not `.env.production`, which was addable without `-f`. It is now
`.env*` with `!.env.example`.

---

### Supply chain and scanning

The mechanics are in [README](../README.md#scanning-and-what-you-can-check-without-an-account)
and the reasoning is [ADR-0005](adr/0005-security-evidence-must-be-publicly-verifiable.md).
What belongs here is **how a reader checks it, and what the checking does not reach.**

**Four things scan this repository, and only three left a file.**
[`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) (CodeQL
`security-extended`, weekly and on every push and PR to `main`),
[`.github/dependabot.yml`](../.github/dependabot.yml) (weekly npm and `github-actions`
updates), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (lint, types, 239
tests, build) — and **GitGuardian**, a marketplace app that posts a
`GitGuardian Security Checks` run on pull requests and has no file in this repository at
all. It is named because until this section was written the README's Scanning list held
three committed files and ADR-0005 named four scanners, so a reader could arrive at either
count; the README now names it too. More importantly it is
[ADR-0005's own worked example](adr/0005-security-evidence-must-be-publicly-verifiable.md):
its **verdict** is anonymously readable while its **findings** need a GitGuardian account
— exactly what Snyk was rejected for. An unexplained green check is a claim wearing
evidence's clothes; naming it and stating what it is worth is the alternative to removing
it.

**Verify it yourself, without an account.** Check-run conclusions are anonymously
readable — this is the mechanism, not a promise:

```bash
gh api repos/olibyte/oli-learn/commits/<sha>/check-runs \
  --jq '.check_runs[] | "\(.name) — \(.conclusion) — \(.app.slug)"'
```

On a pull request head that returns six runs across four apps (`github-actions`,
`github-advanced-security`, `gitguardian`, `vercel`); on a push to `main`, three from
`github-actions`. The asymmetry is itself informative: CodeQL's PR annotations and
GitGuardian's check only exist where there is a change to attach them to, which is an
argument for reviewing this project through pull requests.

**Two controls that are not evidence, said plainly.** Secret scanning and push protection
are on, and `sha_pinning_required` is off. Both are *repository settings*, so by this
document's own standard a reader cannot check either — the alerts endpoints answer `401`
without write access. They are recorded as controls, not proofs:

| Setting | Value | What it means here |
| --- | --- | --- |
| `secret_scanning`, `secret_scanning_push_protection` | enabled | Refuses a push carrying a credential GitHub recognises, before it becomes history. |
| `secret_scanning_non_provider_patterns` | **disabled** | The half that would catch a credential with no vendor signature — which is what `SUPABASE_PROJECT_PASSWORD` is. |
| `dependabot_security_updates` | enabled | Publishing the repository did not turn this on; it was switched on deliberately. |
| `default_workflow_permissions` | `read` | The `GITHUB_TOKEN` handed to a workflow cannot write to the repository. |
| `sha_pinning_required` | **`false`** | Actions *are* pinned to commit SHAs, but by convention and Dependabot, not by enforcement. |

Measured 2026-08-17: the first three from `gh api repos/olibyte/oli-learn --jq
.security_and_analysis`, `default_workflow_permissions` from
`…/actions/permissions/workflow`, and `sha_pinning_required` from `…/actions/permissions`
— **not** the `/workflow` sub-endpoint, which does not carry the field.
[#54](https://github.com/olibyte/oli-learn/issues/54) recorded it from the wrong endpoint,
so it was re-read rather than inherited. All five are readable only with write access,
which is why they are here as controls rather than in the evidence above.

Two of those rows are the honest ones. `sha_pinning_required` being off means two workflow
files carry SHA pins because
[ADR-0005](adr/0005-security-evidence-must-be-publicly-verifiable.md) says they should and
because the `github-actions` Dependabot ecosystem keeps them current — nothing rejects a
third workflow that uses a tag. And non-provider patterns being off is the precise reason
[`lib/security/secret-key-ban.test.ts`](../lib/security/secret-key-ban.test.ts) is not
redundant with GitHub's scanner: GitHub matches *vendors'* token shapes, and this
repository's own risky variable names are not one. Both settings are a click away and
neither click is verifiable by a reviewer, which is the whole reason they are written down
instead of relied on.

**The one piece of evidence in this repository with an expiry date.** GitHub keeps Actions
run logs for **90 days** by default. The badge covers *current* `main` and `ci.yml` covers
*what runs*, both indefinitely; what ages out is the proof that it was green **on a
particular commit** — which is the form every other proof here takes. Inside a review
window this costs nothing. It is stated because a reader arriving later would find a link
to a log that no longer exists, and because the alternative — committing run output —
would be an assertion with a transcript attached, which
[ADR-0005](adr/0005-security-evidence-must-be-publicly-verifiable.md) rejects for the same
reason it rejects screenshots. The recommendation is to re-run the workflow rather than
archive it.

---

### Data durability and blast radius

The uncomfortable part, and it is not about attackers.

**The Free plan takes no automatic backups, and PITR is unavailable.** Daily backups start
at Pro; PITR is a paid add-on above that which also needs a larger compute size. Supabase's
own recommendation for Free is to do it yourself with `supabase db dump`. There is a trap
in that advice worth stating before anyone relies on it: the CLI excludes Supabase-managed
schemas, so a default dump captures `consultations` but **not** the `auth.users` rows both
tables foreign-key into — a restore into a fresh project would fail on the foreign keys. A
repeatable procedure needs three dumps, not one, and that path is **inferred from the
documentation and not tested**, which is why it is described rather than published as a
procedure.

**Nothing can be destroyed row by row.** Signed out, every verb is `401`/`42501`. Signed
in, a caller can insert rows they own and update them within the state machine, and that
is all. No `delete` privilege exists for any Data API role, `truncate` is revoked, and
cancelling is a status transition ([ADR-0003](adr/0003-consultation-state-machine.md)) so
history is not deletable by design.

**The real exposure is flooding, and it is a denial of service rather than a breach.**
Signup is open, `enable_confirmations = false`, and the Data API publishes no rate limit —
so anyone can mint an `authenticated` session, throttled only at 30 sign-ups per 5 minutes
per IP, and then insert. The section beside this one measured what that costs: **358 bytes
per row**, so the Free plan's 500 MB quota is reached at roughly **1.47 million
consultations**. Hitting it flips the project to read-only; sustained overage escalates
through pausing and `402`. There is **no spend risk** — the Free plan is never charged, so
the failure mode is unavailability, never an invoice.

**The largest blast radius is the account, not the application.** A leaked personal access
token deletes the project, and on Free there is nothing to restore from — the two combine
into the only unrecoverable case in this system. Mitigations that cost nothing: a
short-expiry PAT deleted once `supabase link` has run, and TOTP on the Supabase account.
Note that MFA *enforcement* is Pro-and-above; a Free organisation can enable it, not
require it. Network restrictions do not help either — they cover Postgres and the pooler,
explicitly **not** the HTTPS APIs.

---

### What the evidence does not cover

The 50 isolation tests are the strongest claim in this repository, so their limits belong
next to them rather than in a footnote. This list was **six** items when
[#36](https://github.com/olibyte/oli-learn/issues/36) wrote it; the first —
"anything on the `service_role` path" — was closed by
[#52](https://github.com/olibyte/oli-learn/issues/52), which turned that ban into
[`lib/security/secret-key-ban.test.ts`](../lib/security/secret-key-ban.test.ts). Five
remain.

1. **They prove the migrations, not the deployed database.** They run against a local
   stack built from `supabase/migrations/`. Someone toggling RLS off in the Supabase
   dashboard would turn nothing red — and under
   [ADR-0005](adr/0005-security-evidence-must-be-publicly-verifiable.md) a reviewer cannot
   check the dashboard either. What this section offers against that gap is
   [Surface 2](#surface-2-the-data-api-reached-directly): those probes run against the
   *deployed* project, and a `42501` from production is evidence about production. They
   are narrower than the suite and that is the trade.

   **This limit is not hypothetical, and writing this section is what found that out.**
   Checking before pushing the comment migration above:

   ```bash
   pnpm supabase migration list --linked
   ```

   Two migrations were local-only, and the one that mattered was
   `20260813104500_consultation_booking_boundary.sql` — the 15-minute rule's **database**
   check, four days old and never applied to the deployed project. That is precisely the
   layer its own migration header calls the only one that holds, because the other two
   statements of the rule are a browser client and a route handler, and a signed-in
   student's JWT reaches PostgREST without passing either. So for four days the deployed
   project enforced that rule nowhere, while this repository, its README and its 226
   passing tests all described it as enforced. Nothing was red. Nothing could have been:
   every test in the suite runs against a database built from these files, and the files
   were correct.

   Both pending migrations were applied on 2026-08-17 and `migration list --linked` now
   reports `local == remote` for all seven, so the gap described above is closed. It is
   written down anyway, because a limit that has actually bitten once is worth more to a
   reader than the same limit stated as a possibility.

   The honest generalisation is not "remember to push". It is that **`main` being green is
   a claim about the repository, and this system has a second copy of the truth** —
   `supabase db push` and `supabase config push` each move part of it, by hand, with no
   check that they have. Two things in this document partly cover it: the
   [Surface 3](#surface-3-gotrue-the-auth-api) password probe, which is the observable
   proof that the auth *config* is live, and the
   [Surface 2](#surface-2-the-data-api-reached-directly) probes, which are the same for
   grants. Neither covers trigger bodies, and `migration list --linked` — which does — needs
   credentials a reviewer does not have. Recorded here rather than fixed, because the fix
   is a CI job with production access and that is a larger decision than this section.
2. **A second API surface is one `create extension` away.** pg_graphql is absent today
   ([Surface 4](#surface-4-graphql-and-why-there-is-not-one)) and nothing in the
   repository would notice if it were enabled. RLS would still apply; the tests would
   still not look.
3. **No auth-layer attacks are tested.** JWT forgery, session fixation, the recovery flow,
   and the fact that changing a password does not revoke live sessions — none of that is
   in the suite, and the recovery oracle above was found by probing rather than by a test.
4. **Nothing about aggregate or timing disclosure.** An admin-only count leaking through
   response shape or latency would not be caught. The admin page carries no stat tiles,
   which narrows this by accident rather than by design.
5. **The 404-not-403 property is asserted at the database, not at the handler.** The tests
   show RLS returns zero rows; they do not show the route handler translates that into
   `404` rather than `500`. `scripts/verify-api.mjs` covers the HTTP layer separately, and
   it is not in CI — [#54](https://github.com/olibyte/oli-learn/issues/54) recorded why
   (it needs an application server on top of the stack) and what would replace it: handler
   unit tests over status codes and problem bodies.

---

### The gaps, named and costed

Most of these are decisions. One is not, and it is labelled.

**No rate limit on `POST /api/consultations`.** The known gap. It would go in
`app/api/consultations/route.ts` immediately after the `getClaims()` check and before the
body is parsed — keyed on the authenticated `sub`, not the IP, since a session is required
to reach it at all. The honest problem is *where the counter lives*: Vercel functions are
stateless and per-instance, so an in-memory counter is per-instance and effectively
useless, which makes the real cost a durable store — the same Redis this project
[argued its way out of](#cdn-and-caching) on the read path. The alternative that fits the
architecture is a database-side constraint (a partial unique index, or a count check in
the rules trigger), which costs a write-path query. Neither is a one-liner, which is why
this is deferred and why *both halves* of the flooding path — the account-minting step and
the insert-side cap — are out of scope together.

**No captcha.** `[auth.captcha]` is scaffolded and commented out in
[`supabase/config.toml`](../supabase/config.toml), so it is off on the deployed project
too — `config push` sends the whole configuration, and a `POST /auth/v1/recover` carrying
no token is answered without complaint. hCaptcha would close the account-minting half of
the flooding path cheaply, and the cost that keeps it deferred is that it is not
signup-only: enabling it gates login and password update as well, so every auth form has
to pass a token or stop working, and one integration test signs up.

**No security response headers.** **Found while writing this section**, and the one item
here that is an oversight rather than a trade. Measured on the deployed application, the
only one present is `strict-transport-security: max-age=63072000; includeSubDomains;
preload`, and Vercel adds that — not this repository. There is no `Content-Security-Policy`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`;
[`next.config.ts`](../next.config.ts) sets only `cacheComponents: true` and has no
`headers()` block at all.

```bash
curl -sSI https://oli-learn.vercel.app/ | grep -i 'content-security\|x-frame\|x-content-type\|referrer\|permissions-policy'
# returns nothing
```

The gap splits unevenly, and lumping it together would hide that.

*The cheap half is genuinely cheap.* `X-Content-Type-Options: nosniff`, a
`Referrer-Policy`, a `Permissions-Policy` and a frame-ancestors rule are one `headers()`
block, and the frame rule is not academic here: cancelling or completing a consultation is
a one-click control inside an authenticated page, which is the classic clickjacking shape.
There is no good reason this is absent.

*The expensive half is expensive for a reason specific to this application.* A CSP worth
having blocks inline scripts, and Next.js injects its own — so it needs per-request nonces
generated in `proxy.ts`. The
[Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy) states the
consequence directly: nonces require dynamic rendering, and **"Partial Prerendering is
incompatible with nonce-based CSP since static shell scripts won't have access to the
nonce."** Every route in this application is a Partial Prerender — that is the entire
subject of [Scalability and performance](#scalability-and-performance), which measures the
three shells at 12,809, 5,711 and 5,508 bytes. A nonce-based CSP therefore costs all three
and moves every page to per-request rendering. The nonce-free alternative the same guide
offers falls back to `script-src 'self' 'unsafe-inline'`, which permits precisely the
injection a CSP is bought to stop; its `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'` and `frame-ancestors 'none'` directives are still real, but they are
the cheap half again under a different header name.

**Recommendation, stated so it can be disagreed with:** add the cheap headers now, and
treat a nonce-based CSP as a deliberate trade against prerendering rather than as a
hardening task — the two cannot both be had on this architecture, and this document should
not pretend otherwise.

**Concurrency is last-write-wins.** Two tabs patching the same consultation will not
conflict; the second wins silently. `If-Match` over `updated_at` is the standard fix. Not
a security property, listed because a reader checking the write path will notice it.

**Role changes take effect on token refresh**, not immediately — up to `jwt_expiry`, one
hour. Acceptable because roles are seeded and static here; a user-editable role would need
a forced refresh, and the same token lifetime is what delays session revocation after a
password change.

**Email addresses are never proved.** Confirmations are off and cannot currently be turned
on — Supabase's built-in SMTP delivers only to members of the project's own organisation,
and the signup transaction *rolls back* when that check fails, so switching confirmations
on would hand a member of the public HTTP 400 and no account
([#32](https://github.com/olibyte/oli-learn/issues/32)). The consequence to be honest
about: an account may carry an address its creator does not control. Nothing in this
application emails users or treats the address as an identity beyond sign-in. Custom SMTP
on a domain we own is the single fix for this, for password recovery, and for the recovery
oracle above.

---

## Scalability and performance

### What costs nothing as the number of students grows

**The role never costs a query.** RBAC is a `user_role` claim stamped into the JWT by a
Postgres access-token hook ([ADR-0001](adr/0001-rbac-via-jwt-claim-and-rls.md)), so no request
reads a role table to find out who you are. `getClaims()` verifies the token locally against
ES256 signing keys; the only network call is a JWKS fetch, and it is cached three times over —
a module-level map with a 10-minute TTL inside `@supabase/auth-js`, Supabase's own 10-minute
edge cache, and Fluid compute keeping instances warm. Per-request client construction costs no
round trip.

**The RLS predicate is evaluated once per statement, not once per row.** Every policy wraps its
auth call — `(select auth.uid())`, `(select auth.jwt())` — which the planner hoists into an
`InitPlan`. This is visible rather than asserted. Against the local stack:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='admin@example.com'),
                    'user_role','admin','role','authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers, costs off)
select * from public.consultations
 where (scheduled_at, id) < ('infinity'::timestamptz,
                             'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
 order by scheduled_at desc, id desc
 limit 26;
rollback;
```

```
Limit (actual rows=4)
  InitPlan 1
    ->  Result (actual rows=1)
  InitPlan 2
    ->  Result (actual rows=1)
  ->  Sort
        ->  Seq Scan on consultations (actual rows=4)
              Filter: ((ROW(scheduled_at, id) < ROW('infinity', 'ffffffff-…')) AND
                       (((InitPlan 1).col1 = student_id) OR
                        (((InitPlan 2).col1 ->> 'user_role') = 'admin')))
```

Two `InitPlan` nodes, each `rows=1`, above a scan of the whole table. That is the mechanism —
the auth calls ran once, and the per-row `Filter` only compares their results. Supabase's own
benchmark for this transformation is 179 ms → 9 ms.

**There is one `select` policy, not two.** Multiple permissive policies for the same role and
action are each evaluated on every query, so the student and admin arms are OR-ed into a single
policy. The advisors check for both of these mistakes — lints
[0003](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
and [0006](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)
— and neither fires. You can run them yourself; see [Running the advisors](#running-the-advisors-yourself).

**Both dashboard reads are served by an index built for their exact shape**, and the third
query shape in the system is a primary-key lookup. All three are in the table below.

### Where it stops being free

Three places. The interesting one was a bug, and it was found by measuring rather than by
reading.

**1. Admin pagination — and the claim this repository used to make about it.**

The admin view is keyset-paginated because a growing table makes `OFFSET` untenable: `OFFSET n`
reads and discards `n` rows before returning any. The cursor is the tuple `(scheduled_at, id)`,
because `scheduled_at` alone is not unique and rows sharing a timestamp would be skipped or
repeated across a page boundary.

That much was always true. What was **false** — asserted in the page, in a migration header, and
in `README.md` — is that the cursor made page depth free. It did not, because of how the cursor
was expressed:

> An index scan is bounded by constraints **on columns**. A top-level `OR` is not one.

`scheduled_at < X or (scheduled_at = X and id < Y)` is a top-level `OR`. Postgres can only reach
an `OR` through a `BitmapOr`, which yields an unordered bitmap and would force a full `Sort`
under the `LIMIT` — strictly worse — so the planner keeps the ordered index scan and demotes the
entire cursor to a `Filter`. The composite index still supplied the *ordering* (there was no
`Sort` node, and that half of the claim was right); it bounded nothing. Every row already paged
past was read and thrown away, which is exactly what `OFFSET` does.

The fix is a row-constructor comparison, `(scheduled_at, id) < (X, Y)`, which Postgres compares
left-to-right and stops at the first unequal pair — precisely a multicolumn index's own
ordering, which is why it becomes an `Index Cond`. Measured on the local stack against 200,000
rows, whole-plan buffers by cursor depth:

| Cursor depth | `OR` form (before) | Row comparison (now) | Plain `OFFSET` |
| --- | --- | --- | --- |
| 0 | 56 | **4** | 4 |
| 1,000 | 88 | **4** | 36 |
| 10,000 | 385 | **4** | 334 |
| 100,000 | 3,389 | **5** | 3,312 |

Linear against flat — and note that the `OR` form tracks `OFFSET` almost exactly, which is the
whole finding in one column. The plan carries `Index Cond: (ROW(scheduled_at, id) < ROW(…))`
with no rows removed, and it survives a *generic* plan, taken through `PREPARE`/`EXECUTE` after
five warm-ups.

PostgREST has no row-comparison operator, so the query could not stay a REST filter. It lives in
the database as [`admin_consultations_page`](../supabase/migrations/20260813021500_admin_keyset_rpc.sql),
called over RPC. It is **`security invoker`**, stated explicitly in the DDL because it is
load-bearing: RLS still decides what the caller sees, so this is not a privileged read. That is
not asserted either — `tests/integration/security.test.ts` fails if the function is flipped to
`security definer`, and exactly that one test fails.

`page_size` is **clamped to 100** inside the function. The argument arrives from the client, and
RLS stops a student reading rows that are not theirs but stops nobody asking for the whole table
in one response.

**2. There are no system-wide totals, deliberately.** An exact `count(*)` over an RLS-filtered
table is a full scan, and it would be a full scan on every page load of a paginated view. The
admin page says what it is instead — "Newest first, 25 per page" — and carries no stat tiles.
This is the one place where the honest answer costs a feature.

**3. The student dashboard read has no `LIMIT`.** It returns every consultation that student has
ever had. Its cost is linear in one student's own history and completely independent of table
size, so it does not degrade as the *system* grows — but it is the only read in the application
with no ceiling of its own. A `.limit()` or a date floor is where that would be fixed, and
`app/protected/page.tsx:24-28` is where it would go.

### What changes at 10,000 students, and at 10 million consultations

**At 10,000 students: none of the query shapes change.** The role lookup is a single-row
primary-key hit that cannot degrade. The student read is bounded by one person's history, not by
the number of people. The admin page is flat in depth. What binds first is not SQL:

- **PostgREST's own connection pool.** There is no connection string in this repository and no
  function opens a Postgres connection — the Data API sits *outside* Supavisor and uses
  PostgREST's internal pooler. "Is this app using the right connection mode" has no answer,
  because there is no mode to get wrong. The ceiling that does apply is that pool's size, which
  is a project setting rather than a code change.
- **`statement_timeout = 8s` on the `authenticator` role** (measured). The Data API kills
  anything slower, so a pathological query never shows up as a slow query — it shows up as an
  error. Worth knowing before hunting for one in the wrong place.
- **The auth hook is the hottest statement in the system.** It runs on every token mint *and*
  every refresh, which for a signed-in population is far more often than anyone loads a
  dashboard. It is a single-row lookup on `user_roles_pkey`, so it is fine — but see the
  monitoring section, because it is also invisible.

**At 10 million consultations: still none of the query shapes change**, and storage is what
moves. Measured on the local stack by loading 200,000 rows inside a rolled-back transaction:

| | |
| --- | --- |
| Heap | 32 MB |
| Both composite indexes | 36 MB |
| Total | 68 MB — **358 bytes per row** |

The indexes cost slightly more than the table, which is the honest price of serving two
different dashboards from the same rows. Extrapolated, the Free plan's 500 MB database quota is
reached at roughly **1.47 million consultations**, and 10 million would need about 3.6 GB — a
paid plan long before it is a design problem. ([#38](https://github.com/olibyte/oli-learn/issues/38)
established that the quota is also a security surface: hitting it flips the project read-only.)

What would actually need to change at that size:

- **A bound on the student read**, as above. It is the only shape that grows without a ceiling.
- **Bidirectional paging.** The admin view is forward-only; true bidirectional keyset needs a
  reversed query and a direction flag.
- **Vacuum and bloat would need watching**, though less than usual: no role holds `DELETE` on
  `consultations` at all, and the state machine forbids churn beyond `status` and
  `scheduled_at`, so dead tuples are bounded by the number of consultations rather than by a
  delete-heavy workload.
- **Nothing about the RLS model.** It is O(1) per statement and stays that way.

### Finding slow and expensive queries

The whole procedure runs from `psql` or the SQL editor. None of it needs a dashboard, which is
what makes it usable as evidence under ADR-0005.

1. **Confirm the extension.** `select * from pg_extension where extname = 'pg_stat_statements';`
   It is already there — it ships in `shared_preload_libraries` on every Supabase project.
   (Supabase's own docs contradict each other on this; the
   [debugging guide](https://supabase.com/docs/guides/database/inspect) is the one that is
   right.)
2. **Reset, and write down the timestamp it returns.** `select pg_stat_statements_reset();`
   The view is cumulative since the last reset, which is usually project creation — so without
   this you are reading history, not the present, and a fix you shipped this morning is averaged
   against every slow execution that preceded it. There is no "reset at" column, so record it
   yourself.
3. **Drive a representative workload.** Exercise the app, or wait.
4. **Rank by total time first, then by mean.** Total time — `total_exec_time + total_plan_time`,
   joined to `pg_authid` so you can see which role ran what — finds the query that costs the
   most; a 3 ms query run 400,000 times beats a 900 ms report nobody runs. Mean time finds the
   one that *feels* worst. The exact SQL for both is in the research write-up linked below.
5. **Remember what is missing.** `pg_stat_statements.track` is `top` (measured), so statements
   inside functions and triggers are not tracked at all. That hides the auth hook's role lookup
   and the whole `enforce_consultation_rules` trigger body. It cannot be fixed on hosted
   Supabase either — `alter role supabase_auth_admin set pg_stat_statements.track` returns
   `ERROR: "supabase_auth_admin" is a reserved role`, and database-level is `permission denied`.
   What survives: the hook's *top-level* invocation is tracked and carries the total cost
   including its inner query, so the number is reachable — as long as you do not filter the view
   to application roles, which is the natural thing to do and would hide it. Also: only 5,000
   statements are kept, least-executed evicted first.
6. **Get plans for the statements that actually ran, not paraphrases.** PostgREST will return a
   plan, behind a setting:

   ```sql
   alter role authenticator set pgrst.db_plan_enabled to 'true';
   notify pgrst, 'reload config';
   ```

   ```ts
   await supabase.from("consultations").select("…").explain({ analyze: true, buffers: true });
   ```

   This runs **as the request's role with the RLS quals in the plan**, which is the entire point
   — a plan taken as `postgres` in the SQL editor does not include the policy, and for this
   schema the policy is part of the `WHERE` clause. Turn it off afterwards
   (`alter role authenticator reset pgrst.db_plan_enabled;`); it is off by default because it
   discloses database structure.

   **One trap, specific to this app.** The admin page's query is behind a function, and
   `explain` shows only `Function Scan` — the `Index Cond` is invisible from the outside. Worse,
   the first call in a session pays a few hundred buffers compiling the function body, which
   reads exactly like the cursor failing. Measured here: 403 buffers and 0.466 ms on the cold
   call, no buffers reported and 0.210 ms on the second. **Explain the function's body
   directly, and from the second call.**
7. **Read `Index Cond` versus `Filter`, and `Rows Removed by Filter`.** This one habit is the
   whole of the pagination finding above. An index that *orders* a scan and an index that
   *bounds* it look identical in a timing graph and completely different in a plan.
8. **Run the advisors as SQL, and check the index diagnostics.** Below.
9. **Reset again after each fix** so the next measurement is clean —
   `pg_stat_statements_reset(0, 0, queryid)` when you only changed one query.

**What the dashboard adds, and why none of it is cited here.** Query Performance is a rendering
of `pg_stat_statements`; the Performance and Security Advisors are a rendering of `splinter`.
Both inputs are reachable as SQL, which is why this document uses the SQL. What has no SQL
equivalent — the Reports charts and Logs Explorer — is also what a reviewer cannot open, and on
the Free plan Reports are capped at the last 24 hours and log retention is **1 day**, so a slow
query that fired on Tuesday is gone by Thursday. `pg_stat_statements` has no such window. That
is a second reason to lead with it.

Full write-up, with every claim cited and the reproduction script:
[`docs/research/supabase-query-observability.md`](https://github.com/olibyte/oli-learn/blob/research/supabase-query-observability/docs/research/supabase-query-observability.md)
on the `research/supabase-query-observability` branch.

### The three query shapes, and the index that serves each

This application issues three distinct reads. That is the complete list.

| Shape | Where | Index | Plan |
| --- | --- | --- | --- |
| **Student dashboard** — one student's consultations, newest first | [`app/protected/page.tsx`](../app/protected/page.tsx) | `consultations_student_id_scheduled_at_idx (student_id, scheduled_at desc)` | `Index Cond` on the equality; the second column supplies the ordering, so no `Sort`. The leading column also serves the foreign key and the RLS predicate. |
| **Admin keyset page** — every consultation, newest first, 25 at a time | [`admin_consultations_page`](../supabase/migrations/20260813021500_admin_keyset_rpc.sql), called from [`app/protected/admin/page.tsx`](../app/protected/admin/page.tsx) | `consultations_scheduled_at_id_idx (scheduled_at desc, id desc)` | `Index Cond: (ROW(scheduled_at, id) < ROW(…))` — the row comparison is what bounds it. Flat in page depth. |
| **Auth hook role lookup** — on every token mint and refresh | [`custom_access_token_hook`](../supabase/migrations/20260811214508_create_user_roles_and_auth_hook.sql) | `user_roles_pkey` | Single-row equality on a unique index. O(log n), cannot degrade. Invisible to `pg_stat_statements` (step 5 above). |

**One caveat that is easy to mistake for a defect.** These plans are selectivity-dependent, and
the seeded dataset is four rows. Run the student query against a freshly reset database and you
will get a `Bitmap Heap Scan` and a `Sort`, not an index scan — and the planner is right, because
reading a one-page table beats any index. The index plans above appear once the table is large
enough for them to pay, which is why the pagination numbers were measured at 200,000 rows.
"This query never sorts" would be too strong a claim; "this query is served by an index built
for its shape, once there is enough data for that to matter" is the accurate one.

**No foreign key in this schema is missing a covering index** — `consultations.student_id` is
the leading column of its composite index, and `user_roles.user_id` is a primary key. The
catalogue query that proves it, rather than asserts it, is in §5 of the research write-up, and
it returns nothing.

### Running the advisors yourself

The Performance and Security Advisors are a thin rendering of
[`splinter`](https://github.com/supabase/splinter), which publishes its entire lint set as one
SQL file. So the whole advisor surface is reproducible with no dashboard and no account:

```bash
curl -sSL https://raw.githubusercontent.com/supabase/splinter/main/splinter.sql \
  | psql "postgresql://postgres:postgres@localhost:54322/postgres"
```

**Here is what you will find, so that it is not a surprise.** Against a freshly reset local
database, that command returns exactly two rows, both `INFO`, both `unused_index` — one for each
composite index — and **no `SECURITY` findings at all**.

Both `unused_index` results are artefacts of traffic, not of schema. The lint is literally
`idx_scan = 0` against `pg_stat_user_indexes`, and a database nobody has queried has scanned
nothing. Its own remediation text concedes the point. Two things demonstrate this rather than
plead it:

- **The finding moves.** Load the student dashboard once and
  `consultations_student_id_scheduled_at_idx` goes to `idx_scan = 1` and its `INFO` disappears,
  leaving only the admin one. Which index gets flagged depends entirely on which page was last
  visited.
- **The finding disappears.** Run the two dashboard queries against a table with enough rows for
  the planner to choose their indexes, and `splinter.sql` returns **nothing at all** — measured.

The admin index is the one that will still be flagged on your machine no matter how much you
click, and the reason is worth stating plainly: on a four-row seeded table the planner correctly
chooses a `Seq Scan` over that index, so it never gets scanned. The `explain` at the top of this
section shows exactly that happening. An index that is unused on a dataset this small is not
evidence of an index that is unused.

Do not drop an index on this signal. The query that shows the scan counter *alongside the write
volume paying for the index* — which is the actual argument for removing one — is in §5 of the
research write-up.

**One deliberate trade, if you are reading the function.** `set search_path = ''` on
`admin_consultations_page` keeps advisor lint 0011 quiet, and it prevents Postgres from inlining
the function. That was taken knowingly: lint-clean beats inlined, and it costs nothing here
because the `Index Cond` is inside the body either way.

### CDN and caching

**Lead with the counter-intuitive one: auth-gating does not opt a route out of prerendering.**
Under Cache Components, `/protected` is a Partial Prerender, not a dynamic route. Its header,
footer and table skeleton are bytes on disk, served by the CDN; only the per-user table streams.
From `next build` and the build output on disk — `pnpm build`, then read the sizes back with
`node -e "const m=require('./.next/prerender-manifest.json'); for (const [r,v] of
Object.entries(m.routes)) console.log(r, v.htmlSize)"`:

| Route | | Prerendered shell |
| --- | --- | --- |
| `/` | `◐` Partial Prerender | 12,809 bytes |
| `/protected` | `◐` Partial Prerender | 5,711 bytes |
| `/protected/admin` | `◐` Partial Prerender | 5,508 bytes |
| `/api/consultations` | `ƒ` Dynamic | — |

`/protected/admin` earned its shell recently: it was the one route in the application with
`htmlSize: 0`, caused by an `export const instant = false` sitting under a comment that claimed
it made the route's guard block. It is a dev-time *validation* control and does nothing of the
kind — see [Role routing](../README.md#role-routing).

**There is no `next.config.ts` change worth making.** Every CDN mechanism available is either
already active or structurally inapplicable:

- Static assets are served `cache-control: public,max-age=31536000,immutable`, uncapped and
  unoverridable — verified against production. That is the largest single win and it costs
  nothing.
- `/` is already prerendered with only the auth-dependent part streamed: `AuthButton` sits
  inside a `<Suspense>` boundary in `site-header.tsx`, and that one boundary is the whole
  mechanism. Production answers `x-vercel-cache: PRERENDER`, `x-nextjs-prerender: 1`.
- `/api/consultations` is uncacheable **by construction**, and not because of Next.js: the
  application exposes only `POST` and `PATCH`, and Vercel's CDN caches `GET`/`HEAD`. There is no
  `Cache-Control` to add.

**Redis is not the missing piece, and it dies three separate deaths.** Taken one candidate at a
time rather than dismissed:

- *Session data* — verified locally via WebCrypto against a module-level JWKS cache. A Redis
  lookup would swap an edge-cached HTTPS GET for a different network round trip. Strictly worse.
- *`user_roles`* — read only inside the Postgres hook at token-mint time, and `revoke all`'d
  from the Data API. There is no per-request lookup in existence to cache; caching it would mean
  re-introducing a query in order to have something to cache.
- *Consultation reads* — per-user and mutable, which Next's own docs call the shape with
  "near-zero" cache utilisation.

Two facts close the infrastructure question rather than the reasoning: **Vercel KV no longer
exists** (migrated to Upstash in December 2024, so Redis is a third-party Marketplace database
with third-party billing in the request path), and **the thing Redis is usually reached for is
already provisioned** — Vercel Runtime Cache is a managed, regional, tag-invalidated remote
cache wired to `use cache: remote`, needing only `cacheComponents: true`, which
[`next.config.ts`](../next.config.ts) already sets. If a genuinely shared read ever appears, that
is the door: one directive, no vendor.

**Two questions that were open, now measured.**

*Do segment prefetches traverse the proxy?* **Yes** — every one of them. `next build` emits
pathname-based `*.segments/*.rsc` routes, and the matcher in [`proxy.ts`](../proxy.ts) excludes
`_next/static` and `_next/image` but nothing matching `.segments`. Verified against production:

```
GET /protected.segments/_tree.segment.rsc     → 307, location: /auth/login
GET /auth/login.segments/_tree.segment.rsc    → 200, x-vercel-cache: PRERENDER
GET /_next/static/chunks/…                    → served, never redirected
```

That 307 can only come from `lib/supabase/proxy.ts`, so the proxy ran. The consequence is a
billed middleware invocation ahead of every prefetch, including ones the CDN would otherwise
serve untouched — the login segment above is a cache hit that still paid for a proxy run,
because the proxy runs *before* the cache.

This also surfaced a real defect, filed as
[#57](https://github.com/olibyte/oli-learn/issues/57): the proxy exempts the landing page with
`pathname !== "/"`, but the landing page's *prefetch* path is `/index.segments/…`, which is not
`/`. So an anonymous visitor's prefetch of the home page is answered `307 → /auth/login`. Real
navigation to `/` is unaffected, which is why nothing looked broken. It is not fixed here
because narrowing the matcher touches the route guards, and that deserves the isolation-test
treatment rather than a drive-by.

*Does `Set-Cookie` suppress the stored shell?* **No.** Vercel lists "response doesn't contain
`set-cookie`" among the criteria for *storing* a response, and the proxy attaches rotated auth
cookies whenever it refreshes a session — but a prerendered shell is a build artifact that is
read out of the cache, not a response written into it. Measured on a local production server,
requesting `/protected` with a valid session and then with a backdated expiry that forces a
refresh:

| | Fresh session | Backdated expiry |
| --- | --- | --- |
| `Set-Cookie` | none | `sb-…-auth-token` |
| `x-nextjs-postponed` / `x-nextjs-prerender` | `1` / `1` | `1` / `1` |
| Shell present | yes | yes |
| Response size | 138,499 bytes | 138,499 bytes |

Byte-identical. On Vercel the point is moot from the other direction as well, since `/protected`
is served `private, no-cache, no-store` — there was never a stored response for a cookie to
disqualify.

### Load testing

**k6 is described here rather than built**, and the reason is not budget.

The test that would be written:

- **`POST /api/consultations`** — the only write path, and the only endpoint that touches the
  rules trigger. Ramp to a target arrival rate rather than a target VU count, because the
  interesting failure is queueing, not concurrency.
- **`GET /protected`** — the unbounded read. Seed one student with a large history and watch
  where response size, not query time, becomes the problem.
- **`GET /protected/admin?cursor=…` at increasing depth** — the shape whose whole claim is that
  depth is free. A load test that only ever hits page 1 would confirm nothing.
- **Token mint and refresh** — the hottest statement in the system, and the one
  `pg_stat_statements` will not show you.

Thresholds worth setting: p95 latency per endpoint, error rate under 1%, and a hard check that
no request returns the Data API's 8-second `statement_timeout` error, since that is how a
pathological query presents here.

**What would break first**, predicted so that the prediction can be wrong in public: not the SQL.
The composite indexes hold, and the RLS predicate is a per-statement `InitPlan`. The first
ceiling is PostgREST's connection pool, and the second is Free-tier shared compute. The database
would be the last thing to complain.

**Which is exactly why the test is not run here.** Pointed at a Free-tier project with shared
CPU, no read replicas, a 500 MB quota and a project that pauses after a week of inactivity, k6
would produce a precise measurement of *the instance size Supabase gives away for free*. It
would tell you almost nothing about whether the design is sound, and the numbers would be quoted
as though it had. There is a second, more concrete reason: the write path is the interesting one,
and load-testing it against the deployed application means inserting tens of thousands of
consultations into the live demo a reviewer is about to read.

The honest version of this section is the one above it — the plans, the buffer counts and the
depth sweep, which measure the *design* and are reproducible on any machine that can run
`supabase start`.

---

## Accessibility

### How to read this section

This section reports a pass that was **run**, not reasoned about. The distinction is not
rhetorical: of the nine defects it found, **automated scanning found two**. The other seven
needed the application driven — a form submitted, a connection dropped, a dialog opened, a
journey completed without a mouse — or belong to success criteria no scanner tests at all.
Neither kind exists on a page that is merely loaded.

The engine is **axe-core 4.12.1**, run in headless Chrome 151 against `pnpm build && pnpm start`
on `localhost` — a production build, not `next dev`, because
[#47](https://github.com/olibyte/oli-learn/issues/47) established that `next dev` withholds
client JavaScript from `127.0.0.1`, so forms silently fall back to native submits and every
hydration-dependent finding becomes a false negative.

Fourteen surfaces were covered, each in **both themes at both widths** — 56 runs. Both widths
matter here more than usual: below `md` the student dashboard renders the same rows as a card
list rather than a table ([`student-dashboard.tsx`](../components/consultations/student-dashboard.tsx)),
which is a different DOM with different controls, not a reflow of the same one.

| Surface | Covered as |
| --- | --- |
| `/` | anonymous, and signed in — two surfaces, because the header differs |
| `/auth/login`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/update-password`, `/auth/sign-up-success`, `/auth/error` | anonymous |
| `/protected` | signed in as a student |
| `/protected/admin` | signed in as an admin |
| `/protected/admin` | signed in as a **student** — the deliberate 404 |
| Book, Reschedule and Cancel dialogs | open, which is the only state axe can see them in |

**The result: 0 violations on every surface, in both themes, at both widths.** That sentence is
worth very little on its own, so the rest of this section is about what it cost to make it
true, what it still does not cover, and how you can tell the scanner was doing anything at all.

### Proving the scanner was not asleep

A tool that reports zero because it never ran reports the same zero as a clean page. Before
trusting any of the numbers above, the harness was checked against a known-bad control:
a `#eeeeee`-on-white paragraph and an `<img>` with no `alt`, injected into `/protected` and
removed afterwards. axe returned three violations — `color-contrast`, `image-alt` and
`region` — naming the injected nodes by selector. So a zero from this harness is a
measurement, not a silence.

That check is the reason the rest of these numbers are quoted without hedging.

### What the scanner found, and what it cost to clear

Two defects, both structural, both on surfaces a real user reaches.

**The six auth screens had no `<main>` and no `<h1>`.** `/auth/login` returned three violations
in all four combinations — `landmark-one-main`, `page-has-heading-one`, and `region` on five
separate nodes — plus `bypass` as *incomplete*, whose own explanation was
*"No valid skip link found / Page does not have a heading / Page does not have a landmark
region"*. Every element on the page belonged to no landmark, so a screen-reader user
navigating by landmark had nothing to jump to, and one navigating by heading had nothing to
list. The cause was structural rather than careless: `/` and `/protected` each own a `<main>`
in their own layout, and the `app/auth` route group owned none; the card title that reads as
the page heading is a `<div>`, because that is what shadcn's `CardTitle` is.

Fixed in [`app/auth/layout.tsx`](../app/auth/layout.tsx) (a `<main>`, and a `<header>` around
the wordmark so the one remaining `region` node had a banner to belong to) and in
[`components/ui/card.tsx`](../components/ui/card.tsx), where `CardTitle` gained `asChild` —
the same Radix `Slot` pattern `Button` and `DialogTrigger` already use here. Promoting the
element rather than hard-coding an `<h3>` matters: on `/protected` a card title genuinely is
not the page heading, and an unconditional heading level would invent a rung below an `<h1>`
that is not there.

**Next's built-in 404 had no `<main>` and no `<h1>` either** — `landmark-one-main` plus
`region` on both its nodes. This is not a hypothetical page: it is what a signed-in *student*
gets at `/protected/admin`, because [`proxy.ts`](../lib/supabase/proxy.ts) hides the admin
route's existence with a 404 rather than announcing it with a 403. Next's own documentation
for this file convention adds a second reason to replace it — the default UI follows the
operating system's colour scheme and ignores an app-level theme, so a student in dark mode
got a white page. Fixed by adding [`app/not-found.tsx`](../app/not-found.tsx), deliberately
without the site header, because that reads cookies and there is nothing on a 404 worth
making it dynamic for.

### The three results axe declined to decide

axe reports *incomplete* when it can see a risk but cannot compute the answer. All three were
resolved by measuring, and all three came out clean — which is the useful part, because an
undecided result left undecided is indistinguishable from a defect.

**1. The hero heading, at 390px.** `color-contrast` incomplete: *"Element's background color
could not be determined because it partially overlaps other elements."* The overlap is real —
the landing page's one decorative ring (`border-[40px] border-primary/10`, `aria-hidden`) has
a bounding box that crosses the `<h1>` at mobile widths. Measured in the browser by
compositing `primary` at 10% over `wash` and computing the ratio against both inks the heading
uses:

| | over `wash` | over the ring band |
| --- | --- | --- |
| `foreground` (light) | 15.21:1 | **13.21:1** |
| `primary` (light) | 5.34:1 | **4.63:1** |
| `foreground` (dark) | 17.03:1 | **14.91:1** |
| `primary` (dark) | 6.47:1 | **5.67:1** |

Worst case 4.63:1, against a 4.5 threshold the heading does not even have to meet — at 36px
bold it is large text, where AA asks 3:1. The ring costs about 0.7 of a ratio point and
changes no verdict.

**2. `aria-hidden-focus`, on all three dialogs.** Three nodes each, every combination:
Radix's two focus guards and the `aria-hidden` page behind the modal, with the instruction
*"Check that focusable elements are not tabbable in the current state."* That is a question
about behaviour, and it was answered by pressing keys — `Tab` and `Shift+Tab` through all
three dialogs, recording `document.activeElement` after every single press, including a
sixteen-press backwards sweep of the booking dialog because backwards is the direction a
trap most often leaks. **Focus never left the dialog, in either direction, and wrapped
correctly at both ends.** `Escape` closed all three, and focus returned to the exact
trigger element in all three. The incomplete is a
limitation of static analysis, not a finding.

The same sweep recorded something worth knowing for anyone re-running it: a
`<input type="datetime-local">` consumes **seven** consecutive tab stops of its own — one per
segment — so a tab count through the booking dialog that looks wrong is usually right.

**3. The dialog descriptions.** `color-contrast` incomplete, same overlap reasoning, on the
`<p>` inside each dialog. The dialog's own background is opaque, so the ratio is determinate:
**6.08:1 light, 8.66:1 dark**, at 14px against a 4.5 threshold.

### What running the application found that loading it did not

This is the half of the pass that no scanner reaches.

#### A dropped connection killed the control and said nothing

The worst defect found, and the one furthest from anything axe tests.

[`lib/api/client.ts`](../lib/api/client.ts) did not catch `fetch` rejecting. `fetch` only
rejects when the request never completed at all — offline, DNS failure, connection dropped —
and every consultation mutation goes through this one function. The rejection escaped it and
took the caller's `await` with it, so the line that re-enables the control never ran, and
neither did the line that sets the error message.

Measured, with the request aborted at the network layer and the checkbox activated from the
keyboard:

- the complete toggle stayed `aria-checked="false"` — no state change,
- it became `disabled` and **stayed disabled until the page was reloaded**,
- the reschedule dialog stayed on `"Saving…"`, disabled, with the dialog still open,
- **no `role="alert"` appeared anywhere**, and no live region had anything to announce,
- the only trace was `TypeError: Failed to fetch` in a console no user reads.

A control that is dead and silent is worse for a screen-reader user than one that fails
loudly: there is nothing to perceive, nothing to announce, and no way to tell a failure from
a slow network. That is WCAG **3.3.1 Error Identification**, failed on all three mutations.

Fixed by turning the rejection into a `Problem` on the same path every other failure already
takes — so it lands in the `role="alert"` the dashboard and the dialogs already render.
Re-measured on the running application afterwards: the toggle comes back enabled, and the
alert reads *"Check your connection and try again — nothing was changed."* The truncated-body
case gets a deliberately different sentence, because a 2xx whose body died mid-stream may well
have saved the change and must not claim otherwise.

Guarded by [`lib/api/client.test.ts`](../lib/api/client.test.ts), seven tests. Removing the
`try`/`catch` turns three of them red.

#### Two controls, one name, and the wrong consultation cancelled

[#34](https://github.com/olibyte/oli-learn/issues/34) found the last defect of this shape —
every complete-checkbox in a student's list sharing one accessible name — and fixed it by
naming each checkbox after its consultation's time. The same shape survived one component
over.

`RescheduleDialog` and `CancelDialog` render triggers whose entire accessible name was the
visible word: `"Reschedule"`, `"Cancel"`. The "Next up" card repeats both triggers for a
consultation the list below is already showing, so **among the eleven visible controls on a
seeded student dashboard, two were called exactly `"Reschedule"` and two exactly `"Cancel"`** —
at both widths, in both layouts.

The duplication is visible by reading the component. What reading it does not tell you is
what it costs, and the keyboard-only journey below supplied that by **doing the wrong
thing**: tabbing to the first control named "Reschedule" reaches the "Next up" card, not the
row being read, so the run rescheduled and then cancelled a different consultation from the
one intended — and nothing on screen or in the accessibility tree said so. A duplicate name
is a lint finding until it makes you destroy the wrong record.

Fixed in [`row-actions.tsx`](../components/consultations/row-actions.tsx): each trigger's
accessible name now carries its consultation's time, exactly as `CompleteToggle` does. The
visible label is unchanged.

That left a second, milder duplication — the "Next up" pair and the row pair now share a name
*correctly*, since they act on the same consultation — with nothing to tell a listener which
of the two they had landed on. Rather than lengthen the names further, the card became a
named region: `<section aria-labelledby>` with its existing "Next up" label promoted from a
`<p>` to the `<h2>` it already reads as. Tailwind's preflight resets heading size and weight,
so it renders byte-identically.

#### An error colour that only exists after you get something wrong

The three auth forms rendered their error with the starter template's `text-red-500` and no
`role="alert"`. Two problems in one line, and axe could see neither, because the element does
not exist until a submission fails.

Driven — a real sign-in with a wrong password, then the same DOM with that one class reverted —
axe reports **3.76:1** for `text-red-500` at 14px on the white card, naming `#ef4444` on
`#ffffff`. AA asks 4.5. The dark card computes to 4.39:1, also short — the same colour, on
the other theme's surface. The token the rest of the
application uses scores 6.95:1 light and 5.57:1 dark, and is covered by
[`lib/design/contrast.test.ts`](../lib/design/contrast.test.ts) — which is the deeper point:
an untokenised colour is invisible to the check that exists to catch exactly this.

All three now use `text-destructive` and carry `role="alert"`, matching the booking and
reschedule dialogs. Verified on the running application: a failed sign-in renders
`role="alert"` with the message.

#### No field in the application declared its purpose

Not one input had an `autocomplete` attribute — not the email and password fields, not the
booking form's names. That is WCAG **1.3.5 Identify Input Purpose (AA)**, and axe does not
test it. It is also what lets a password manager fill the sign-in form, which is an
accessibility affordance long before it is a convenience.

Added: `username` / `current-password` / `new-password` on the auth forms, `given-name` /
`family-name` on the booking dialog, and `spellCheck={false}` on the email fields.

#### One function, four names

The pass inherited an open question from [#47](https://github.com/olibyte/oli-learn/issues/47),
deliberately left by [#60](https://github.com/olibyte/oli-learn/issues/60) so that this ticket
would audit it once rather than half-sweep it: the landing page said "Create account" and
"Sign in" while the pages themselves said "Sign up" and "Login".

Framed as accessibility rather than taste, it has a definite answer. WCAG **3.2.4 Consistent
Identification (AA)** requires components with the same function to be named the same way, and
these two routes carried **four** names between them — `/auth/login` was "Sign in" in the
header and hero but "Login" as a card title, a submit button and two return links;
`/auth/sign-up` was "Create account" in the hero but "Sign up" everywhere else.

Standardised on **"Sign in"** and **"Create account"** — which is not a new preference but the
pair [`docs/design/oli-learn.md` §4](design/oli-learn.md) already specifies for the landing
page CTAs, so this closes a drift rather than opening a debate. **Eight label sites changed,
four per route**: for `/auth/login` a card title, a submit button and two return links; for
`/auth/sign-up` a card title, a submit button, one return link and the header's second
button.

A related find: `/auth/forgot-password` and `/auth/update-password` were **both** titled
"Reset Your Password", two different routes doing different things under one heading, which
leaves a screen-reader user no way to tell which they landed on (WCAG 2.4.6). The one that
actually changes the password is now "Choose a new password".

#### The 15-minute rule, and where the browser leaves you

[#35](https://github.com/olibyte/oli-learn/issues/35) enforced 15-minute booking boundaries at
three layers, the outermost being `step` on the input — which means an off-grid time is refused
by the browser's **native** constraint validation, whose bubble is announced inconsistently and
vanishes on blur. The open question was whether the `aria-describedby` hint is enough, or
whether the step mismatch needs surfacing into the `role="alert"` the way API errors are.

Measured, submitting `:07` with a valid date a year out:

- nothing reached the API — the request never fired,
- `validity.stepMismatch` was `true`, and `validationMessage` read *"Please enter a valid
  value. The two nearest valid values are …9:00 am and …9:15 am"*,
- **`aria-invalid` was never set**, on either the booking or the reschedule input,
- the only live region on the form was the institution-time echo, `aria-live="polite"`, which
  cheerfully announced the invalid time back,
- **the browser moved focus to the offending field.**

That last point is what decides the question. Because focus lands on the input, an
`aria-describedby` hint is re-read at exactly the moment the rule is violated — so the hint is
doing real work, and duplicating the message into `role="alert"` would mostly add noise. The
same measurement applies to `min`, the past-time rule that predates #35.

But the booking dialog had that hint and **the reschedule dialog did not** — it stated the rule
only in `DialogDescription`, which Radix wires to the *dialog*, so it is announced once on open
and never again. The reschedule input now carries the same hint as the booking input.

One observation against saying it a third time: the browser's own bubble renders *over* the
hint element, so at the moment of failure the native message physically covers the wording it
duplicates. Reproduce it by opening the booking dialog, entering a `:07` time and submitting.

`aria-invalid` is still not set. See the costed item below.

### Focus, and the accident that was keeping it visible

Every interactive control in this application draws its focus indicator with a Tailwind `ring`,
which compiles to a `box-shadow`. Verified by focusing one of each kind and diffing computed
styles: buttons, checkboxes, the theme trigger and the outline buttons all take `:focus-visible`
and all change `box-shadow`; only plain links use a native outline.

**Forced-colors mode does not paint box-shadows.** So in Windows High Contrast the designed
indicator is simply absent, and what remains is whatever the `outline` is. `outline-none`
appears **eleven times across eight files** in `components/ui/`, and in the shipped
stylesheet that class emits:

```css
.outline-none{outline-offset:2px;outline:2px solid #0000}
```

A *transparent* outline — which forced-colors repaints in a system colour. That is why focus
was still visible there. Nobody chose it: it is a Tailwind v3 default, and Tailwind v4 emits
`outline-style: none` for the identical class, measured twice independently
([#61](https://github.com/olibyte/oli-learn/issues/61), and again on the scratch worktree that
[closed PR #73](https://github.com/olibyte/oli-learn/pull/73)). The answer to "does forced-colors
focus survive on purpose or by luck" was **luck**, and the luck had a known expiry date.

It is now on purpose. [`app/globals.css`](../app/globals.css) states the guarantee itself:

```css
@media (forced-colors: active) {
  :focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
}
```

and [`lib/design/forced-colors.test.ts`](../lib/design/forced-colors.test.ts) fails if it is
deleted, weakened to `none`, given zero width, or given a literal colour instead of a system
one — six tests, verified by mutation. It also asserts the *premise*: that components still
apply `outline-none` and still draw focus with a ring, so that the day the block genuinely
becomes redundant, someone concludes that deliberately rather than discovering it.

**Honest limit:** the rule is verified in the emitted stylesheet, not in a forced-colors
render. The browser harness used here cannot emulate `forced-colors: active` — checked, and
`matchMedia('(forced-colors: active)')` stays `false` — and macOS has no equivalent setting.
Confirming it visually needs Windows High Contrast or a Chrome DevTools rendering override.

### Colour

The palette was rebuilt for AA by [#16](https://github.com/olibyte/oli-learn/issues/16), and
that claim is checked rather than asserted: `lib/design/contrast.test.ts` parses
`app/globals.css` itself and computes 24 pairs in both themes — 50 test cases with its two
hygiene checks — so editing the stylesheet cannot quietly break it. This pass verified the
claim independently: axe's own `color-contrast` rule returned zero violations across all 56
runs. Re-measured directly from the tokens, including the two pairs the ticket named:

| | light | dark | floor |
| --- | --- | --- | --- |
| Wordmark `Learn` (amber) on the app ground | 3.66:1 | 11.03:1 | 3 (large text only) |
| Wordmark `Learn` on the wash | 3.47:1 | 11.52:1 | 3 |
| Wordmark `Learn` on a card | 3.66:1 | 10.21:1 | 3 |
| Wordmark `Oli-` (primary) on the wash | 5.34:1 | 6.47:1 | 4.5 |
| Focus ring on the background | 5.63:1 | 6.20:1 | 3 |

The amber's 3.47:1 light figure is the tightest number in the palette, and it is legal only
because the wordmark is large text — a constraint the `Wordmark` component enforces and
[`lib/design/wordmark.test.ts`](../lib/design/wordmark.test.ts) tests — the wordmark goes
two-tone only at sizes clearing 18.66px bold, and `text-lg` at 18px is deliberately excluded
for being *nearly* large enough. This is also why amber is held out of the hero headline: at
that size the AA-legal step reads rust rather than gold.

### Keyboard only, end to end

Land on `/` at 390px, sign in, book a consultation, reschedule it, cancel it — no mouse, no
programmatic clicks, every step a real key event.

It completes. Recorded at each stage:

- `/` → the "Sign in" link is the third tab stop; `Enter` navigates.
- Sign-in: 3 tabs to Email, 2 to Password, 1 to the submit button. `Enter` submits and lands
  on `/protected`.
- 5 tabs to "Book consultation". `Enter` opens the dialog with focus **on the first field**,
  not on the dialog container — so a screen reader starts on something useful.
- The date and time are enterable segment by segment with arrow keys; `Enter` on the submit
  button books, the dialog closes, and **focus returns to the trigger**.
- Reschedule and cancel behave the same, and the cancel confirmation opens with focus on
  "Cancel consultation" inside a clean two-element trap.

Two things this journey found that the scanner could not. The first is the duplicate-name
defect above, found by the run doing the wrong thing. The second is that **nothing is announced
on success**: after a booking, the dialog closes, the list gains a row, focus returns to the
trigger — and there are **zero live regions on the page**. Sighted users see a new row appear;
a screen-reader user gets silence and has to go looking.

### What is still open, and what it would cost

Nothing below is a scanner violation — axe is clean on all fourteen surfaces — and all of it
is left deliberately. Items 1, 2 and 5 are the ones a real user would meet; 3, 4 and 6 are
completeness rather than harm. They are ordered by what they would buy, not by cost.

1. **Success is not announced.** Costed at a small build ticket, not an hour: a polite status
   region on the dashboard is easy, but the message has to be correct for three different
   mutations, must not double up with the `role="alert"` already there, and must survive
   `router.refresh()` re-rendering the tree underneath it. Doing it badly — a region that
   re-announces on every refresh — is worse than the current silence. **Recommend taking
   this**; it is the largest remaining gap and the only one a screen-reader user meets on the
   happy path.

2. **`aria-invalid` is never set** on a constraint violation. The browser moves focus to the
   field and the `aria-describedby` hint is re-read, so this is a correctness gap rather than a
   dead end. It needs an `onInvalid` handler and a piece of state per input in two dialogs.
   Half an hour, low risk, no measured user-facing symptom — which is why it is listed rather
   than done.

3. **No skip link anywhere.** Now that landmarks and headings exist on every page, axe's
   `bypass` rule is satisfied on all fourteen surfaces, so this is below the automated bar.
   It is still the conventional affordance, and the application's repeated header is short —
   three controls — so the value is genuinely marginal here. One component, plus a
   `focus:not-sr-only` pattern that has to be got right in both themes.

4. **Forced-colors is verified in CSS, not in a render.** See the honest limit above. The
   cheapest real check is a Windows VM or a colleague with one; a Chrome DevTools rendering
   override would confirm it in minutes but is a manual step, not evidence a reviewer can
   re-run from this repository.

5. **No screen reader was used.** Everything here is the accessibility *tree*, focus behaviour
   and computed colour — measured precisely, but a proxy. VoiceOver, NVDA and JAWS disagree with
   each other about live-region politeness and about native validation bubbles, which is exactly
   where items 1 and 2 live. A pass with a real screen reader is the honest next step and is not
   substitutable by more tooling.

6. **`<th>` elements carry no explicit `scope`.** Both tables are simple enough that browsers
   infer column scope from `<thead>`, and axe's table rules pass, and the sr-only "Complete"
   header does reach the accessibility tree as a `columnheader` — verified. Adding
   `scope="col"` is one attribute in `components/ui/table.tsx` and would make the association
   stated rather than inferred; left alone because changing a shared primitive to fix nothing
   measurable is how primitives drift.

### What this cost

Both columns were measured the same way, by stashing the changes, building, and building again
with them restored — so these are two builds of the same tree, not a remembered number against
a fresh one.

| | before | after |
| --- | --- | --- |
| axe violations, 14 surfaces × 2 themes × 2 widths | 5, on 2 surfaces | **0** |
| Unit tests (`pnpm test:unit`) | 176 | **189** |
| Whole suite (`pnpm test`) | 226 | **239** |
| Stylesheet | 33,311 bytes | 33,427 bytes |
| Prerendered shell, `/` | 12,809 | **12,809** |
| Prerendered shell, `/protected` | 5,711 | **5,711** |
| Prerendered shell, `/protected/admin` | 5,508 | **5,508** |
| Prerendered shell, `/auth/login` | 17,369 | 17,962 |
| Prerendered shell, `/_not-found` | 12,999 | 14,525 |

The three shells the [scalability section](#cdn-and-caching) is built on are **unchanged**.
Worth stating rather than assuming: that table is the one place in this repository where a
number owned by one piece of work is written down by another, and it has already gone stale
once ([#61](https://github.com/olibyte/oli-learn/issues/61)). Reproduce it with the command
that section gives.

The auth screens did grow, by roughly half a kilobyte each — the `<main>`, the `<header>`, the
heading element and the `autocomplete` attributes. Two of the baseline figures are independent
cross-checks rather than new measurements: `/auth/forgot-password` came out at exactly the
18,408 bytes [#60](https://github.com/olibyte/oli-learn/issues/60) recorded, and
`/auth/update-password` at exactly the 16,750 [#41](https://github.com/olibyte/oli-learn/issues/41)
recorded. Numbers this document has carried for days reproduced to the byte.

---

## Deferred work

*Not yet written — owned by [#44](https://github.com/olibyte/oli-learn/issues/44), which also
links this document from the README and reconciles it with
[Known limitations](../README.md#known-limitations).*
