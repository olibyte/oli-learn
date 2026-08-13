-- 15-minute booking boundaries, added to the rules trigger.
--
-- A consultation may only be scheduled on :00, :15, :30 or :45. This constrains
-- the *input* - it is not availability, and says nothing about whether anyone is
-- free at that time.
--
-- The rule is stated three times: `step` on the picker, a refinement in
-- `lib/api/schemas.ts`, and here. Only this one holds. `lib/supabase/client.ts`
-- is a browser client, so a signed-in student's JWT reaches PostgREST directly
-- and the other two are a devtools console away from being skipped - the same
-- reasoning that put the state machine in this function to begin with.
--
-- This replaces `public.enforce_consultation_rules()` rather than editing the
-- migration that created it (20260811220254), so an already-applied database
-- moves forward by applying this file. The trigger itself is untouched: it
-- already fires `before insert or update`, and `create or replace function`
-- keeps the existing binding.

-- ---------------------------------------------------------------------------
-- Why the check is a modulo on the epoch
-- ---------------------------------------------------------------------------
-- `mod(extract(epoch from ts), 900) = 0` is exact and needs no timezone.
--
--   * The epoch, 1970-01-01 00:00:00+00, is itself a boundary, so "seconds
--     since the epoch divides by 900" is precisely "on a 15-minute boundary".
--   * `extract(epoch from timestamptz)` returns numeric, carrying the
--     microseconds, so a time one microsecond off is caught - not just the
--     wrong minute.
--   * It needs no timezone because every real UTC offset is a whole multiple of
--     15 minutes; the finest in use is Nepal's +05:45. A local :15 is therefore
--     always an absolute :15, and no DST transition can move a legal time off
--     the grid - Melbourne shifts by an hour, Lord Howe by 30 minutes.
--
-- Checking `extract(minute from ...)` instead would have to name a timezone to
-- mean anything, and would silently pass a time carrying stray seconds.

-- ---------------------------------------------------------------------------
-- Why it is checked here and not as a check constraint
-- ---------------------------------------------------------------------------
-- Unlike "not in the past", this rule is immutable - a boundary stays a
-- boundary - so `check (mod(extract(epoch from scheduled_at), 900) = 0)` would
-- be sound in isolation. It is still declined, because it would apply to every
-- existing row at `ALTER TABLE` time. Rows already booked off-boundary, and the
-- historical fixtures the seed inserts with the trigger disabled, would make the
-- migration fail outright or have to be rewritten first. Enforcing it beside the
-- other temporal rule keeps one place where `scheduled_at` is judged, and keeps
-- the rule prospective: an old row can still be marked complete or cancelled,
-- and is only forced onto the grid if someone actually moves its time.

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

    if mod(extract(epoch from new.scheduled_at), 900) <> 0 then
      raise exception 'Consultations are booked in 15-minute blocks, so the time must be :00, :15, :30 or :45'
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

  -- Guarded by "did it actually change", exactly as the past-time rule is. A
  -- consultation booked before this rule existed keeps working: it can still be
  -- marked complete or cancelled, and only has to move onto the grid if its
  -- time is being changed anyway.
  if new.scheduled_at is distinct from old.scheduled_at then
    if old.status <> 'scheduled'::public.consultation_status then
      raise exception 'Only a scheduled consultation can be rescheduled'
        using errcode = 'check_violation';
    end if;

    if new.scheduled_at <= now() then
      raise exception 'A consultation cannot be rescheduled into the past'
        using errcode = 'check_violation';
    end if;

    if mod(extract(epoch from new.scheduled_at), 900) <> 0 then
      raise exception 'Consultations are booked in 15-minute blocks, so the time must be :00, :15, :30 or :45'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;
