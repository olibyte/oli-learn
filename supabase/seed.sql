-- Demo accounts, so a reviewer can reach both the student dashboard and the
-- admin view without hand-running SQL after signing up.
--
--   admin@example.com    / local-dev-only   -> admin
--   student@example.com  / local-dev-only   -> student
--
-- THE PASSWORD ABOVE IS FOR LOCAL DEVELOPMENT AND NOTHING ELSE. It is written
-- down here on purpose, and that is not a leak: `supabase db reset` applies
-- this file to a Postgres container on your own machine, bound to localhost,
-- holding fixtures. A password that unlocks only that is configuration, and
-- keeping it in the file is what lets `pnpm test:integration` and
-- `scripts/verify-api.mjs` run with nothing to set up.
--
-- What makes it safe is that the deployed project does NOT use it. The live
-- demo accounts carry a long random password that exists in a password manager
-- and nowhere in this repository, set by hand in the Supabase dashboard. So do
-- not run this seed against the linked project: `db push --include-seed` would
-- reset those accounts back to the value printed above and publish the live
-- demo to anyone who has read this far.
--
-- The general rule this is an exception to still stands. A password that
-- reaches a network is not written into a repository.
--
-- Passwords are bcrypt-hashed with pgcrypto exactly as GoTrue expects. Fixed
-- UUIDs keep the seed idempotent and make the rows easy to reference.

-- Confirm the email immediately: without `email_confirmed_at` the account
-- exists but cannot sign in, which looks like a wrong password.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  is_anonymous,
  -- GoTrue scans these into non-nullable Go strings, so NULL crashes sign-in
  -- with an opaque "Database error querying schema". They must be '', not NULL.
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@example.com',
    extensions.crypt('local-dev-only', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    false,
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'student@example.com',
    extensions.crypt('local-dev-only', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    false,
    '', '', '', '', '', '', '', ''
  )
on conflict (id) do nothing;

-- GoTrue needs a matching identity row or password sign-in fails even though
-- the user exists.
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(), now(), now()
from auth.users u
where u.email in ('admin@example.com', 'student@example.com')
  and not exists (
    select 1
      from auth.identities i
     where i.user_id = u.id
       and i.provider = 'email'
  );

-- The on_auth_user_created_set_role trigger has already given both accounts the
-- default 'student' role, so promoting the admin is an update, not an insert.
insert into public.user_roles (user_id, role)
values ('a0000000-0000-4000-8000-000000000001', 'admin'::public.app_role)
on conflict (user_id) do update set role = excluded.role;

-- A few consultations for the student, covering every status so the dashboard
-- and the admin view both have something meaningful to render.
--
-- These are historical fixtures: a completed consultation dated in the past is
-- a state the application reaches over time, not one it can create in a single
-- insert - the rules trigger rightly rejects booking in the past or inserting
-- anything other than 'scheduled'. Disabling the trigger for the seed is
-- deliberate, and is why this block runs as the owner.
alter table public.consultations disable trigger consultations_enforce_rules;

insert into public.consultations (
  id, student_id, first_name, last_name, reason, scheduled_at, status
)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    'Sam', 'Rivera',
    'Struggling with the week 3 problem set on recursion.',
    now() + interval '3 days',
    'scheduled'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'Sam', 'Rivera',
    'Feedback on my draft dissertation proposal.',
    now() - interval '5 days',
    'completed'
  ),
  (
    'c0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002',
    'Sam', 'Rivera',
    'Course selection advice for next semester.',
    now() - interval '2 days',
    'cancelled'
  )
on conflict (id) do nothing;

alter table public.consultations enable trigger consultations_enforce_rules;
