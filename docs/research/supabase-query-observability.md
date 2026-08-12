# Finding slow queries on Supabase, and what this app's three shapes actually plan to

**Bottom line: the tooling question has a short answer — `pg_stat_statements` is already installed on every project, and the whole procedure runs from the SQL editor without a dashboard. The interesting finding is what the procedure turns up when you point it at this repo. The admin page's cursor is not doing keyset pagination.** `.or(scheduled_at.lt.X,and(scheduled_at.eq.X,id.lt.Y))` cannot be used as an index bound, so Postgres walks the composite index from the top and throws away every row already paged past — measured at the same buffer count as the `OFFSET` the comment says it beats. The fix is a row comparison, `(scheduled_at, id) < (X, Y)`, which PostgREST cannot express. Details and numbers in §6.2.

Everything below is sourced from Supabase's own documentation, the Supabase `splinter` linter source, PostgREST's documentation, and the PostgreSQL manual. Plans and settings marked **measured** were reproduced against `public.ecr.aws/supabase/postgres:17.6.1.155` — the image this project's local stack runs — inside transactions that were rolled back. The reproduction script is in §8.

---

## 1. `pg_stat_statements` is already on, and it misleads in three specific ways

### It is installed by default, despite a docs page that reads otherwise

Two Supabase pages disagree, and it is worth knowing which one to believe.

The extension page, [pg_stat_statements: Query Performance Monitoring](https://supabase.com/docs/guides/database/extensions/pg_stat_statements), has an "Enable the extension" section telling you to run `create extension pg_stat_statements with schema extensions;`, which reads as opt-in. The debugging guide, [Database debugging and monitoring](https://supabase.com/docs/guides/database/inspect), states the opposite directly: "every Supabase project has the pg_stat_statements extension enabled by default".

The debugging guide is right. **Measured** on the Supabase Postgres image, the extension is present without anyone installing it, and it is in `shared_preload_libraries` — which is a stronger statement than "installed", because [the PostgreSQL manual](https://www.postgresql.org/docs/17/pgstatstatements.html) requires preloading and a server restart to add the module at all:

```
 extname            | extversion
--------------------+------------
 pg_stat_statements | 1.11

shared_preload_libraries = pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron,
                           pg_net, pgsodium, auto_explain, pg_tle, plan_filter, supabase_vault
```

Treat the extension page's "Enable" section as describing recovery from a `drop extension`, not a required first step. Verify on any project with `select * from pg_extension where extname = 'pg_stat_statements';`.

### The three queries worth running

Supabase publishes these in [the debugging guide](https://supabase.com/docs/guides/database/inspect); they are reproduced faithfully here because they are the answer to "what is the exact SQL". They join `pg_authid` so you can see which role ran what, which matters on a Supabase project where `authenticator`/`authenticated`, `supabase_auth_admin`, and the dashboard's own `postgres` sessions all share one view.

**Most time consuming — total server time, the one to start with.** A query that takes 3 ms but runs 400,000 times costs more than a 900 ms report nobody runs. This ranks by the product.

```sql
select
  auth.rolname,
  statements.query,
  statements.calls,
  statements.total_exec_time + statements.total_plan_time as total_time,
  to_char(
    (
      (statements.total_exec_time + statements.total_plan_time) / sum(
        statements.total_exec_time + statements.total_plan_time
      ) over ()
    ) * 100,
    'FM90D0'
  ) || '%' as prop_total_time
from
  pg_stat_statements as statements
  inner join pg_authid as auth on statements.userid = auth.oid
order by total_time desc
limit 100;
```

**Slowest by execution time — the outliers.** Same shape, ranked by worst single execution.

```sql
select
  auth.rolname,
  statements.query,
  statements.calls,
  statements.total_exec_time + statements.total_plan_time as total_time,
  statements.min_exec_time + statements.min_plan_time as min_time,
  statements.max_exec_time + statements.max_plan_time as max_time,
  statements.mean_exec_time + statements.mean_plan_time as mean_time,
  statements.rows / statements.calls as avg_rows
from
  pg_stat_statements as statements
  inner join pg_authid as auth on statements.userid = auth.oid
order by max_time desc
limit 100;
```

Swap `order by max_time desc` for `order by mean_time desc` to rank by mean, and for `order by statements.calls desc` to get the third published variant, most frequently called.

Note the `+ total_plan_time` terms are load-bearing only if planning is tracked, and it is not by default — [`pg_stat_statements.track_planning` defaults to `off`](https://www.postgresql.org/docs/17/pgstatstatements.html), so those columns read zero and the sum is just execution time. Harmless, but do not conclude that planning is free.

If the Query Performance page or these queries return `insufficient privilege`, the debugging guide's fix is `grant pg_read_all_stats to postgres;`.

### Reset semantics: the numbers are cumulative since the stats were last discarded, which is usually project creation

This is the single biggest way the view misleads. A row's `total_exec_time` is the sum since the last reset, so a query retired six months ago can still sit at the top of the list, and a fix you shipped this morning is averaged against every slow execution that preceded it. `mean_exec_time` in particular will not visibly move for a long time.

The reset function is [`pg_stat_statements_reset(userid, dbid, queryid, minmax_only)`](https://www.postgresql.org/docs/17/pgstatstatements.html); all arguments default to `0`/`false`, so the no-argument call discards everything. Supabase's own guidance is to "consider resetting the analysis after optimizing any queries by running `select pg_stat_statements_reset();`" ([debugging guide](https://supabase.com/docs/guides/database/inspect)).

The measure-and-re-measure procedure:

```sql
-- 1. Discard history so the window starts now. Record the returned timestamp.
select pg_stat_statements_reset();

-- 2. Drive the workload: exercise the app, or wait a representative interval.

-- 3. Read the rankings above. They now describe only this window.

-- 4. Optional: re-measure a single query after a fix, without losing the rest.
select pg_stat_statements_reset(0, 0, s.queryid)
from pg_stat_statements s
where s.query ilike '%consultations%';
```

Two refinements. `pg_stat_statements_reset(0, 0, 0, true)` resets **only** the min/max columns, letting you re-arm outlier detection without discarding the totals. And because there is no "reset at" column in the view, record the timestamp the function returns — otherwise the next reader has no idea what window they are looking at.

**Measured**, `pg_stat_statements.save` is `on`, so statistics survive a restart. On the Free plan, projects pause "after 1 week of inactivity" ([pricing](https://supabase.com/pricing)); do not assume a resumed project's counters mean what you think without re-reading the reset timestamp.

### Two more limits, both of which bite this app

**Only 5,000 statements are kept.** `pg_stat_statements.max` is 5000 (**measured**, and the Supabase default per [the debugging guide](https://supabase.com/docs/guides/database/inspect): "it only stores the latest 5,000 statements"). Least-executed entries are evicted first, so a rare-but-catastrophic query can vanish before you look.

**Nested statements are not tracked at all.** `pg_stat_statements.track` is `top` (**measured**; also the PostgreSQL default), which per [the manual](https://www.postgresql.org/docs/17/pgstatstatements.html) counts only statements issued directly by clients — not statements executed inside functions. Everything this schema does inside `plpgsql` is therefore invisible: the auth hook's `user_roles` lookup, and the `enforce_consultation_rules` trigger body. §6.3 has the measurement and why it cannot be worked around on hosted Supabase.

---

## 2. The dashboard's tools, and which of them prove nothing to a reviewer

ADR-0005's constraint is that a reviewer has no Supabase dashboard access, so evidence must be verifiable from the public repo. The dashboard tools split cleanly.

| Tool | What it actually shows | Free tier | Third-party verifiable? |
| --- | --- | --- | --- |
| **Query Performance** (`/project/_/advisors/query-performance`) | A rendering of `pg_stat_statements` with sortable rankings, plus an "indexes" tab wired to `index_advisor` | Yes — it reads an extension present on every project | **No.** But its *input* is, via §1's SQL |
| **Performance Advisor** (`/project/_/database/performance-advisor`) | The `PERFORMANCE`-category `splinter` lints | Yes | **No** — but the identical lints run as SQL, see §4 |
| **Security Advisor** (`/project/_/database/security-advisor`) | The `SECURITY`-category lints | Yes | **No** — same SQL escape hatch |
| **Reports → Database** | Memory, CPU, disk IOPS, connections, disk usage, database size | Yes, these charts are marked "Free, Pro" | **No.** No SQL equivalent — host metrics, not database state |
| **Reports → API Gateway / PostgREST** | Request volume, error rates, response speed, network traffic | Yes | **No.** No SQL equivalent |
| **Reports → advanced telemetry** | Memory commitment, disk throughput, pooler connections | **No** — Team/Enterprise/Platform only | No |
| **Logs Explorer** (`postgres_logs`, `edge_logs`, …) | SQL-queryable logs across the stack, 1000 rows per run | Yes, but see retention | **No** |
| **Metrics endpoint** (Prometheus) | Scrapeable project metrics | **No** — "Not included in free" | No |

Sources: [Reports](https://supabase.com/docs/guides/monitoring-and-debugging/reports) for the chart inventory and plan gating, [Logging](https://supabase.com/docs/guides/telemetry/logs) for log sources, [pricing](https://supabase.com/pricing) for retention and the metrics endpoint, [Database Advisors](https://supabase.com/docs/guides/database/database-advisors) for the advisor URLs, [index_advisor](https://supabase.com/docs/guides/database/extensions/index_advisor) for the Query Performance report's location under `/advisors/`.

**Two Free-tier ceilings that matter more than the feature list.** Reports are time-range gated — Free reaches "Last 24 hours" and no further; 7 days needs Pro, 28 days needs Team ([Reports](https://supabase.com/docs/guides/monitoring-and-debugging/reports)). And log retention on Free is **1 day** (Pro 7, Team 28, Enterprise 90 — [pricing](https://supabase.com/pricing)). A slow query that fired on Tuesday is simply gone by Thursday. `pg_stat_statements` has no such window, which is another reason to lead with it.

Also worth stating plainly: **Reports do not exist for self-hosted projects at all** — "Reports are only available for projects hosted on the Supabase Cloud platform" ([Reports](https://supabase.com/docs/guides/monitoring-and-debugging/reports)) — so the local `supabase start` stack cannot stand in for them either.

**There is no standalone docs page for the Query Performance report.** It is referenced from the [index_advisor page](https://supabase.com/docs/guides/database/extensions/index_advisor) and from the `insufficient privilege` note in [the debugging guide](https://supabase.com/docs/guides/database/inspect), but nothing documents its columns or its default filters. That is a gap worth knowing about before citing it as evidence of anything: **whether it filters out internal roles such as `supabase_auth_admin` could not be determined from documentation, and could not be tested without dashboard access.** §6.3 depends on this, and says so there.

**The consequence for this repo:** every claim about query performance should be backed by SQL a reader can run against their own instance of this schema, not by a screenshot. §4 and §5 are written to be exactly that.

---

## 3. `explain (analyze, buffers)` works, and you can get a plan for the query PostgREST wrote

### From the SQL editor, for queries you write

Straightforward, and Supabase documents it: "You can use the [query plan analyzer](https://www.postgresql.org/docs/current/sql-explain.html) on any expensive queries that you have identified" ([debugging guide](https://supabase.com/docs/guides/database/inspect)).

```sql
explain (analyze, buffers, verbose) select ...;
```

Two cautions, both from Supabase's own text. `analyze` **executes the statement**, so "be careful using `explain analyze` with `insert`/`update`/`delete` queries, because the query will run, and could have unintended side-effects" — wrap those in `begin; … rollback;`. And plain `explain` without `analyze` plans without executing, which is the move "if you encounter timeouts in your queries".

`buffers` is the parameter worth insisting on: it reports shared block hits and reads, which is what makes §6.2's finding legible. Timing on an idle database is noise; buffer counts are not.

### For the query PostgREST generated, which is the one that actually runs

This is the more useful half, because the statement PostgREST builds from `.select().eq().order().limit()` is not the statement you would have written. There are two routes.

**Route 1 — `.explain()` from the client.** PostgREST returns a plan when a request carries `Accept: application/vnd.pgrst.plan`, gated behind [`db-plan-enabled`, which defaults to false](https://docs.postgrest.org/en/v13/references/observability.html). Supabase exposes it as a chainable method and documents the exact enabling SQL ([Debugging performance issues](https://supabase.com/docs/guides/database/debugging-performance)):

```sql
-- enable explain
alter role authenticator
set pgrst.db_plan_enabled to 'true';

-- reload the config
notify pgrst, 'reload config';
```

```ts
const { data } = await supabase
  .from("consultations")
  .select("id, student_id, scheduled_at, status")
  .order("scheduled_at", { ascending: false })
  .order("id", { ascending: false })
  .limit(26)
  .explain({ analyze: true, buffers: true });
```

`analyze`, `verbose`, `settings`, `buffers` and `wal` all map onto the `EXPLAIN` options, passed as `Accept: application/vnd.pgrst.plan; options=analyze|buffers` ([PostgREST observability](https://docs.postgrest.org/en/v13/references/observability.html)). Because `analyze` executes and commits, PostgREST's docs point at `Prefer: tx=rollback` to avoid that.

**This runs as the request's role with RLS applied**, which is the entire point — a plan taken as `postgres` in the SQL editor does not include the policy quals, and for this schema the policy qual is part of the WHERE clause.

Turn it off afterwards. It is "disabled by default to protect sensitive information about your database structure", and Supabase recommends it for non-production; if it must be on in production, their [pre-request IP filter](https://supabase.com/docs/guides/database/debugging-performance) is the documented mitigation. **Verified locally** that `alter role authenticator set pgrst.db_plan_enabled` is accepted and reverts cleanly.

**Route 2 — `auto_explain`, for plans you cannot intercept.** `auto_explain` is already in `shared_preload_libraries` on the Supabase image, with `auto_explain.log_min_duration` defaulting to **10s** (**measured**). Anything slower than that is already logging its plan to `postgres_logs`. You can lower the threshold at the role level, because [Supabase lists `auto_explain.*` among the settings `supautils` lets the `postgres` role modify](https://supabase.com/docs/guides/database/custom-postgres-config), noting it "Can be configured to log execution plans for queries expected to exceed x seconds, **including function queries**":

```sql
alter role authenticator set auto_explain.log_min_duration to '100ms';
alter role authenticator set auto_explain.log_analyze to 'on';
-- and to reach statements inside plpgsql, which pg_stat_statements will not show you:
alter role authenticator set auto_explain.log_nested_statements to 'on';
```

**Verified locally** that these are accepted on `authenticator` and reset cleanly. Two caveats: `log_analyze` makes every statement pay instrumentation overhead, so use it briefly; and the plans land in `postgres_logs`, which on Free is a 1-day window (§2).

Related and useful: `authenticator` carries `statement_timeout=8s` and `lock_timeout=8s` (**measured**), so the Data API kills anything slower than 8 seconds — a query can be pathological without ever appearing as a slow query, because it appears as an error instead.

---

## 4. The advisors run as plain SQL, and this schema passes both RLS performance lints

### What they are and how to run them

The [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors) "check your database for issues such as missing indexes and improperly set-up RLS policies", and the documented interface is two dashboard pages that "run automatically". The docs do not mention any other way to run them.

They are wrong to omit it, and this is the most useful single finding for ADR-0005's constraint. The advisors are a thin rendering of [**`splinter`**](https://github.com/supabase/splinter), Supabase's open-source linter, which "uses SQL queries to identify common database schema issues". Its README states: "If you are only interested in linting a project, a single query containing the latest version of all lints is available in [`splinter.sql`](https://github.com/supabase/splinter/blob/main/splinter.sql) in the repo root."

So the entire advisor surface is reproducible by a third party with no dashboard:

```bash
# against a local stack
curl -sSL https://raw.githubusercontent.com/supabase/splinter/main/splinter.sql \
  | psql "postgresql://postgres:postgres@localhost:54322/postgres"

# or paste splinter.sql into the SQL editor
```

Each lint returns a common interface — `name, title, level (ERROR/WARN/INFO), facing, categories (SECURITY/PERFORMANCE), description, detail, remediation, metadata, cache_key`. There are 29 lints; the [full catalogue with rationale and remediation](https://supabase.com/docs/guides/database/database-linter) is the rendered version of the same repo. `supabase inspect db` does **not** include them — that command set is the separate performance-inspection suite covered in §5. (Note `supabase db lint` is a *different* tool: `plpgsql_check` over function bodies, not these lints.)

One gotcha from the README worth carrying: several API-exposure lints read `pgrst.db_schemas`, which "PostgREST sets at runtime, but is **not** present in a plain `psql` connection", defaulting to `public` only. Irrelevant to this schema, which exposes only `public`, but it means a `psql` run is not always identical to the dashboard's.

### Does it flag this schema's RLS patterns? No — and that is measured, not assumed

**Lint 0003, `auth_rls_initplan`** (WARN, PERFORMANCE) "Detects if calls to `current_setting()` and `auth.<function>()` in RLS policies are being unnecessarily re-evaluated for each row". Its remediation is exactly the pattern `20260811220254_consultation_policies_and_rules.sql` already uses: wrapping the call so "auth.uid() is called only once at the beginning of the query execution", which "reduces the overhead from a few seconds to a few microseconds with no impact on the result set" ([0003](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)). The [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security) explains the mechanism — "Wrapping the function causes an `initPlan` to be run by the Postgres optimizer, which allows it to 'cache' the results per-statement" — and reports a 179 ms → 9 ms benchmark.

**Lint 0006, `multiple_permissive_policies`** (WARN, PERFORMANCE): "in the worst case Postgres must execute all N policies to determine if a row should be visible. These multiple checks raise the probability of a query falling off an index" ([0006](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)). Its remediation is to merge the arms with `OR` into one policy — again exactly what this schema did.

Running the real `splinter.sql` against this schema, **neither fires**. The complete output is three findings, none of them the two above:

```
unused_index | INFO | {PERFORMANCE} | Index `consultations_student_id_scheduled_at_idx` … has not been used
unused_index | INFO | {PERFORMANCE} | Index `consultations_scheduled_at_id_idx` … has not been used
anon_security_definer_function_executable          | WARN | {SECURITY} | public.handle_new_user_role()
authenticated_security_definer_function_executable | WARN | {SECURITY} | public.handle_new_user_role()
```

Three things follow.

**The migration's comment about `(select auth.jwt()) ->> 'x'` versus `(select auth.jwt() ->> 'x')` is correct, and the reason is that the lint is a string match.** The migration asserts that "both are scalar subqueries and both evaluate once per statement, but only the former is recognised by the `auth_rls_initplan` linter". The lint's predicate in [`splinter.sql`](https://github.com/supabase/splinter/blob/main/splinter.sql) is literally:

```sql
qual like '%auth.jwt()%' and lower(qual) not like '%select auth.jwt()%'
```

Postgres deparses the two forms differently, and only one contains the exact substring `select auth.jwt()`. **Measured**, by creating both policies and applying the published predicate:

| Policy body | Deparsed `pg_policies.qual` | Flagged by 0003? |
| --- | --- | --- |
| `((select auth.jwt()) ->> 'user_role') = 'admin'` | `((( SELECT auth.jwt() AS jwt) ->> 'user_role'::text) = 'admin'::text)` | **no** |
| `(select auth.jwt() ->> 'user_role') = 'admin'` | `(( SELECT (auth.jwt() ->> 'user_role'::text)) = 'admin'::text)` | **yes** |

The second form is a false positive — it is an initplan too — but the linter cannot see that, so the schema's choice is the one that keeps the advisor clean. The comment is right for a slightly different reason than it implies: it is not that one is faster, it is that one is *recognised*.

**Both `unused_index` findings are false positives on any low-traffic project.** The lint is `psui.idx_scan = 0` against [`pg_stat_user_indexes`](https://www.postgresql.org/docs/17/monitoring-stats.html) ([`splinter.sql`](https://github.com/supabase/splinter/blob/main/splinter.sql)), and a freshly reset or freshly seeded database has never scanned anything. The lint's own remediation text says as much — "Consider future usage patterns. An index might be unused now but could be critical for upcoming features" ([0005](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)). Do not drop an index on this signal without the traffic to justify it. §5 gives the query that shows the counter alongside the index's write cost.

**One genuine security lint this ticket did not ask about, with the sting drawn.** `public.handle_new_user_role()` is `SECURITY DEFINER` and `EXECUTE` is granted to `anon` and `authenticated`, so lints 0028/0029 flag it as callable via `/rest/v1/rpc/handle_new_user_role`. The `user_roles` migration carefully revokes `execute` on `custom_access_token_hook` from those roles but does not do the same for the trigger function. **It is not exploitable**: the function `returns trigger`, and Postgres refuses — **measured** — with `ERROR: trigger functions can only be called as triggers`. But the advisor will show two WARNs to anyone who runs it, which is a poor look on a repo whose selling point is that the database is locked down. A one-line `revoke execute on function public.handle_new_user_role() from anon, authenticated;` clears it. Out of scope for this ticket; worth its own.

---

## 5. Index diagnosis

Two routes. The CLI's [`supabase inspect db`](https://supabase.com/docs/guides/database/inspect) wraps most of these — `unused-indexes`, `index-usage`, `seq-scans`, `bloat`, `cache-hit`, `vacuum-stats`, `long-running-queries`, `outliers` — and works against any Postgres via `--db-url`, or against a linked project with no flag:

```bash
supabase link --project-ref <project-id>
supabase inspect db unused-indexes
supabase inspect db seq-scans
supabase inspect db bloat
# or, with no link:
supabase inspect db outliers --db-url "postgresql://postgres:postgres@localhost:54322/postgres"
```

Note the docs' list of commands requiring `pg_stat_statements` — `calls, locks, cache-hit, blocking, unused-indexes, index-usage, bloat, outliers, table-record-counts, replication-slots, seq-scans, vacuum-stats, long-running-queries` — which is nearly all of them, and fine given §1.

The SQL route, for when you want the numbers in a document.

**Unused indexes, with the write cost that makes them worth removing.** The advisor's version is a bare `idx_scan = 0`; this adds size and the table's write volume, which is the actual argument for dropping one.

```sql
select
  psui.schemaname,
  psui.relname                              as table_name,
  psui.indexrelname                         as index_name,
  psui.idx_scan                             as index_scans,
  pg_size_pretty(pg_relation_size(psui.indexrelid)) as index_size,
  pgsut.n_tup_ins + pgsut.n_tup_upd + pgsut.n_tup_del as writes_paying_for_it
from pg_catalog.pg_stat_user_indexes psui
  join pg_catalog.pg_index pi on psui.indexrelid = pi.indexrelid
  join pg_catalog.pg_stat_user_tables pgsut on psui.relid = pgsut.relid
where psui.idx_scan = 0
  and not pi.indisunique
  and not pi.indisprimary
  and psui.schemaname not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions', 'realtime', 'vault')
order by pg_relation_size(psui.indexrelid) desc;
```

Read `idx_scan` against the reset timestamp, not in the abstract — [`pg_stat_reset()` and friends](https://www.postgresql.org/docs/17/monitoring-stats.html) zero these independently of `pg_stat_statements_reset()`, so the two clocks are not the same clock.

**Foreign keys with no covering index.** Lint [0001](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys); the shape below is the same catalogue join `splinter.sql` uses, reduced to the columns you want to read. The test that matters is whether the FK's columns are a *leading prefix* of some index, not merely present in one.

```sql
with fks as (
  select ns.nspname as schema_name, cl.relname as table_name,
         cl.oid as table_oid, ct.conname as fkey_name, ct.conkey as col_attnums
  from pg_catalog.pg_constraint ct
    join pg_catalog.pg_class cl on ct.conrelid = cl.oid
    join pg_catalog.pg_namespace ns on cl.relnamespace = ns.oid
  where ct.contype = 'f'
    and ns.nspname not in ('pg_catalog','information_schema','auth','storage','vault','extensions')
),
idx as (
  select pi.indrelid as table_oid,
         string_to_array(indkey::text, ' ')::smallint[] as col_attnums
  from pg_catalog.pg_index pi
  where indisvalid
)
select fks.schema_name, fks.table_name, fks.fkey_name, fks.col_attnums
from fks
where not exists (
  select 1 from idx
  where idx.table_oid = fks.table_oid
    and idx.col_attnums[1:array_length(fks.col_attnums, 1)] = fks.col_attnums
)
order by 1, 2;
```

**This schema returns nothing.** `consultations.student_id → auth.users(id)` is covered by `consultations_student_id_scheduled_at_idx`, whose leading column is `student_id`; `user_roles.user_id → auth.users(id)` is the primary key. Both are deliberate — the consultations migration says so in a comment — and this is the query that proves it.

**Bloat.** Lint [0020](https://supabase.com/docs/guides/database/database-linter?lint=0020_table_bloat) covers tables; `supabase inspect db bloat` covers both tables and indexes and is the path of least resistance. A dead-tuple ratio straight from the catalogue is enough to know whether to look harder:

```sql
select
  relname                                          as table_name,
  n_live_tup, n_dead_tup,
  round(100 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0)::numeric, 1) as dead_pct,
  pg_size_pretty(pg_table_size(relid))             as table_size,
  last_autovacuum, last_autoanalyze
from pg_catalog.pg_stat_user_tables
order by n_dead_tup desc;
```

Remediation is `vacuum full`, but with a real warning attached: it "locks the table, blocking all other accesses until it finishes", and [0020](https://supabase.com/docs/guides/database/database-linter?lint=0020_table_bloat) advises caution above ~300k rows, pointing at `pg_repack` instead. **For this app, bloat is close to a non-issue by construction**: no role holds `DELETE` on `consultations` at all, and the state machine forbids in-place churn beyond `status` and `scheduled_at`. Updates still create dead tuples, but the volume is bounded by the number of consultations, not by a delete-heavy workload.

**Cache hit rate**, the one number that tells you the problem is memory rather than SQL — Supabase's threshold is "< 99% … can indicate your compute plan is too small" ([debugging guide](https://supabase.com/docs/guides/database/inspect)):

```sql
select 'index hit rate' as name,
       (sum(idx_blks_hit)) / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100 as ratio
from pg_statio_user_indexes
union all
select 'table hit rate' as name,
       sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 as ratio
from pg_statio_user_tables;
```

**`index_advisor`, for the other direction.** Rather than finding indexes you do not need, it proposes ones you do: `create extension index_advisor;` then `select * from index_advisor('select ...');`, returning cost before/after and `create index` statements. It "Supports generic parameters e.g. `$1`, `$2`" and is what the Query Performance report's "indexes" tab calls. Its limitation matters here: it "will only recommend **single column, B-tree indexes**" ([index_advisor](https://supabase.com/docs/guides/database/extensions/index_advisor)) — so it would never have proposed either of this schema's composite indexes, and it will not propose the fix in §6.2.

---

## 6. This app's three query shapes

### 6.1 The student dashboard read — served exactly, degrades only with one student's own history

`app/protected/page.tsx:19-23` issues `.eq("student_id", …).order("scheduled_at", { ascending: false })`, with the RLS qual from `20260811220254_consultation_policies_and_rules.sql` ORed on top.

**Index: `consultations_student_id_scheduled_at_idx (student_id, scheduled_at desc)`.** This is the textbook fit. The PostgreSQL manual's rule for multicolumn B-trees is that "equality constraints on leading columns, plus any inequality constraints on the first column that does not have an equality constraint, will be used to limit the portion of the index that is scanned" ([multicolumn indexes](https://www.postgresql.org/docs/17/indexes-multicolumn.html)); `student_id = $1` is that equality, and the second column then supplies the ordering for free. **Measured** at 12 rows for one student among 200,000:

```
Index Scan using _ks_student_sched_idx on _ks (actual rows=11)
  Index Cond: (student_id = '…'::uuid)
  Buffers: shared hit=11 read=3
```

`Index Cond`, no `Sort` node, 14 buffers. The index does both jobs.

**Two honest caveats.**

The plan is selectivity-dependent, not guaranteed. **Measured** with the same query against a student owning 400 scattered rows, the planner switched to `Bitmap Heap Scan` + `Sort` (400 heap blocks, `Sort Method: quicksort`), because a bitmap scan's sequential heap access beat 400 random index-order fetches. That is the planner being right, not a regression — but "this query never sorts" is too strong a claim to make.

**The read has no `LIMIT`.** It returns every consultation the student has ever had, forever, and `toDto` maps all of them into the client payload. Cost is linear in one student's history and completely independent of table size, so it will not degrade as the *system* grows — but it has no ceiling of its own. For a consultation-booking domain that is bounded in practice; it is still the only read in the app with no bound at all, and it is where a `.limit()` or a date floor would go if one were ever wanted.

### 6.2 The admin keyset page — the OR cursor cannot bound the index scan

`app/protected/admin/page.tsx:54-65` orders on `(scheduled_at desc, id desc)`, takes `PAGE_SIZE + 1`, and applies the cursor as:

```ts
query = query.or(
  `scheduled_at.lt.${cursor.scheduledAt},and(scheduled_at.eq.${cursor.scheduledAt},id.lt.${cursor.id})`,
);
```

PostgREST maps `or=(…)` to SQL `OR` and `and(…)` to `AND` ([tables and views](https://docs.postgrest.org/en/v13/references/api/tables_views.html)), so the predicate reaching Postgres is:

```sql
where scheduled_at < $1 or (scheduled_at = $1 and id < $2)
order by scheduled_at desc, id desc limit 26
```

**Index: `consultations_scheduled_at_id_idx (scheduled_at desc, id desc)`**, added by `20260812030921_admin_pagination_index.sql`.

**The claim in the code is wrong.** `app/protected/admin/page.tsx:51-53` says "page depth stays O(1) because the composite index … is walked directly to the cursor. OFFSET would re-scan every skipped row." The migration header repeats it. In fact the OR form re-scans every skipped row too.

The reason is the same manual rule quoted in §6.1: an index scan is bounded by equality and inequality *constraints on columns*. A top-level `OR` is neither. Postgres can only turn an `OR` into index access via `BitmapOr`, which produces an unordered bitmap and would force a full `Sort` — strictly worse under a `LIMIT` — so the planner correctly chooses an ordered index scan and demotes the whole cursor to a `Filter`. The index still earns its place by supplying the ordering (there is no `Sort` node, and that part of the comment is right). It just does not bound anything.

**Measured** at a cursor 10,000 rows deep in a 200,000-row table:

```
-- A. the OR form the app generates
Limit  ->  Index Scan using _ks_sched_id_idx on _ks (actual rows=26)
             Filter: ((scheduled_at < …) OR ((scheduled_at = …) AND (id < …)))
             Rows Removed by Filter: 10001
             Buffers: shared hit=187

-- B. a row comparison over the same index
Limit  ->  Index Scan using _ks_sched_id_idx on _ks (actual rows=26)
             Index Cond: (ROW(scheduled_at, id) < ROW(…, …))
             Buffers: shared hit=5

-- C. plain OFFSET, the thing keyset pagination was chosen to beat
Limit  ->  Index Scan using _ks_sched_id_idx on _ks (actual rows=10026)
             Buffers: shared hit=187
```

`Filter` versus `Index Cond` is the whole finding, and **A and C read the identical 187 buffers**. The cursor buys nothing over `OFFSET` on cost. (It still buys correctness — a cursor cannot skip or repeat rows when concurrent inserts shift offsets, which `OFFSET` can. That was worth having and remains true.)

Scaling, **measured** across four depths — index-scan node only, buffers and discarded rows:

| Cursor depth | OR form: buffers | OR form: rows discarded | Row comparison: buffers | Row comparison: rows discarded |
| --- | --- | --- | --- | --- |
| 0 | 5 | 1 | 5 | 0 |
| 1,000 | 21 | 1,001 | 5 | 0 |
| 10,000 | 177 | 10,001 | 4 | 0 |
| 100,000 | 1,731 | 100,001 | 3 | 0 |

Linear against flat. The row-comparison column is genuine O(1) in page depth; the OR column is O(depth).

**The fix is a row comparison, and PostgREST cannot express one.** `(scheduled_at, id) < ($1, $2)` is a row constructor comparison, which Postgres defines to compare "left-to-right, stopping as soon as an unequal or null pair of elements is found" ([row constructor comparison](https://www.postgresql.org/docs/17/functions-comparisons.html)) — precisely a multicolumn index's own ordering, which is why it becomes an `Index Cond`. But PostgREST's operator list (`eq, gt, gte, lt, lte, neq, like, ilike, match, in, is, isdistinct, fts, cs, cd, ov, sl, sr, nxr, nxl, adj, not, or, and, all, any`) contains no row-comparison operator, and its docs say so generically: "For more complicated filters you will have to create a new view in the database, or use a function" ([tables and views](https://docs.postgrest.org/en/v13/references/api/tables_views.html)).

So there are three options, in ascending cost:

1. **Correct the comments.** Both the page and the migration assert O(1); neither is true. This costs nothing and is the minimum honest fix. The keyset cursor is still defensible on stability grounds — just not on cost.
2. **Move the page query to an RPC** — a `stable`, `security invoker` SQL function doing `where (scheduled_at, id) < (cursor_at, cursor_id)`, called with `supabase.rpc(...)`. Security invoker is essential so RLS still applies; this is the read path, so the "APIs, never Server Actions" rule in `AGENTS.md` is untouched — an RPC over the Data API *is* the API.
3. **Leave it.** At 25 rows a page against a take-home dataset, 1,731 buffers at page 4,000 is hypothetical. This is a real option, but it should be a *chosen* one, recorded, rather than the current state of believing the cost is O(1).

Whichever is chosen, option 1 is not optional, because the comment is currently load-bearing documentation that is false.

**One more thing this page does that the plan makes visible.** The admin's RLS arm `((select auth.jwt()) ->> 'user_role') = 'admin'` is true for every row, so it is evaluated per row and discards nothing. That is cheap (an initplan comparison) and correct — but it means the admin path has *no* selective predicate at all beyond the cursor. The `LIMIT` is the only thing keeping the page bounded, which is exactly why the cursor failing to bound the scan matters more here than it would elsewhere.

### 6.3 The auth hook's `user_roles` lookup — fast, extremely hot, and invisible

`20260811214508_create_user_roles_and_auth_hook.sql:58-61` runs, on every JWT mint **and every refresh**:

```sql
select ur.role into resolved_role
  from public.user_roles ur
 where ur.user_id = (event ->> 'user_id')::uuid;
```

**Index: `user_roles_pkey`**, the implicit unique B-tree behind `user_id uuid primary key`. A single-row equality lookup on a unique index is O(log n) with a tiny constant. **It does not degrade at scale** — not at a thousand users, not at a million. There is nothing to optimise, and the RLS policy it runs under is `using (true)`, which adds nothing. This shape is fine.

**The problem is that you cannot see it.** It is a statement inside a `plpgsql` function, and `pg_stat_statements.track` is `top` (**measured**), which tracks "only top-level statements … not nested" ([the manual](https://www.postgresql.org/docs/17/pgstatstatements.html)). **Measured** by building a structurally identical hook, resetting, calling it once, and reading the view back:

```
                query                 | calls | toplevel
--------------------------------------+-------+----------
 select public._probe_hook($1::jsonb) |     1 | t
(1 row)
```

The outer call is tracked. **The inner `select` against the roles table does not appear at all.** The same is true of the `enforce_consultation_rules` trigger body, which runs on every insert and update to `consultations`.

**And on hosted Supabase you cannot turn this on for the role that matters.** `pg_stat_statements.*` is listed among the settings `supautils` lets the `postgres` role change at the role level ([custom Postgres config](https://supabase.com/docs/guides/database/custom-postgres-config)), and the hook deliberately runs as `supabase_auth_admin` rather than `security definer`. But **measured**:

```
postgres=# alter role supabase_auth_admin set pg_stat_statements.track to 'all';
ERROR:  "supabase_auth_admin" is a reserved role, only superusers can modify it
```

Database-level is closed too — `alter database postgres set log_min_duration_statement …` returns `permission denied to set parameter`. **Measured.** Supabase also ships `log_statement=none` pinned on `supabase_auth_admin` itself.

What remains, in order of preference:

- **The hook's top-level invocation is tracked.** Whatever GoTrue sends to call `custom_access_token_hook` appears in `pg_stat_statements` as a top-level statement attributed to `supabase_auth_admin`, carrying the *total* cost of the hook including its inner query. That is the number you actually want for capacity questions, and §1's queries surface it — as long as you do not filter the view to application roles, which is the natural thing to do and would hide it.
- **`auto_explain.log_nested_statements`** reaches inside functions (§3), and is the documented use case, but the same reserved-role wall applies to setting it on `supabase_auth_admin`.
- **`track_functions`** is role-level configurable and gives per-function call counts and total time via `pg_stat_user_functions` — no per-statement breakdown, but it answers "how much time is the hook costing" without needing nested tracking.

**The reviewer-facing consequence.** Whether the dashboard's Query Performance page shows `supabase_auth_admin`'s statements at all could not be determined — there is no docs page describing its filters (§2), and testing it needs dashboard access this project's constraint assumes nobody has. So the honest statement for the readiness doc is: *the most frequently executed query in this system is a primary-key lookup that cannot degrade, and the tooling's default configuration does not show it.* Both halves are verifiable from the SQL in this document.

---

## 7. The procedure, condensed

1. **Confirm the extension.** `select * from pg_extension where extname = 'pg_stat_statements';` It should already be there (§1).
2. **Reset, and write down the timestamp.** `select pg_stat_statements_reset();` Without this you are reading history, not the present (§1).
3. **Drive a representative workload.** Exercise the app, or wait.
4. **Rank by total time first, then by mean.** §1's two queries. Total time finds the query that costs the most; mean time finds the one that feels worst.
5. **Remember what is missing.** Anything inside a function or trigger is absent (§1, §6.3). The top-level call that invoked it is not.
6. **Get plans for the real statements, not paraphrases.** `.explain({ analyze: true, buffers: true })` after enabling `pgrst.db_plan_enabled`, so RLS quals are in the plan (§3). Turn it off afterwards.
7. **Read `Index Cond` versus `Filter`, and `Rows Removed by Filter`.** This is the line that distinguishes an index that bounds a scan from one that merely orders it — the whole of §6.2 in one habit.
8. **Run the advisors as SQL.** `splinter.sql` against the database (§4). Treat `unused_index` on a quiet project as noise.
9. **Check the index diagnostics.** Unused indexes with their write cost, uncovered foreign keys, dead-tuple ratio, cache hit rate (§5).
10. **Reset again after each fix** so the next measurement is clean, and prefer `pg_stat_statements_reset(0,0,queryid)` when you only changed one thing (§1).

Steps 1–10 all run from the SQL editor or `psql`. Nothing in the procedure requires a dashboard, which is the property ADR-0005 needs.

---

## 8. Reproducing the measurements

Every "**measured**" claim above came from `psql` against this repo's own local stack — `public.ecr.aws/supabase/postgres:17.6.1.155`, PostgreSQL 17.6 — with schema changes wrapped in `begin; … rollback;` so nothing persisted.

```bash
supabase start
psql "postgresql://postgres:postgres@localhost:54322/postgres"
```

The §6.2 result reproduces with:

```sql
begin;
create table _ks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null, first_name text not null, last_name text not null,
  reason text not null, scheduled_at timestamptz not null,
  status text not null default 'scheduled'
);
insert into _ks (student_id, first_name, last_name, reason, scheduled_at)
select gen_random_uuid(), 'a', 'b', 'reason',
       timestamptz '2020-01-01' + (g * interval '1 minute')
from generate_series(1, 200000) g;
create index _ks_sched_id_idx on _ks (scheduled_at desc, id desc);
analyze _ks;

create temp table cur as
select scheduled_at, id from _ks order by scheduled_at desc, id desc offset 10000 limit 1;

-- A: the OR form -> Filter, ~10k rows discarded
explain (analyze, buffers, costs off)
select id, reason from _ks
where scheduled_at < (select scheduled_at from cur)
   or (scheduled_at = (select scheduled_at from cur) and id < (select id from cur))
order by scheduled_at desc, id desc limit 26;

-- B: the row comparison -> Index Cond, nothing discarded
explain (analyze, buffers, costs off)
select id, reason from _ks
where (scheduled_at, id) < ((select scheduled_at from cur), (select id from cur))
order by scheduled_at desc, id desc limit 26;
rollback;
```

The §4 linter result reproduces with `curl -sSL https://raw.githubusercontent.com/supabase/splinter/main/splinter.sql | psql "$DB_URL"` after `supabase db reset`.

---

## Sources

Supabase: [pg_stat_statements](https://supabase.com/docs/guides/database/extensions/pg_stat_statements) · [Database debugging and monitoring](https://supabase.com/docs/guides/database/inspect) · [Performance Tuning](https://supabase.com/docs/guides/platform/performance) · [Database Advisors](https://supabase.com/docs/guides/database/database-advisors) · [Database Linter catalogue](https://supabase.com/docs/guides/database/database-linter) · [RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security) · [index_advisor](https://supabase.com/docs/guides/database/extensions/index_advisor) · [Debugging performance issues / `explain()`](https://supabase.com/docs/guides/database/debugging-performance) · [Custom Postgres config](https://supabase.com/docs/guides/database/custom-postgres-config) · [Reports](https://supabase.com/docs/guides/monitoring-and-debugging/reports) · [Logging](https://supabase.com/docs/guides/telemetry/logs) · [Pricing](https://supabase.com/pricing) · [splinter](https://github.com/supabase/splinter) and [splinter.sql](https://github.com/supabase/splinter/blob/main/splinter.sql)

PostgreSQL 17: [pg_stat_statements](https://www.postgresql.org/docs/17/pgstatstatements.html) · [EXPLAIN](https://www.postgresql.org/docs/17/sql-explain.html) · [Multicolumn indexes](https://www.postgresql.org/docs/17/indexes-multicolumn.html) · [Row constructor comparison](https://www.postgresql.org/docs/17/functions-comparisons.html) · [Monitoring statistics](https://www.postgresql.org/docs/17/monitoring-stats.html) · [auto_explain](https://www.postgresql.org/docs/17/auto-explain.html)

PostgREST 13: [Observability / execution plan](https://docs.postgrest.org/en/v13/references/observability.html) · [Configuration (`db-plan-enabled`)](https://docs.postgrest.org/en/v13/references/configuration.html) · [Tables and views: operators and logical operators](https://docs.postgrest.org/en/v13/references/api/tables_views.html)
