-- RLS policies for consultations, plus the state machine and temporal rules.
--
-- Division of responsibility: RLS answers "whose row is this", the trigger
-- answers "is this change legal". Both live in the database because a signed-in
-- student holds a JWT that works directly against PostgREST - `lib/supabase/
-- client.ts` is a browser client - so any rule enforced only in a route handler
-- can be bypassed from the devtools console by the row's own owner.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- `auth.uid()` and `auth.jwt()` are wrapped in `(select ...)` so Postgres
-- evaluates them once per statement rather than once per row - without this the
-- claim-based check reintroduces exactly the per-row cost ADR-0001 chose a JWT
-- claim to avoid. `to authenticated` keeps the policies from being evaluated for
-- anon at all; anon additionally holds no grants on this table (see the
-- consultations migration), so it can see nothing.

-- Both read rules live in ONE policy rather than two permissive ones. Multiple
-- permissive policies for the same role and action are each evaluated on every
-- query - Supabase's linter flags it as `multiple_permissive_policies` - so the
-- two arms are OR-ed here instead. First arm: a student sees their own. Second
-- arm: an admin sees everything.
--
-- Note the wrapping is `(select auth.jwt()) ->> 'user_role'`, not
-- `(select auth.jwt() ->> 'user_role')`. Both are scalar subqueries and both
-- evaluate once per statement, but only the former is recognised by the
-- `auth_rls_initplan` linter.
create policy "read own consultations, or all as admin"
  on public.consultations
  for select
  to authenticated
  using (
    (select auth.uid()) = student_id
    or ((select auth.jwt()) ->> 'user_role') = 'admin'
  );

create policy "students book own consultations"
  on public.consultations
  for insert
  to authenticated
  with check ( (select auth.uid()) = student_id );

-- USING governs which rows may be targeted; WITH CHECK governs the row that
-- results.
--
-- The WITH CHECK below is deliberately spelled out even though it is, today,
-- redundant: an UPDATE policy with no WITH CHECK reuses its USING expression for
-- the resulting row, and these two expressions are identical. So it is not what
-- stops a student reassigning a row by changing student_id right now - the rules
-- trigger below rejects that change first, and the USING fallback would reject
-- it after.
--
-- It is written out because that redundancy ends the moment USING is widened.
-- Adding an admin arm here, the way the read policy has one, would widen writes
-- along with reads and hand every admin the ability to edit any student's row -
-- silently, with no line of this file appearing to change meaning. Stating the
-- write rule separately is what keeps the two independent.
--
-- `tests/integration/security.test.ts` rehearses exactly that: it widens USING
-- inside a rolled-back transaction and shows the write refused with this clause
-- and accepted without it.
create policy "students update own consultations"
  on public.consultations
  for update
  to authenticated
  using ( (select auth.uid()) = student_id )
  with check ( (select auth.uid()) = student_id );

-- Deliberately absent:
--   * No admin INSERT/UPDATE/DELETE policy. The brief says the admin view may be
--     read-only, and this enforces it rather than merely not surfacing it - an
--     admin acting on someone else's row is caught by the student policies,
--     which require auth.uid() = student_id.
--   * No DELETE policy for anyone. The consultations migration granted no DELETE
--     privilege at all, so such a policy would be dead code: cancelling is a
--     status transition and the admin view must keep showing cancelled rows.

-- ---------------------------------------------------------------------------
-- State machine and temporal rules
-- ---------------------------------------------------------------------------
-- The legal transitions:
--
--   scheduled -> completed    mark complete
--   completed -> scheduled    mark incomplete again
--   scheduled -> cancelled    cancel
--   cancelled -> *            forbidden; cancelled is terminal
--   completed -> cancelled    forbidden; it already happened
--
-- `scheduled_at` may only move while the consultation is still scheduled, and
-- only to a future time. Note this is checked ONLY when the value actually
-- changes - a plain check constraint would re-evaluate on every update and make
-- a past consultation permanently un-updatable, which would break marking it
-- complete after the fact.
create or replace function public.enforce_consultation_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.scheduled_at <= now() then
      raise exception 'A consultation cannot be booked in the past'
        using errcode = 'check_violation';
    end if;

    if new.status <> 'scheduled'::public.consultation_status then
      raise exception 'A new consultation must start as scheduled'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- UPDATE from here down.

  if new.id is distinct from old.id
     or new.student_id is distinct from old.student_id
     or new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only status and scheduled_at may change after booking'
      using errcode = 'check_violation';
  end if;

  if old.status = 'cancelled'::public.consultation_status
     and (new.status is distinct from old.status
          or new.scheduled_at is distinct from old.scheduled_at)
  then
    raise exception 'A cancelled consultation cannot be changed'
      using errcode = 'check_violation';
  end if;

  if old.status = 'completed'::public.consultation_status
     and new.status = 'cancelled'::public.consultation_status
  then
    raise exception 'A completed consultation cannot be cancelled'
      using errcode = 'check_violation';
  end if;

  if new.scheduled_at is distinct from old.scheduled_at then
    if old.status <> 'scheduled'::public.consultation_status then
      raise exception 'Only a scheduled consultation can be rescheduled'
        using errcode = 'check_violation';
    end if;

    if new.scheduled_at <= now() then
      raise exception 'A consultation cannot be rescheduled into the past'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Security invoker (the default): this function reads only NEW/OLD and needs no
-- elevated privileges. Unlike the signup trigger in the user_roles migration, it
-- never writes to a default-deny table.
create trigger consultations_enforce_rules
  before insert or update on public.consultations
  for each row
  execute function public.enforce_consultation_rules();
