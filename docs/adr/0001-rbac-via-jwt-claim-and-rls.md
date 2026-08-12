# RBAC via a custom JWT claim, enforced by RLS

The brief left the authorisation mechanism open and asked us to justify whatever we picked. We stamp each user's role into their access token with a Supabase custom access token hook, and enforce authorisation with Postgres row-level security policies that read `auth.jwt()`. Route handlers check the same claim before touching the database, so authorisation is enforced twice — once in the application and once, authoritatively, in the database.

## Considered Options

- **`profiles` table joined by every RLS policy.** Correct, but every policy evaluation pays a subquery against a second table on every row, which is the first thing to bite as the consultation table grows.
- **Application-layer checks only, using the service role key.** Simplest to write, but a single missing `if` in one route handler is a full cross-tenant data breach, and there is no second line of defence. Rejected on security grounds.
- **Custom JWT claim + RLS (chosen).** The session already authenticates via `getClaims()`, so the role arrives with the token at zero query cost, and it is readable in `proxy.ts`, in route handlers, and inside policies alike.

## Consequences

- The role table remains the system of record; the claim is only its transport. The hook reads that table when a token is minted.
- **A role change does not take effect until the user's token refreshes.** This is acceptable here because roles are seeded and static, but it would need an explicit forced-refresh path if roles ever became user-editable. Local `config.toml` sets `jwt_expiry = 3600`, so the local staleness window is one hour.
- **The hook is config-as-code, not a dashboard step** — an earlier draft of this ADR claimed otherwise and was wrong. `supabase/config.toml` exposes `[auth.hook.custom_access_token]`, and `supabase config push` maps it onto the Management API's `hook_custom_access_token_enabled` / `_uri` / `_secrets` (confirmed in the CLI source, `config-sync/auth.sync.ts`). The environment reproduces from the repo with no manual clicks. Gotcha: hooks are gated on *presence*, so removing the block does not disable a hook already enabled on the remote.
- **RLS is a second line of defence only on the publishable-key path.** `service_role` bypasses RLS entirely, so this ADR's rejection of application-layer-only checks silently assumes the secret key is never used from application code. Treat the secret key as forbidden in app code; if that ever changes, this ADR's security argument collapses.
- The project uses **asymmetric JWT signing keys** (ES256, verified at the JWKS endpoint), so `getClaims()` verifies locally with no auth-server round-trip and the zero-cost premise above holds. On a legacy shared secret it would instead make a `getUser()` network call per invocation — including once per request in `proxy.ts`.
- `getClaims()` is **not a pure function**: it may fetch JWKS and may rotate session cookies. It must never be called inside a cached scope, which interlocks with the no-caching-of-user-data finding in issue #2.
- Two SQL shapes are easy to get backwards, and getting them wrong fails silently: the hook must **not** be `security definer` (it stays subject to RLS), while the default-role trigger **must** be (it runs during signup against a default-deny table).
