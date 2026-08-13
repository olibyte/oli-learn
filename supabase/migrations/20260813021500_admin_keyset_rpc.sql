-- Makes the admin view's keyset pagination actually bound the index scan, and
-- clears the two security advisor WARNs on `handle_new_user_role`.
--
-- ---------------------------------------------------------------------------
-- Correction to 20260812030921_admin_pagination_index.sql
-- ---------------------------------------------------------------------------
-- That migration's header claims "page depth costs nothing". Measured, it did
-- not. The index it adds is correct and stays exactly as it is - the mistake was
-- in the *predicate*, which lived in the application.
--
-- `app/protected/admin/page.tsx` expressed the cursor through PostgREST's `or=`,
-- which reaches Postgres as:
--
--     where scheduled_at < $1 or (scheduled_at = $1 and id < $2)
--
-- An index scan is bounded by constraints on columns, and a top-level OR is not
-- one. Postgres can only reach an OR through a BitmapOr, which yields an
-- unordered bitmap and would force a full Sort under the LIMIT - strictly worse
-- - so the planner keeps the ordered index scan and demotes the whole cursor to
-- a Filter. The ordering half of the old comment was right (there is no Sort
-- node); the bounding half was not. Every row already paged past was read and
-- thrown away, which is precisely what OFFSET does.
--
-- Measured on a local stack at a cursor 10,000 rows deep in 200,000 rows: the OR
-- form and plain OFFSET both read 187 buffers, the row comparison below reads 5.
-- Across depths 0 / 1k / 10k / 100k the OR form reads 5 / 21 / 177 / 1731 while
-- the row comparison reads 5 / 5 / 4 / 3. Linear against flat. These are local
-- numbers at a stated depth, not production figures.
--
-- The fix is a row comparison, `(scheduled_at, id) < ($1, $2)`, which Postgres
-- defines to compare left-to-right and stop at the first unequal pair - exactly
-- a multicolumn index's own ordering, which is why it becomes an Index Cond.
-- PostgREST cannot express it: its operator list has no row-comparison operator,
-- and its docs send you to a view or a function for filters it cannot spell. So
-- the query moves into the database, called over RPC.
--
-- The old cursor was never *wrong*, only mispriced: a cursor still cannot skip
-- or repeat rows when concurrent inserts shift offsets, which OFFSET can. That
-- reason for choosing keyset over OFFSET stands. The cost reason now holds too.

-- ---------------------------------------------------------------------------
-- The admin page query
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER - the default, stated here because it is load-bearing rather
-- than incidental. The function stays subject to RLS, so the existing single
-- select policy keeps doing the work: an admin sees every row, a student sees
-- their own. A `security definer` here would hand the whole table to every
-- caller and silently undo ADR-0001's central property - the admin view would
-- keep looking correct while the isolation guarantee underneath it was gone.
--
-- `stable`: it reads the database and mutates nothing. Not `immutable` - RLS
-- makes the result depend on the caller.
--
-- `set search_path = ''` forces every identifier to be schema-qualified, and
-- keeps advisor lint 0011 (function_search_path_mutable) quiet. It costs SQL
-- function inlining, which is a real trade: the planner sees the function body
-- as its own query rather than folding it into the caller. The plan below is
-- unaffected - the index condition is inside the body either way.
create or replace function public.admin_consultations_page(
  cursor_scheduled_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 26
)
returns setof public.consultations
language sql
stable
security invoker
set search_path = ''
as $$
  -- `select *` is correct here precisely where it would be wrong at the API
  -- boundary: the return type IS the table's rowtype, so naming columns would
  -- break the day one is added. Callers still narrow the columns they receive
  -- through PostgREST's `select=`.
  select *
    from public.consultations
    -- The first page passes no cursor. Rather than branching - `cursor is null
    -- or (...)` would reintroduce the top-level OR this migration exists to
    -- remove - the absent cursor becomes the largest possible tuple, which every
    -- real row sorts below. One predicate, one plan, an Index Cond in both
    -- cases.
   where (scheduled_at, id)
       < (coalesce(cursor_scheduled_at, 'infinity'::timestamptz),
          coalesce(cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
   order by scheduled_at desc, id desc
    -- Clamped, because page_size arrives from the client. RLS already stops a
    -- student reading rows that are not theirs, but nothing else stops an admin
    -- - or anyone who has minted an authenticated session - asking for the whole
    -- table in one response.
   limit least(greatest(coalesce(page_size, 26), 1), 100);
$$;

comment on function public.admin_consultations_page (timestamptz, uuid, integer) is
  'Keyset page of consultations, newest first, for the admin view. Subject to RLS: the caller sees exactly what the select policy allows. The cursor is the (scheduled_at, id) tuple of the last row of the previous page, compared as a row so it bounds the index scan rather than filtering it.';

-- EXECUTE on a new function is granted to PUBLIC by default, so the revoke has
-- to come first or the grant below would be decoration.
revoke execute on function public.admin_consultations_page (timestamptz, uuid, integer)
  from public, anon;

grant execute on function public.admin_consultations_page (timestamptz, uuid, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Advisor lints 0028 / 0029 on handle_new_user_role
-- ---------------------------------------------------------------------------
-- `public.handle_new_user_role()` is SECURITY DEFINER and, like every function,
-- arrived with EXECUTE granted to PUBLIC - so `anon` and `authenticated` hold
-- it, and the advisors flag it as callable through /rest/v1/rpc/.
--
-- It is not exploitable: the function `returns trigger`, and Postgres refuses to
-- invoke such a function directly - "trigger functions can only be called as
-- triggers". But under ADR-0005 the advisor output is precisely what a reviewer
-- is invited to run for themselves, and two unexplained WARNs undercut the
-- argument they are meant to support. The user_roles migration already does this
-- for `custom_access_token_hook`; it simply missed the trigger function beside
-- it.
revoke execute on function public.handle_new_user_role () from public, anon, authenticated;

-- Postgres checks EXECUTE on a trigger function when the trigger is created, not
-- when it fires, so the revoke above cannot break signup. The grant is made
-- explicit anyway: the trigger runs inside the signup transaction as
-- `supabase_auth_admin`, and that path failing is silent until someone tries to
-- register. Depending on a PUBLIC grant that this migration just removed is not
-- a thing to leave implicit.
grant execute on function public.handle_new_user_role () to supabase_auth_admin;
