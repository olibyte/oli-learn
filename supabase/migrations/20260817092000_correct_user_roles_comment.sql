-- Corrects one sentence of a table comment. No schema change, no privilege
-- change, no policy change.
--
-- `20260811214508_create_user_roles_and_auth_hook.sql` described this table as
-- "Deliberately unreachable through the Data API". That overclaims, and the
-- overclaim was measured rather than argued: against the deployed project, an
-- anonymous `GET /rest/v1/user_roles` answers `401` / `42501` *"permission
-- denied for table user_roles"* — with a PostgREST hint naming
-- `public.user_roles` back — while a table that does not exist answers `404` /
-- `PGRST205`. The difference confirms the table is there. The same holds for
-- `custom_access_token_hook`, which answers `permission denied for function` to
-- a body matching its `(event jsonb)` signature despite the explicit revoke.
--
-- So the revokes hide the rows and stop execution. They do not hide existence.
-- Nothing here is a vulnerability — the schema is in a public repository, so the
-- oracle discloses something already published — but a comment that claims more
-- than the grants deliver is exactly the drift this repository has now caught
-- four times, and it is the one kind of error a reader cannot check without
-- running the request themselves.
--
-- First measured by #38; re-measured 2026-08-17 by #41, which records the full
-- probe and its status codes in `docs/production-readiness.md`.
--
-- This is a new migration rather than an edit to the applied one: migrations are
-- append-only once they have run, and rewriting the original would leave the
-- file describing something other than what was applied — the same class of
-- mistake as the sentence it fixes.

comment on table public.user_roles is
  'System of record for application roles. Read by the custom access token hook only. Its ROWS are unreachable through the Data API (see the grants in 20260811214508) - its EXISTENCE is not: a revoked table answers 401/42501 where an absent one answers 404/PGRST205. Measured; see docs/production-readiness.md.';
