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

*Not yet written — owned by [#41](https://github.com/olibyte/oli-learn/issues/41).*

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
From `next build` and the build output on disk:

| Route | | Prerendered shell |
| --- | --- | --- |
| `/` | `◐` Partial Prerender | 13,156 bytes |
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

*Not yet written — owned by [#43](https://github.com/olibyte/oli-learn/issues/43).*

---

## Deferred work

*Not yet written — owned by [#44](https://github.com/olibyte/oli-learn/issues/44), which also
links this document from the README and reconciles it with
[Known limitations](../README.md#known-limitations).*
