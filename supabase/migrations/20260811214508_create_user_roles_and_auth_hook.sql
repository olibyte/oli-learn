-- Role storage, the custom access token hook that stamps the role into the JWT,
-- and the trigger that gives every new user a default role.
--
-- See docs/adr/0001-rbac-via-jwt-claim-and-rls.md. The table is the system of
-- record; the JWT claim is only its transport.

create type public.app_role as enum ('student', 'admin');

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student'
);

comment on table public.user_roles is
  'System of record for application roles. Read by the custom access token hook only. Deliberately unreachable through the Data API - see the grants below.';

-- Two independent gates, because grants and RLS control different things:
-- grants decide whether a role can touch the object at all, RLS decides which
-- rows it sees. This table needs both closed.
--
-- Outer gate: the Data API roles get no privileges whatsoever.
revoke all on table public.user_roles from authenticated, anon, public;

-- Inner gate: RLS on, and the only policy is a read for the auth server.
-- Supabase's own RBAC guide creates the policy but never enables RLS, which
-- leaves that policy inert - safe only because of the revoke above, and one
-- careless grant away from being wide open with a policy giving false
-- assurance. Enabling it here means the table stays default-deny even if the
-- grants are later loosened by accident.
alter table public.user_roles enable row level security;

grant all on table public.user_roles to supabase_auth_admin;

create policy "auth admin can read user roles"
  on public.user_roles
  as permissive
  for select
  to supabase_auth_admin
  using (true);

-- The hook. Runs each time a JWT is minted, including on refresh.
--
-- Deliberately NOT `security definer`: Supabase recommends against it here, and
-- without it the function executes as `supabase_auth_admin` and stays subject to
-- the RLS policy above. That is why the policy has to exist - if it is missing
-- the select silently returns no rows, every user gets a null role, and the
-- symptom looks exactly like the hook not running at all.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  resolved_role public.app_role;
begin
  select ur.role
    into resolved_role
    from public.user_roles ur
   where ur.user_id = (event ->> 'user_id')::uuid;

  -- Copy the existing claims and add to them rather than rebuilding: Supabase
  -- rejects a token that is missing any required claim (iss, aud, exp, iat, sub,
  -- role, aal, session_id, email, phone, is_anonymous).
  claims := event -> 'claims';

  if resolved_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(resolved_role::text));
  else
    claims := jsonb_set(claims, '{user_role}', 'null'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- `supabase_auth_admin` is scoped to the `auth` schema by default, so it needs
-- explicit access to reach a function in `public`.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook (jsonb) to supabase_auth_admin;

-- Nobody else may invoke it - otherwise a user could mint their own claims.
revoke execute on function public.custom_access_token_hook (jsonb) from authenticated, anon, public;

-- Every new user gets a role row. The column default alone is not enough: it
-- only applies to rows that exist, and a user with no row at all resolves to a
-- null claim.
--
-- `security definer` IS required here, the opposite of the hook above. This
-- trigger runs inside the signup transaction as `supabase_auth_admin`, and the
-- table has no INSERT policy for anyone - so invoker rights would hit
-- default-deny and block signup. Running as the owner bypasses RLS for this one
-- insert, which is preferable to widening the table's policy surface.
--
-- `set search_path = ''` is mandatory on a security definer function owned by
-- postgres; it forces every identifier to be schema-qualified, including the
-- enum cast.
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'student'::public.app_role)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- A failing trigger on auth.users blocks signup entirely, surfacing as an
-- opaque "Database error saving new user". The `on conflict do nothing` above
-- keeps it idempotent so a retried signup cannot wedge the flow.
create trigger on_auth_user_created_set_role
  after insert on auth.users
  for each row
  execute function public.handle_new_user_role();

-- The trigger fires on insert only, so any user who already exists gets no row.
insert into public.user_roles (user_id, role)
select id, 'student'::public.app_role
  from auth.users
on conflict (user_id) do nothing;
