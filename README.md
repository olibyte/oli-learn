# Oli-Learn — consultation booking

Students book and manage one-to-one consultations; administrators see every consultation in the system.

**Live: https://oli-learn.vercel.app**

Next.js 16.3 (App Router, Cache Components) · Supabase (Postgres, Auth, RLS) · TypeScript · zod · Tailwind + shadcn/ui · Vitest.

---

## Contents

- [Reaching both roles](#reaching-both-roles) — **start here**
- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Special setup instructions](#special-setup-instructions) — **the parts that will bite**
- [Implementation summary](#implementation-summary)
- [Database: migrations and schema](#database-migrations-and-schema)
- [Security model](#security-model)
- [Justifications](#justifications)
- [Assumptions](#assumptions)
- [Testing](#testing)
- [Known limitations](#known-limitations)
- [Design](#design)

---

## Reaching both roles

**Locally — needs nothing from anyone.** [Quick start](#quick-start) ends in `pnpm supabase db reset`, which seeds both roles, and two students rather than one:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | in [`supabase/seed.sql`](supabase/seed.sql) |
| Student | `student@example.com` | in [`supabase/seed.sql`](supabase/seed.sql) |
| Student | `student-b@example.com` | in [`supabase/seed.sql`](supabase/seed.sql) |

The second student is there so isolation can be *seen*, not just asserted: sign in as one and the other's consultation is absent from the dashboard and unreachable by id; sign in as the admin and both students' names are in the list.

That password is in the seed on purpose. It unlocks a Postgres container on your own machine holding fixtures — configuration, not a secret — and having it there is what lets the integration tests and `scripts/verify-api.mjs` run with nothing to set up.

**On the live deployment — by request.** Those two accounts carry a long random password that is not in this repository and never was; ask via [LinkedIn](https://www.linkedin.com/in/olivercbennett) and it comes back out of band. This repo and the domain are public, so a working password published here would hand write access to the demo data to anyone who scrolled this far.

---

## What it does

**Students** sign up, sign in, and get a dashboard of their consultations. They can book one (first name, last name, reason, date and time), mark it complete or incomplete, reschedule it, and cancel it.

**Admins** get a read-only view at `/protected/admin` listing every consultation across all students, including cancelled ones. A student who types that URL gets a 404.

---

## Quick start

```bash
pnpm install
cp .env.example .env      # points at the local stack as shipped — nothing to fill in
pnpm supabase start       # local Postgres + Auth (Docker required)
pnpm supabase db reset    # applies migrations, then supabase/seed.sql
pnpm dev
```

That is the whole setup. `.env.example` carries the Supabase CLI's fixed local URL and publishable key, which are the same on every machine and reachable only on localhost, so nothing has to be requested or filled in to get a running app with both roles.

To point it at a hosted project instead, swap those two values for that project's own:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Those two are the only variables the application reads, and the only two set on Vercel. The remaining pair in `.env.example` — `SUPABASE_PROJECT_PASSWORD` and `SUPABASE_ACCESS_TOKEN` — are needed only to `supabase link` a project of your own. They are personal CLI credentials: **never commit them, and never add them to a hosting provider.**

### Deploying your own

1. Import the repo on Vercel. The framework preset, build command and output directory are all detected.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Deploy, then follow **[Special setup instructions](#special-setup-instructions)** — particularly the auth-URL step, or password resets will send your users to `localhost`.

---

## Special setup instructions

These are the non-obvious steps. Each one cost real debugging time.

### 1. The auth hook is configuration, not a migration

Roles reach the JWT through a Supabase **custom access token hook**. The Postgres function ships in a migration, but *enabling* it is configuration. It is committed as code in `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Apply it to a linked project with `pnpm supabase config push`.

**Order matters** — apply migrations first. Enabling a hook that points at a function which doesn't exist yet breaks token issuance for everyone.

**Locally, `supabase db reset` is not enough.** It restarts containers but does not re-read auth config. After changing anything under `[auth]`, run `supabase stop && supabase start`, or the hook silently does nothing and every user gets a null role — a failure with no error anywhere.

### 2. `supabase config push` pushes the *entire* auth config

Not just the section you edited. On this project it silently rewrote `site_url` to `http://127.0.0.1:3000` and loosened the password-reset email interval from 1 minute to 1 second, because those are the CLI's local defaults.

**Treat `config.toml` as the authority for every auth setting.** After deploying, `site_url` and `additional_redirect_urls` must name the deployed origin:

```toml
site_url = "https://your-app.vercel.app"
additional_redirect_urls = [
  "https://your-app.vercel.app/**",
  "https://*-yourteam.vercel.app/**",   # Vercel preview deployments
  "http://localhost:3000/**",
]
```

Leave this on localhost and the app *appears* to work — sign-in is fine — but password-reset and confirmation emails link users to their own machine.

### 3. `supabase login` needs a token in non-interactive shells

The browser flow fails with `LegacyLoginMissingTokenError`. Create a personal access token at <https://supabase.com/dashboard/account/tokens> and either export `SUPABASE_ACCESS_TOKEN` or run `supabase login --token <token>`.

### 4. `supabase db push` prompts, and can appear to hang

Use `--yes` in scripts. Even then the CLI often logs a benign TLS `UnexpectedEof` and doesn't exit promptly **after the push has already succeeded** — check `supabase migration list` before assuming failure and re-running.

### 5. Integration tests need the local stack

```bash
pnpm supabase start && pnpm supabase db reset && pnpm test:integration
```

They deliberately never touch a hosted project.

---

## Implementation summary

### Request flow

```
Browser
  │
  ├─ page load ──────────► proxy.ts ──► Server Component ──► Supabase (RLS)
  │                        (session refresh,                  reads
  │                         route guards)
  │
  └─ mutation ───────────► proxy.ts ──► /api/consultations ──► Supabase (RLS
                                        (zod, authz recheck)    + rules trigger)
```

**Reads** come from Server Components using a request-scoped Supabase client. **Writes** go through REST route handlers. There are no Server Actions anywhere in the codebase.

After a mutation the client calls `useRouter().refresh()`, which re-runs the Server Component read without losing client state — so no read endpoints are needed.

### Layout

| Path | |
| --- | --- |
| `app/protected/page.tsx` | student dashboard (RSC read inside Suspense) |
| `app/protected/admin/page.tsx` | admin view, keyset pagination over RPC, no client JS |
| `app/api/consultations/` | `POST` and `PATCH` handlers |
| `components/consultations/` | student dashboard, booking dialog, row actions, complete toggle, status pill |
| `lib/api/` | zod schemas, RFC 9457 problems, DTO mapping, fetch client |
| `lib/auth/` | the password rule and the role-routing rule, both unit-tested |
| `lib/time.ts` | the institutional clock — one zone, one locale, pinned |
| `lib/design/` | the palette's contrast check and the wordmark size rule |
| `lib/supabase/` | browser, server and proxy clients |
| `supabase/migrations/` | five migrations |
| `tests/integration/` | security boundary tests |
| `docs/adr/` | architecture decision records |
| `docs/api-contract.md` | the full API contract |
| `CONTEXT.md` | domain glossary |

### API

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/consultations` | book |
| `PATCH` | `/api/consultations/[id]` | complete, un-complete, cancel, reschedule |

`PATCH` bodies describe the desired **state**, not an action — `{"status":"completed"}` or `{"scheduledAt":"…"}` — modelled as a union of two strict objects so sending both is rejected rather than half-applied.

Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json`:

```jsonc
{
  "type": "/errors/invalid-transition",
  "title": "Invalid transition",
  "status": 422,
  "detail": "This consultation has been cancelled and can no longer be changed.",
  "instance": "/api/consultations/9f2b…"
}
```

Postgres errors are **mapped**, never passed through, so rewording a database trigger cannot silently change the public API.

---

## Database: migrations and schema

Five migrations in `supabase/migrations/`, applied with `supabase db reset` (local) or `supabase db push --linked --yes` (hosted). This is an imperative-migrations project — files are hand-authored via `supabase migration new`.

| Migration | |
| --- | --- |
| `…_create_consultations.sql` | table, enum, indexes, `updated_at` trigger, RLS enabled, grants |
| `…_create_user_roles_and_auth_hook.sql` | role table, access token hook, default-role trigger, backfill |
| `…_consultation_policies_and_rules.sql` | RLS policies and the state-machine trigger |
| `…_admin_pagination_index.sql` | composite index for keyset pagination |
| `…_admin_keyset_rpc.sql` | the row-comparison page function; advisor grant fixes |

### `public.consultations`

| Column | Type | |
| --- | --- | --- |
| `id` | `uuid` pk | `gen_random_uuid()` |
| `student_id` | `uuid` not null | → `auth.users(id)` on delete cascade |
| `first_name` | `text` not null | 1–100 chars after trim |
| `last_name` | `text` not null | 1–100 chars after trim |
| `reason` | `text` not null | 1–1000 chars after trim |
| `scheduled_at` | `timestamptz` not null | |
| `status` | `consultation_status` not null | `scheduled` \| `completed` \| `cancelled` |
| `created_at` | `timestamptz` not null | `now()` |
| `updated_at` | `timestamptz` not null | maintained by `moddatetime` |

Indexes: `(student_id, scheduled_at desc)` for the student list — whose leading column also serves the foreign key and the RLS predicate — and `(scheduled_at desc, id desc)` for the admin list and its cursor.

### `public.user_roles`

| Column | Type | |
| --- | --- | --- |
| `user_id` | `uuid` pk | → `auth.users(id)` on delete cascade |
| `role` | `app_role` not null | `student` \| `admin`, default `student` |

The system of record for roles. Read by the auth hook; unreachable through the Data API.

### State machine

```
scheduled ──► completed      mark complete
completed ──► scheduled      mark incomplete
scheduled ──► cancelled      cancel
cancelled ──► ✗              terminal
completed ──► cancelled      ✗ (it already happened)
```

`scheduled_at` may move only while a consultation is still `scheduled`, and only to a future time. After booking, only `status` and `scheduled_at` can change at all.

Enforced by a `before insert or update` trigger — see [Justifications](#justifications) for why it lives in the database.

---

## Security model

Four independent layers. The application layer is the *outermost*, not the only one.

**1. Grants.** `anon` holds no privileges on either table. `authenticated` has `select, insert, update` on consultations and **nothing** on `user_roles`. Nobody has `delete` on anything — so no bug can destroy cancelled history — and `truncate` is revoked because it bypasses RLS.

**2. RLS.** Enabled on both tables. A student reads and writes only rows where `student_id = auth.uid()`; an admin's policy widens `select` only. There is no admin write policy, so "read-only" is enforced rather than merely unrendered — precisely: the admin role *adds* a read across students and takes nothing away, so an admin can still book their own consultation like any signed-in user, and can write nobody else's. Both halves are tested.

**3. The rules trigger.** State-machine and temporal legality. This is in the database rather than the API because `lib/supabase/client.ts` is a **browser** client: a signed-in student's JWT reaches PostgREST directly, so anything enforced only in a route handler is bypassable from a devtools console.

**4. The application.** zod validation at every boundary, the role claim re-checked in handlers, and route guards.

### Role storage

The role lives in `user_roles` and is stamped into the JWT as a `user_role` claim by a custom access token hook. It is deliberately **not** in `user_metadata`, which users can edit themselves.

The role table is locked down twice: `revoke all` from `anon`, `authenticated` and `public`, plus RLS with a single `select` policy for the auth server. Supabase's own RBAC guide creates that policy but never enables RLS, leaving it inert — safe only because of the revoke, and one careless `grant` away from being wide open with a policy giving false assurance.

The hook is **not** `security definer`, so it stays subject to RLS. The signup trigger **must** be, because it writes to a default-deny table. Getting those backwards fails silently in opposite directions.

### Role routing

**Where a role sends you is decided in exactly one place**, [`lib/auth/role-routing.ts`](lib/auth/role-routing.ts), and applied in exactly one place, `proxy.ts`. It is a pure function of `(pathname, role)` returning `allow`, `not-found` or `redirect`, so it is unit-tested without a request; the proxy only turns that answer into a response.

Both directions are the same decision. A student at `/protected/admin` is rewritten to the not-found page with a **404, never a 403** — the route's existence is not confirmed to someone who may not use it, matching the API's stance on rows you cannot see. An admin at `/protected` is **redirected** to `/protected/admin`, because an Admin observes and does not book, so the booking dashboard correctly renders them an empty state offering to book their first consultation. Guarding the route rather than branching after login also covers a typed URL and a stale bookmark.

**It has to be the proxy, and not the page.** Under Cache Components a page's shell is prerendered and sent with a 200 before anything inside its Suspense boundary runs, so a `notFound()` or `redirect()` from a page body arrives after the status is committed — a student got the correct not-found page under the wrong code. The proxy is the last point at which the response has not started.

`export const instant = false` does not change that and never did: it is a **dev-time validation control**, not a rendering one ([`instant` reference](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)). It was on the admin page under a comment claiming it made the guard block; what it actually did was silence the warning that `/protected/admin` had **no static shell at all** — the only route in the app with `htmlSize: 0`. Removing it and moving the page's own claim check inside the Suspense boundary turns the route from `ƒ (Dynamic)` into `◐ (Partial Prerender)` with a 5.5 KB CDN-served shell, and costs nothing: the proxy already decided the status.

This is routing, not authorization. The admin page keeps its claim check as defence in depth, the paging function is `security invoker`, and **RLS remains the boundary** — Next's docs are explicit that the proxy is not one.

### Signup, and the password rule

Signup stays **open** — the brief asks for it — on a public domain, so the rule below is the floor on every account a stranger can create.

**Twelve characters, and no composition requirement.** `minimum_password_length = 12`, raised from the template's 6; `password_requirements` is left empty **on purpose**, which is a decision rather than an untouched default. [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) withdrew composition rules: demanding an uppercase, a digit and a symbol reliably yields `Password1!` and its cousins, concentrating real-world passwords on the patterns an attacker tries first. The standard's replacement is a longer minimum plus a breach blocklist. Supabase exposes the composition knob that guidance argues against and no blocklist knob, so the honest configuration here is length and no theatre. The ceiling is 72 bytes, because bcrypt truncates there and GoTrue checks that limit first. [`lib/auth/password.ts`](lib/auth/password.ts) mirrors the rule client-side so a user is told before the round trip — advisory only; GoTrue is the authority.

**Email confirmation is off, and cannot currently be turned on.** Not an oversight. Supabase's default SMTP only delivers to members of the project's own organisation, and the signup transaction *rolls back* when that check fails — so switching confirmations on would give a member of the public HTTP 400 and no account, breaking the signup the brief asks for. Fixing it properly needs custom SMTP on a domain we own. Consequence to be honest about: an address is never proved, so accounts may carry addresses their creator does not control. Nothing in this app emails users or treats the address as an identity beyond sign-in.

**Not there yet: captcha.** `[auth.captcha]` is scaffolded in [`supabase/config.toml`](supabase/config.toml) and commented out. Open signup plus no Data API rate limit is a real flooding path — mint accounts, insert until the 500 MB quota flips the project read-only — and hCaptcha closes the account-minting half of it cheaply. It is deferred rather than dismissed, and it is not signup-only: enabling it gates login, password reset and update too, so every auth form has to pass a token or stop working. See [Known limitations](#known-limitations).

**Anonymous sign-ins are off** (`enable_anonymous_sign_ins = false`) and stay off. There is no flow that needs them, and they would be a second way to mint a session.

### Scanning, and what you can check without an account

[`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) runs CodeQL's `security-extended` suite on every push and pull request to `main`, and weekly besides — the schedule is there because the queries change even when this repo does not. [`.github/dependabot.yml`](.github/dependabot.yml) opens weekly grouped version updates for both npm and the workflow actions, which are pinned to commit SHAs rather than tags. Dependabot alerts and security updates are enabled. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, `tsc --noEmit`, `next build` and all 209 tests on the same events — including the 50 that need a Supabase stack, which it starts on the runner. Between them these three files mean the claims made here about scanning, dependencies and tests are all checkable from a run log.

**The workflow is a file rather than a repository setting on purpose.** Code scanning and Dependabot *alerts* need write access — unauthenticated, both endpoints answer `401` — so the Security tab proves nothing to someone reading this repository. What it can show is the workflow, its runs, the annotations CodeQL leaves on a pull request, and Dependabot's PRs. That constraint is the subject of [ADR-0005](docs/adr/0005-security-evidence-must-be-publicly-verifiable.md), and it shapes the rest of this README more than it shapes this paragraph.

---

## Justifications

**RBAC via a JWT claim enforced by RLS** ([ADR-0001](docs/adr/0001-rbac-via-jwt-claim-and-rls.md)). The alternative — application-layer checks only — means one forgotten `if` is a cross-tenant breach with no second line of defence. Putting the role in a `profiles` table and joining it in every policy costs a subquery per policy evaluation. The claim arrives with the token: this project uses asymmetric ES256 signing keys, so `getClaims()` verifies locally with no auth-server round trip.

**"APIs, never Server Actions" reads as governing mutations** ([ADR-0002](docs/adr/0002-apis-for-writes-rsc-for-reads.md)). Server Actions are React's mutation primitive, so the rule unambiguously covers writes; every write is a route handler and no Server Action exists in the codebase. Reads stay in Server Components because routing them through HTTP would add a network hop to reach the same Postgres row and is the classic way to lose the caller's identity. **The REST surface is complete for writes and deliberately partial for reads.**

**Cancelling is a status transition, never a delete** ([ADR-0003](docs/adr/0003-consultation-state-machine.md)). The admin view is specified as "all consultations across the entire system", which necessarily includes cancelled ones — a hard delete would destroy exactly the rows that deliverable exists to show. No role holds the `delete` privilege at all.

**A `uuid` primary key, not `bigint identity`.** Consultation ids appear in URLs and API paths. Sequential keys let anyone walk `/1, /2, /3` and, even with RLS denying every read, learn the system's total volume. The index-locality cost of random v4 uuids is real but immaterial at this scale.

**A Postgres enum for `status`, not `text` + check.** `supabase gen types typescript` emits a real union (`"scheduled" | "completed" | "cancelled"`) from an enum but plain `string` from a check constraint, so illegal states are caught at compile time rather than restated by hand in zod where the two can drift.

**"Not in the past" is a trigger, not a check constraint.** Postgres *accepts* `check (scheduled_at > now())` — it does not reject the volatile function, which is itself a trap — but re-evaluates it on every `UPDATE`. Once a consultation's time passes the row becomes permanently un-updatable, which would break marking it complete, an action that by definition happens afterwards. The trigger validates `scheduled_at` only when it actually changes.

**"15-minute blocks" is a constraint on the input, stated three times.** A consultation may only be scheduled on `:00`, `:15`, `:30` or `:45`: `step` on the picker, a refinement in [`lib/api/schemas.ts`](lib/api/schemas.ts), and a check in the rules trigger ([`…_consultation_booking_boundary.sql`](supabase/migrations/20260813104500_consultation_booking_boundary.sql)). Only the last one holds — `lib/supabase/client.ts` is a browser client, so a signed-in student's JWT reaches PostgREST directly and the other two are a devtools console away from being skipped. The database check is `mod(extract(epoch from scheduled_at), 900) = 0`, which is exact and needs no timezone: the epoch is itself a boundary, `extract` carries the microseconds so a time one microsecond off is caught, and every real UTC offset is a whole multiple of 15 minutes — the finest in use is Nepal's `+05:45` — so a local `:15` is always an absolute `:15` and no DST shift can move a legal time off the grid. Like the past-time rule it is checked only when `scheduled_at` actually changes, so a consultation booked before the rule existed can still be marked complete. **`step` is the part that bites**: it counts *from* `min`, so [`localInputMin()`](components/consultations/datetime.ts) rounds up to the next boundary instead of returning the current minute. Measured in Chrome with an unrounded `min` of `18:07`, the browser rejects `09:00` and `09:15` and accepts `09:07` and `09:22` — exactly inverted. This is input validation and **not availability**: it says nothing about whether anyone is free at that time. A slot picker, real availability and double-booking detection are out of scope, costed in [Assumptions](#assumptions).

**404, never 403, for another user's row.** A row you cannot see should be indistinguishable from one that does not exist. This is not merely policy: RLS returns zero rows in both cases, so telling them apart would require the service-role key that ADR-0001 bans from application code.

**Keyset pagination for the admin list, not `OFFSET`** — and expressed as a row comparison, which is the part that actually does the work. The cursor is the tuple `(scheduled_at, id)`: `scheduled_at` alone is not unique, and without the tiebreak rows sharing a timestamp get skipped or repeated across page boundaries. The composite index `(scheduled_at desc, id desc)` supplies the ordering, but only `(scheduled_at, id) < (cursor_at, cursor_id)` **bounds** the scan — an index scan is bounded by constraints on columns, and the equivalent `scheduled_at < X or (scheduled_at = X and id < Y)` is a top-level `OR`, which is not one. Written that way the planner keeps the ordering and demotes the cursor to a filter that reads and discards every row already paged past, costing exactly what `OFFSET` costs. This page did that until [`…_admin_keyset_rpc.sql`](supabase/migrations/20260813021500_admin_keyset_rpc.sql). PostgREST has no row-comparison operator, so the query is a `security invoker` function called over RPC — invoker rights so RLS still decides what the caller sees. Measured locally on 200,000 rows, buffers read at cursor depth 0 / 1k / 10k / 100k: `OR` form 56 / 88 / 385 / 3389, row comparison 4 / 4 / 4 / 5.

**One `select` policy, not two.** Multiple permissive policies for the same role and action are each evaluated on every query. The student and admin arms are OR-ed into a single policy instead.

**Security tooling is chosen on where its output lands** ([ADR-0005](docs/adr/0005-security-evidence-must-be-publicly-verifiable.md)). Whoever reads this has the repository and the deployed URL, and no dashboard — so a claim is only worth making if it can be checked without an account. Snyk would have found more than CodeQL and is rejected anyway, because its findings sit behind a Snyk login; CodeQL's *default setup* scans identically to the workflow committed here and is rejected because it leaves no file to read. The same test rules out dashboard screenshots as evidence, and it is why the isolation proof is a suite you can run and the pagination proof is buffer counts rather than a graph. The same test is why [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the whole suite and not just the cheap half: the numbers in the next section used to be checkable by cloning, which is more than reading, and a run log is readable.

---

## Assumptions

**The booking form's names are a snapshot of the subject, not a profile.** The brief specifies first and last name on a form filled in by an already-authenticated student — which is redundant on its face. They are stored on the consultation exactly as specified and prefilled from the most recent booking; ownership is `student_id` and is never inferred from a name. Two students may share a name without ambiguity.

**The subject's name is shown where it distinguishes something, and not where it doesn't.** It is captured, stored, validated and returned by the API, and the admin table displays it — labelled "Student", beside a short `student_id`, because there it tells two people apart. The student dashboard has no such column: `CONTEXT.md` defines the Subject as the owning Student, so on your own list it would be your own name on every row, spending the widest fixed column in the table to say nothing. Renaming it does not help; the label was never the problem. That width goes to **Reason**, which is the point of the row. The same reasoning fixed an accessibility defect next door — the complete checkbox was named after the subject, giving every checkbox in a student's list an identical accessible name, and is now named after the consultation's time.

**The brief's "mini-LMS" framing is not a content model.** Every feature listed is consultation booking, so the domain is exactly `Student` and `Consultation`. No courses, lessons or enrolments were invented.

**A student may only book for themselves.** Booking on another student's behalf is rejected by the insert policy.

**The admin view identifies students by name plus a short id prefix, not email.** Emails live in `auth.users`, which the Data API does not expose; reaching them needs a `security definer` function reaching into the auth schema, which widens the security surface for a display nicety.

**One institutional clock is authoritative for display** ([ADR-0004](docs/adr/0004-institution-time-zone-is-authoritative.md)). Times are stored as `timestamptz` and displayed in `Australia/Melbourne` with the locale pinned to `en-AU`, labelled with the zone that applies to that instant. Booking is the exception: the picker stays in the viewer's own clock, with a live echo of the institutional equivalent beneath it. There is no timezone picker and no per-row zone.

**Booking is constrained, but availability is not modelled.** Times are held to 15-minute blocks, which is what the brief asks for; nothing checks whether the institution is free at that time, and two students may book the same block. Showing real availability needs a `security definer` function returning other students' timestamps — a deliberate hole in the isolation invariant the security tests assert — plus an institution-capacity model that does not exist here (a consultation is student ↔ institution; there is no consultant entity), a partial unique index on `scheduled_at`, and 409 handling in the booking dialog. That is half a day to a day of work reopening three settled premises, so it is argued rather than built.

**A reviewer can reach the admin role without asking anyone.** The seed creates both roles locally, so the admin view is one `db reset` away and no credential has to be published to make that true. Access to the *deployed* demo is by request instead — see [Reaching both roles](#reaching-both-roles).

---

## Testing

```bash
pnpm test              # 209 tests
pnpm test:unit         # 159 — schemas, design tokens, time, summaries; no infrastructure needed
pnpm test:integration  # 50 — requires the local stack
pnpm lint
pnpm typecheck
pnpm build
```

**All six run in CI, on every push and pull request to `main`** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml), and its runs are public. Every count and every claim of greenness on this page is therefore checkable by reading a log rather than by cloning, which is the standard [ADR-0005](docs/adr/0005-security-evidence-must-be-publicly-verifiable.md) sets and the one this section previously failed. The 50 integration tests are the expensive half — they need Docker and a Supabase stack on the runner — and they are the half worth paying for, because they are the isolation proof and running only the other 159 would have left the strongest security claim here unverified while making the gap look closed.

`pnpm typecheck` is listed separately because neither of its neighbours covers it: `vitest` does not typecheck, and `next build`'s TypeScript pass does not reach `tests/`. During the TypeScript 7 evaluation all 159 unit tests passed on a toolchain where `eslint` could not load its own configuration.

**Unit** tests cover four things:

- **The zod schemas** — bounds matching the database constraints, whitespace-only rejection, offset-less timestamps, unknown fields, and `status` + `scheduledAt` sent together.
- **The palette**, by parsing `app/globals.css` itself and recomputing every foreground/background pair in both themes. Restating the triples in the test would let the stylesheet drift away from the claim while the test kept passing.
- **The institutional clock**, with exact expected strings. That only works because the zone and locale are both pinned — dropping either option fails the suite on any machine not already set to Melbourne and `en-AU`.
- **The dashboard arithmetic**, including both halves of "upcoming" and the gap it leaves: a still-scheduled consultation whose time has passed is in none of the three counts, so they deliberately do not sum to the row count.

**Integration** tests drive PostgREST as real signed-in users — the surface a student's browser can actually reach, rather than the app's own code path. **Both students are real accounts**, seeded so that every isolation assertion names a specific row belonging to a specific person rather than counting rows. They cover tenant isolation in both directions, the full write matrix (a student cannot edit, reassign or delete another student's row; an admin cannot insert, update or delete one), admin read-all and write-nothing, privilege escalation against `user_roles`, and every state-machine transition including the illegal ones.

One block goes below the API, connecting to Postgres as its owner to disable a rule and see what is behind it — because two independent rules refuse a reassignment and, from the outside, a passing test cannot say which one did. That block is also where the `WITH CHECK` clause on the update policy earns its place: it is redundant today (an update policy with no `WITH CHECK` reuses its `USING` expression) and load-bearing the moment `USING` is widened, which the test rehearses inside a rolled-back transaction. Everything it changes is rolled back; the last two tests assert it.

**The suite has been verified to fail** — by mutating the schema and watching which tests notice:

| Mutation | Red |
| --- | --- |
| `select` policy widened to `using (true)` | 6 — every isolation test, plus the paging function |
| `delete` granted to `authenticated` | 3 — all three delete tests |
| `user_roles` made readable | 2 — the role-table reads |
| Update `USING` widened to admins, `WITH CHECK` dropped | 2 — admin write, and the `WITH CHECK` invariant |

A security test that cannot fail is a comment.

`scripts/verify-api.mjs` additionally exercises the HTTP layer — status codes, problem bodies, proxy behaviour — against a running server, local or deployed:

```bash
APP=https://your-app.vercel.app KEY=<publishable key> node scripts/verify-api.mjs
```

---

## Known limitations

**Concurrency is last-write-wins.** Two tabs patching the same consultation will not conflict; the second wins silently. `If-Match` over `updated_at` is the standard fix.

**Role changes take effect on token refresh**, not immediately. Acceptable because roles are seeded and static; a user-editable role would need a forced refresh.

**No captcha on the auth forms, and no rate limit on `POST /api/consultations`.** Together these are the flooding path: signup is open, the Data API publishes no rate limit, and the free tier flips the project read-only at 500 MB. hCaptcha is scaffolded in `supabase/config.toml` and would close the account-minting half; the insert-side cap is the other half. Neither is built — see [Signup, and the password rule](#signup-and-the-password-rule).

**Admin pagination is forward-only.** True bidirectional keyset needs a reversed query and a direction flag.

**A page cannot set its own status under Cache Components.** The shell is committed with a 200 before anything in a Suspense boundary runs, so every role-based status decision has to happen in `proxy.ts` — see [Role routing](#role-routing). The pages keep their guards as defence in depth, and RLS remains the real boundary.

### Deliberately out of scope

Email and notifications · realtime · rate limiting · calendar integration · double-booking detection · timezone selection · any course or lesson model.

---

## Design

**[`docs/design/oli-learn.md`](docs/design/oli-learn.md)** is the spec — colour tokens for
both themes, the typeface and scale, the wordmark rules, the landing page and dashboard
layouts, and the deletions the rebrand owes. Every decision in it was made by building a
throwaway prototype and looking at it, then recording the answer on a ticket; the
prototypes survive on the `prototype/oli-learn-*` branches, each with a `DECISION.md`.
The spec was written before the build and is now implemented, so it doubles as the
record of why the interface looks the way it does.

A few of those decisions are worth surfacing here, because they were forced by evidence
rather than taste:

- The palette is constrained by **WCAG AA in both themes**. Amber cannot carry white text
  at 4.5:1, which is why blue carries every action and amber appears only as emphasis —
  and why the wordmark's amber half is legal at `text-xl` and above but not below it.
- The ghost **Cancel** button was at 3.8:1 and cancelled rows were dimmed with a blanket
  `opacity-55`, putting every element in them below AA. Both are fixed by the new tokens.
- The **admin view gets no stat tiles**. It is keyset-paginated at 25 rows, so a
  system-wide total would need a count query it does not make — and an exact count over an
  RLS-filtered table is a full scan.
- Times are shown in **one institutional zone with the locale pinned**, because the two
  dashboards previously disagreed: `toLocaleDateString(undefined)` asks each runtime for
  its own defaults, and the admin view renders on a server that is UTC. See
  [ADR-0004](docs/adr/0004-institution-time-zone-is-authoritative.md).

---

## How this was built

The work was planned and tracked as a [map of decision tickets](https://github.com/olibyte/oli-learn/issues/1) — fourteen issues, each recording the question it answered and the reasoning, with architecture decisions promoted to `docs/adr/`. The commit history follows the same shape.
