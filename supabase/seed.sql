-- Demo accounts, so a reviewer can reach both the student dashboard and the
-- admin view without hand-running SQL after signing up.
--
--   admin@example.com     / local-dev-only   -> admin
--   student@example.com   / local-dev-only   -> student
--   student-b@example.com / local-dev-only   -> student
--
-- The second student is not decoration. Isolation is a claim about two people,
-- so a database holding one student cannot demonstrate it - the admin view
-- would show a single name and "admins see across students" would be a sentence
-- rather than something a reviewer can see by clicking. It is seeded rather
-- than signed up by the test suite for two reasons: a fixed UUID lets the tests
-- assert on row identity, and signing up would tie the security suite to signup
-- staying open and uncaptcha'd - so a change to auth config could turn the
-- security tests red for a reason that has nothing to do with security.
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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'student-b@example.com',
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
where u.email in (
    'admin@example.com',
    'student@example.com',
    'student-b@example.com'
  )
  and not exists (
    select 1
      from auth.identities i
     where i.user_id = u.id
       and i.provider = 'email'
  );

-- The on_auth_user_created_set_role trigger has already given all three accounts
-- the default 'student' role, so promoting the admin is an update, not an
-- insert - and both students are left exactly as the trigger made them, which is
-- the point: an account nobody has touched is a student.
insert into public.user_roles (user_id, role)
values ('a0000000-0000-4000-8000-000000000001', 'admin'::public.app_role)
on conflict (user_id) do update set role = excluded.role;

-- A few consultations for the student, covering every status so the dashboard
-- and the admin view both have something meaningful to render, plus one for the
-- second student so the admin view shows two names and the isolation tests have
-- a row on the other side of the boundary to fail to reach.
--
-- These are historical fixtures: a completed consultation dated in the past is
-- a state the application reaches over time, not one it can create in a single
-- insert - the rules trigger rightly rejects booking in the past or inserting
-- anything other than 'scheduled'. Disabling the trigger for the seed is
-- deliberate, and is why this block runs as the owner.
--
-- The times are still snapped to 15-minute boundaries, which the disabled
-- trigger would not have forced. `now() + interval` lands on whatever second
-- the reset happened to run at, so the demo data would have contradicted the
-- booking rule the moment a reviewer opened the dashboard and read a
-- consultation at 4:37 pm. `date_bin` against the epoch is the same arithmetic
-- the trigger checks: bin width 900 seconds, origin on a boundary.
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
    date_bin('15 minutes', now() + interval '3 days', timestamptz 'epoch'),
    'scheduled'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'Sam', 'Rivera',
    'Feedback on my draft dissertation proposal.',
    date_bin('15 minutes', now() - interval '5 days', timestamptz 'epoch'),
    'completed'
  ),
  (
    'c0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002',
    'Sam', 'Rivera',
    'Course selection advice for next semester.',
    date_bin('15 minutes', now() - interval '2 days', timestamptz 'epoch'),
    'cancelled'
  ),
  (
    'c0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000003',
    'Priya', 'Nair',
    'Help choosing a topic for the capstone project.',
    date_bin('15 minutes', now() + interval '4 days', timestamptz 'epoch'),
    'scheduled'
  )
on conflict (id) do nothing;

alter table public.consultations enable trigger consultations_enforce_rules;
