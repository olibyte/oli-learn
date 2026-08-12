-- Consultations: a scheduled one-to-one session between a student and the
-- institution. See CONTEXT.md for the domain glossary and
-- docs/adr/0003-consultation-state-machine.md for the state model.

create extension if not exists moddatetime with schema extensions;

-- A consultation has exactly one status. Modelled as an enum rather than a text
-- check constraint so `supabase gen types` emits a real TypeScript union,
-- catching illegal states at compile time alongside the zod schemas.
create type public.consultation_status as enum (
  'scheduled',
  'completed',
  'cancelled'
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,

  -- Snapshot of the consultation's subject, captured at booking time. Held on
  -- the row rather than read from a profile: the brief specifies these fields on
  -- the booking form, and ownership is `student_id`, not the name.
  first_name text not null,
  last_name text not null,

  reason text not null,
  scheduled_at timestamptz not null,
  status public.consultation_status not null default 'scheduled',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint consultations_first_name_not_blank
    check (char_length(btrim(first_name)) between 1 and 100),
  constraint consultations_last_name_not_blank
    check (char_length(btrim(last_name)) between 1 and 100),
  constraint consultations_reason_not_blank
    check (char_length(btrim(reason)) between 1 and 1000)
);

comment on table public.consultations is
  'A scheduled one-to-one session between a student and the institution. Cancelling is a status transition, never a delete - the admin view must still show cancelled rows.';

comment on column public.consultations.first_name is
  'Subject snapshot captured at booking time; not a profile reference.';

comment on column public.consultations.scheduled_at is
  'When the consultation is to take place. The "not in the past" rule is enforced in the application layer on create and reschedule, NOT as a check constraint: a volatile CHECK re-evaluates on every UPDATE, which would make a past consultation permanently un-updatable and break marking it complete.';

-- Student dashboard: "my consultations, soonest first". The leftmost prefix
-- (student_id) also serves the foreign key and the RLS ownership predicate.
create index consultations_student_id_scheduled_at_idx
  on public.consultations (student_id, scheduled_at desc);

-- Admin view: every consultation across the system, ordered by date.
create index consultations_scheduled_at_idx
  on public.consultations (scheduled_at desc);

create trigger consultations_set_updated_at
  before update on public.consultations
  for each row
  execute function extensions.moddatetime (updated_at);

-- RLS is enabled here, in the same migration that creates the table: a table in
-- `public` is reachable through the Data API the moment it exists, so it must
-- never land unprotected. Policies are added in #8. Until then this table is
-- default-deny for `anon` and `authenticated`.
alter table public.consultations enable row level security;

-- Table-level grants are separate from RLS and are *not* granted by default for
-- DML: a fresh table in `public` arrives with REFERENCES/TRIGGER/TRUNCATE only,
-- so correct RLS policies alone would still yield permission-denied. Two
-- deliberate tightenings while setting them explicitly:
--
--   * TRUNCATE bypasses RLS entirely, so it is revoked rather than inherited.
--   * No DELETE is granted to anyone. Cancelling is a status transition
--     (ADR-0003), so nothing should ever delete a consultation row - the admin
--     view has to keep showing cancelled ones. Withholding the privilege means
--     even a mistaken policy in #8 cannot destroy history.
--
-- `anon` is granted nothing: consultations are never readable while signed out.
revoke all on public.consultations from anon, authenticated;
grant select, insert, update on public.consultations to authenticated;
