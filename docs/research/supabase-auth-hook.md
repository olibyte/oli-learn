# How the Supabase custom access token hook actually works

Research for [issue #3](https://github.com/olibyte/with-supabase-app/issues/3). Establishes the mechanics behind
[ADR-0001](../adr/0001-rbac-via-jwt-claim-and-rls.md) — RBAC via a role claim stamped into the JWT and enforced by RLS.

**Sources.** Official Supabase documentation, Supabase's own source repositories (`supabase/supabase`, `supabase/cli`),
the PostgreSQL manual, and the `@supabase/auth-js` / `@supabase/ssr` code installed in this repo at
`node_modules/@supabase/`. Blog posts and Stack Overflow were not used. Anything I could not confirm from a primary
source is called out in [§9 Not confirmed](#9-what-i-could-not-confirm).

**Versions this was checked against.** `@supabase/supabase-js` 2.112.2, `@supabase/auth-js` 2.112.2,
`@supabase/ssr` 0.12.4. Docs read 2026-08-12.

**Headline:** the mechanism works as ADR-0001 describes, but two of the ADR's stated consequences need amending —
see [§10 Impact on ADR-0001](#10-impact-on-adr-0001). Most important: **the hook is not dashboard-only configuration.**
It can be declared in `supabase/config.toml` and applied with `supabase config push`.

Sections 1–7 answer the original brief. **[§8](#8-trust-semantics-getclaims-vs-getuser-vs-getsession) was added for the
parallel Next.js caching research on issue #2** and settles the route-handler auth shape for the whole project:
`getClaims()` is cryptographically authoritative and is the documented default, but it is not a pure function and must
never run inside a cached scope.

---

## 1. Declaring the hook

### Signature

The function takes exactly one `jsonb` argument and returns `jsonb`:

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  -- Insert variables here
begin
  -- Insert logic here
  return event;
end;
$$;
```

> "A Postgres function can be configured as a hook. The function should take in a single argument -- the event of type
> JSONB -- and return a JSONB object. Since the Postgres function runs on your database, the request does not leave
> your project's instance."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

The function name is not fixed by the platform — the `uri` you configure points at whatever schema and function you
choose. `custom_access_token_hook` is the suggested name.
(Source: <https://supabase.com/docs/guides/auth/auth-hooks>, "Suggested Function Name" column.)

### When it runs

> "Custom Access Token | `custom_access_token` | Each time a new JWT is created | Returns the claims you wish to be
> present in the JWT."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

"Each time a new JWT is created" includes token refreshes — `token_refresh` is one of the documented values of
`authentication_method` (see below). This is what makes role changes propagate at all; see [§5](#5-refresh-and-staleness).

### What it receives

| Field | Type | Description |
| --- | --- | --- |
| `user_id` | `string` | Unique identifier for the user attempting to sign in. |
| `claims` | `object` | Claims which are included in the access token. |
| `authentication_method` | `string` | The authentication method used to request the access token. Possible values include: `oauth`, `password`, `otp`, `totp`, `recovery`, `invite`, `sso/saml`, `magiclink`, `email/signup`, `email_change`, `token_refresh`, `oauth_provider/authorization_code`, `anonymous`. |

Example payload, verbatim from the docs:

```json
{
  "user_id": "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
  "claims": {
    "aud": "authenticated",
    "exp": 1715690221,
    "iat": 1715686621,
    "sub": "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
    "email": "",
    "phone": "",
    "app_metadata": {},
    "user_metadata": {},
    "role": "authenticated",
    "aal": "aal1",
    "amr": [ { "method": "anonymous", "timestamp": 1715686621 } ],
    "session_id": "4b938a09-5372-4177-a314-cfa292099ea2",
    "is_anonymous": true,
    "client_id": "oauth-client-id-if-oauth-flow"
  },
  "authentication_method": "anonymous"
}
```

Source: <https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook>

### What it must return

| Field | Type | Description |
| --- | --- | --- |
| `claims` | `object` | The updated claims after the hook has been run. |

> "Return these only if your hook processed the input without errors."

Source: <https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook>

**Gotcha — two shapes both work.** The Outputs table says return an object with a `claims` key. The docs' own
"Minimal JWT" example does exactly that (`return jsonb_build_object('claims', new_claims)`), while the "Add admin role"
example and the RBAC guide instead mutate `event` and `return event`. Both are valid because the returned object is
read for its `claims` key, and `event` already has one. Returning `event` is the safer idiom: it is impossible to
accidentally drop a required claim. Both examples are on the pages cited above.

**Required claims must survive.** These cannot be removed from the returned `claims` object:

> Required Claims: `iss`, `aud`, `exp`, `iat`, `sub`, `role`, `aal`, `session_id`, `email`, `phone`, `is_anonymous`
>
> Optional Claims: `jti`, `nbf`, `app_metadata`, `user_metadata`, `amr`
>
> "Claims returned must conform to our specification. Supabase Auth will check for these claims after the hook is run
> and return an error if they are not present."

Source: <https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook>

Copying `event->'claims'` and adding to it (rather than rebuilding from scratch) satisfies this automatically.

### Which role it executes as, and the grants

The hook runs as **`supabase_auth_admin`**:

> "Allow the `supabase_auth_admin` role to execute the function. The `supabase_auth_admin` role is the Postgres role
> that is used by Supabase Auth to make requests to your database."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

`supabase_auth_admin` is documented as "Used by the Auth middleware to connect to the database and run migration.
Access is scoped to the `auth` schema."
(Source: <https://supabase.com/docs/guides/database/postgres/roles>) — which is why the `public` schema grant below
is mandatory:

> "The `supabase_auth_admin` role does not have permissions to the `public` schema."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

Required grants, verbatim from the docs:

```sql
-- Grant access to function to supabase_auth_admin
grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

-- Grant access to schema to supabase_auth_admin
grant usage on schema public to supabase_auth_admin;

-- Revoke function permissions from authenticated, anon and public
revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;
```

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

**Do not use `security definer`.** The docs contradict themselves on this page, and the stricter guidance is the one
to follow:

> "For security, we recommend against the use the `security definer` tag. The `security definer` tag specifies that
> the function is to be executed with the privileges of the user that owns it. When a function is created via the
> Supabase dashboard with the tag, it will have the extensive permissions of the `postgres` role which make it easier
> for undesirable actions to occur.
>
> We recommend that you do not use any tag and explicitly grant permissions to `supabase_auth_admin` as described above."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

(The same page's "Security model" tab says "Alternatively, you can create your Postgres function via the dashboard with
the `security definer` tag." Treat that as legacy advice. Flagged as a docs inconsistency.)

The consequence of *not* using `security definer` is that the hook is subject to RLS on any table it reads — which is
exactly why the role table needs an explicit policy for `supabase_auth_admin`. See [§6](#6-securing-the-role-table).

### Are the grants applied automatically?

> "When you configure a Postgres function as a hook, Supabase will automatically apply the following grants to the
> function..."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

This is stated for the dashboard flow. I could **not** confirm that the same auto-granting happens when the hook is
enabled via `config.toml` / the Management API. Write the grants into the migration explicitly regardless — they are
idempotent and cost nothing.

### Error handling and timeout

Return an error object to reject token issuance:

```json
{
  "error": {
    "http_code": 429,
    "message": "You can only verify a factor once every 10 seconds."
  }
}
```

> "`http_code` A number indicating the HTTP code to be returned. If not set, the code is HTTP 500 Internal Server
> Error. `message` A message to be returned in the HTTP response. Required."
>
> "Errors returned from a Postgres Hook are not retry-able. When an error is returned, the error is propagated from
> the hook to Supabase Auth and translated into an HTTP error which is returned to your application. Supabase Auth
> will only take into account the error and disregard the rest of the payload."

Postgres hooks get **2 seconds** to complete, and run inside a transaction:

> "Postgres Hooks have 2 seconds to complete processing while HTTP Hooks should complete in 5 seconds. Both HTTP Hooks
> and Postgres Hooks are run in a transaction do limit the duration of execution to avoid delays in authentication
> process."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

A single indexed primary-key lookup is nowhere near 2 seconds, so this is not a constraint for us — but it does mean
the hook must never do anything slow or network-bound.

**SQL Editor gotcha:**

> "If you're using the Supabase SQL Editor, there's an issue when using the `?` (Does the string exist as a top-level
> key within the JSON value?) operator. Use a direct connection to the database if you need to use it when defining a
> function."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

Our hook (below) does not use `?`, so this does not bite us — but it would if we adopted the docs' "Minimal JWT" example.

### Plan availability

Custom Access Token is available on **Free and Pro**. (MFA Verification and Password Verification hooks are
Teams/Enterprise only.) Source: <https://supabase.com/docs/guides/auth/auth-hooks>

---

## 2. Configuration: dashboard, `config.toml`, or Management API

### Dashboard

> "In the dashboard, navigate to `Authentication > Hooks` and select the appropriate function type (SQL or HTTP) from
> the dropdown menu."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

The RBAC guide adds: "Users must navigate to the Authentication > Hooks section in the dashboard and select the
appropriate Postgres function from the dropdown menu."
(Source: <https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac>)

### `config.toml` — confirmed, and materially better

`config.toml` supports auth hooks directly:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

The URI format for a Postgres function is `pg-functions://postgres/<schema>/<function_name>`.

> "Modify the `auth.hook.<hook_name>` field and set `uri` to a value of `pg-functions://postgres/<schema>/<function_name>`"

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

Config reference for the keys:

| Key | Default | Meaning |
| --- | --- | --- |
| `auth.hook.<name>.enabled` | `false` | Enable Auth Hook |
| `auth.hook.<name>.uri` | none | Endpoint to invoke; HTTP(S) or `pg-functions://` |
| `auth.hook.<name>.secrets` | none | HTTP hooks only |

Source: <https://supabase.com/docs/guides/local-development/cli/config>

**This is not local-only.** `supabase config push` "Updates the configurations of a linked Supabase project with the
local `supabase/config.toml` file."
(Source: <https://supabase.com/docs/reference/cli/supabase-config-push>)

The CLI reference docs do not enumerate which sections are pushed, so I confirmed it in the CLI source. The
config-sync module for auth explicitly reads `hook.custom_access_token` from `config.toml` and maps it onto the
Management API fields `hook_custom_access_token_enabled` / `hook_custom_access_token_uri` /
`hook_custom_access_token_secrets`:

- `supabase/cli` → `apps/cli/src/legacy/commands/config/push/config-sync/auth.sync.ts`
  (<https://github.com/supabase/cli/blob/main/apps/cli/src/legacy/commands/config/push/config-sync/auth.sync.ts>)

**Gotcha found in that source:** hooks are gated on presence, not on value —
`// Hooks — Go gates each on 'hook.<name> != nil'; absent in raw config → skip.` Omitting the
`[auth.hook.custom_access_token]` block from `config.toml` does **not** disable a hook that is already enabled on the
remote; it just leaves it alone. To turn a hook off you must write `enabled = false` explicitly.

### Management API

`PATCH /v1/projects/{ref}/config/auth` accepts:

- `hook_custom_access_token_enabled` (boolean, optional)
- `hook_custom_access_token_uri` (string, optional)
- `hook_custom_access_token_secrets` (string, optional)
- `jwt_exp` (integer, optional)

Source: <https://supabase.com/docs/reference/api/v1-update-auth-service-config>

### Recommendation

**Use `config.toml` + `supabase config push`, and document the dashboard route in the README only as the manual
fallback.** Reasons:

1. It is version-controlled and reviewable, so the environment reproduces from the repo.
2. It works identically for local `supabase start` and for the linked project `wdntcehfaallkiwrvmeu`.
3. It removes the ADR's stated consequence that the hook "cannot be captured in a migration" — strictly true (it is
   not a migration) but misleading (it *is* config-as-code).

README setup instructions should therefore be, in order:

1. Apply the migration containing the role enum, `user_roles` table, RLS, grants, hook function, and default-role
   trigger.
2. Ensure `supabase/config.toml` contains the `[auth.hook.custom_access_token]` block above.
3. `supabase link --project-ref wdntcehfaallkiwrvmeu` then `supabase config push`.
4. Verify in `Authentication > Hooks` that "Custom Access Token" shows the Postgres function as enabled.
5. **Sign out and back in** — existing sessions keep their old token until refresh ([§5](#5-refresh-and-staleness)).

Step 1 must precede step 3: enabling a hook that points at a non-existent function would break token issuance.

---

## 3. Reading the claim client- and server-side

### The claim structure

The hook writes a top-level claim. Using the shape from Supabase's own RBAC guide, the decoded access token becomes:

```json
{
  "iss": "https://wdntcehfaallkiwrvmeu.supabase.co/auth/v1",
  "sub": "8ccaa7af-909f-44e7-84cb-67cdccb56be6",
  "aud": "authenticated",
  "exp": 1715690221,
  "iat": 1715686621,
  "role": "authenticated",
  "aal": "aal1",
  "session_id": "4b938a09-5372-4177-a314-cfa292099ea2",
  "email": "student@example.com",
  "phone": "",
  "is_anonymous": false,
  "app_metadata": {},
  "user_metadata": {},
  "user_role": "student"
}
```

Note that `role` (`authenticated` / `anon` — the *Postgres* role) and `user_role` (our application role) are different
claims. Do not overload `role`: it is a required claim that PostgREST uses to pick the Postgres role, and the JSON
Schema in the docs constrains it to `["anon", "authenticated"]`.
(Source: <https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook>)

### How it surfaces through `getClaims()`

`getClaims()` returns the **entire decoded JWT payload** under `data.claims`, so any custom claim appears at the top
level of that object. Confirmed in the installed source:

```js
// node_modules/@supabase/auth-js/dist/module/GoTrueClient.js
async getClaims(jwt, options = {}) {
    let token = jwt;
    if (!token) {
        const { data, error } = await this.getSession();
        if (error || !data.session) { return this._returnResult({ data: null, error }); }
        token = data.session.access_token;
    }
    const { header, payload, signature, raw: { header: rawHeader, payload: rawPayload } } = decodeJWT(token);
    ...
    return { data: { claims: payload, header, signature }, error: null };
}
```

The return type is `{ data: { claims, header, signature } | null, error }`. `claims` is typed `JwtPayload`, which
extends `RequiredClaims` and carries an index signature specifically so that hook-added claims typecheck:

```ts
// node_modules/@supabase/auth-js/dist/module/lib/types.d.ts
/**
 * Required claims (iss, aud, exp, iat, sub, role, aal, session_id) are inherited from RequiredClaims.
 * All other claims are optional as they can be customized via Custom Access Token Hooks.
 */
export interface JwtPayload extends RequiredClaims {
    email?: string; phone?: string; is_anonymous?: boolean; jti?: string; nbf?: number;
    app_metadata?: UserAppMetadata; user_metadata?: UserMetadata;
    amr?: AMREntry[] | string[]; ref?: string;
    [key: string]: any;
}
```

The library's own JSDoc confirms this is the intended path for hook claims:

> "The returned claims can be customized per project using the Custom Access Token Hook."

Source: `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`, `getClaims` JSDoc; and
<https://supabase.com/docs/guides/auth/jwt-fields>

Practical note: because of the `[key: string]: any` index signature, `data.claims.user_role` is typed `any`. Narrow it
at the boundary with a Zod schema (this project already depends on Zod) rather than a bare `as` cast.

### Is the claim trustworthy?

Yes — `getClaims()` verifies the signature, which is exactly why it must be used instead of `getSession()`:

> "If your project is using asymmetric JWT signing keys, then the verification is done locally usually without a
> network request using the WebCrypto API."
>
> "If your project is using a symmetric secret to sign the JWT, it always sends a request similar to `getUser()` to
> validate the JWT at the server before returning the decoded token. This is also used if the WebCrypto API is not
> available in the environment."

By contrast, `getSession()` carries an explicit warning:

> "**IMPORTANT SECURITY NOTICE:** If using an insecure storage medium, such as cookies or request headers, the user
> object returned by this function **must not be trusted**. Always verify the JWT using `getClaims()` or your own JWT
> verification library to securely establish the user's identity and access."

Source: `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js` (`getClaims` and `getSession` JSDoc);
<https://supabase.com/docs/guides/auth/signing-keys>

**Cost implication for ADR-0001.** The ADR says the role "arrives with the token at zero query cost". That is right
about the *database*. It is only zero *network* cost if this project has asymmetric JWT signing keys enabled — with
the legacy shared secret, `getClaims()` falls back to a `getUser()` round-trip to the Auth server on every call,
including the one in `proxy.ts` on every request. Worth verifying for `wdntcehfaallkiwrvmeu`; see
[§9](#9-what-i-could-not-confirm).

### In `lib/supabase/proxy.ts`

The existing code already fetches the claims; the role is one property away:

```ts
const { data } = await supabase.auth.getClaims();
const claims = data?.claims;

// application role stamped by the custom access token hook
const role = claims?.user_role as "student" | "admin" | undefined;
```

The existing "Do not run code between `createServerClient` and `supabase.auth.getClaims()`" comment still applies —
read the role *after* the `getClaims()` call, never by introducing another call before it.

### In a route handler

```ts
// app/api/consultations/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (data.claims.user_role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // RLS enforces the same rule again, authoritatively
  const { data: rows, error: dbError } = await supabase.from("consultations").select("*");
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  return NextResponse.json(rows);
}
```

This is the "checked twice" shape ADR-0001 describes: the handler check gives a clean 403, and RLS is the
authoritative backstop.

### What the RBAC guide says instead (outdated)

The RBAC guide still tells you to decode the token by hand:

> "To retrieve custom claims in JavaScript clients, developers should decode the access token: you will need to decode
> the `access_token` JWT on the auth session." (recommends the `jwt-decode` package)

Source: <https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac>

**Do not follow this.** It predates `getClaims()` and, critically, `jwt-decode` does not verify the signature. This is
a clear case of the version sensitivity the ticket warned about. Use `getClaims()`.

One further note from the same page that *is* still current and worth knowing:

> "The auth hook will only modify the access token JWT but not the auth response."

So the role appears in `getClaims()` output, not in `data.user` from `signInWithPassword`.

---

## 4. Reading the claim inside RLS

### The expression

```sql
(select auth.jwt() ->> 'user_role') = 'admin'
```

`auth.jwt()` "Returns the JWT of the user making the request."
(Source: <https://supabase.com/docs/guides/database/postgres/row-level-security>)

Use `->>` (returns `text`) for a scalar claim, and `->` (returns `jsonb`) when the claim is an object or array — the
docs' own nested example is `select auth.jwt() -> 'app_metadata' -> 'teams'`.

Supabase's RBAC guide reads the claim the same way inside a helper:

```sql
select (auth.jwt() ->> 'user_role')::public.app_role into user_role;
```

Source: <https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac>

### Wrap it in `(select ...)`

> "For performance optimization, wrap this function: `(select auth.uid())` allows Postgres to cache results
> per-statement rather than calling it per-row."

Source: <https://supabase.com/docs/guides/database/postgres/row-level-security>

The same applies to `auth.jwt()`. This matters directly to the ADR's stated reason for choosing a claim over a
`profiles` join — get the `(select ...)` wrapper wrong and you re-introduce per-row cost.

### Always use `TO`

> "Always specify roles using the `TO` operator in policies to prevent unnecessary evaluation for unauthorized roles."

Source: <https://supabase.com/docs/guides/database/postgres/row-level-security>

### Example policies for this app

```sql
alter table public.consultations enable row level security;

-- students see only their own
create policy "students read own consultations"
  on public.consultations
  for select
  to authenticated
  using ( (select auth.uid()) = student_id );

-- admins read everything (permissive policies OR together)
create policy "admins read all consultations"
  on public.consultations
  for select
  to authenticated
  using ( (select auth.jwt() ->> 'user_role') = 'admin' );

-- admins write nothing: no insert/update/delete policy mentions 'admin'
create policy "students insert own consultations"
  on public.consultations
  for insert
  to authenticated
  with check ( (select auth.uid()) = student_id );
```

Because permissive policies are OR-ed, the two SELECT policies give exactly the ADR's model: student sees own, admin
sees all. Because there is no admin-scoped INSERT/UPDATE/DELETE policy, "admin reads every consultation, writes none"
falls out of the schema rather than out of application discipline.

### Does the claim appear on every path? — the important part

**No, and the difference is by design.** What ends up in `auth.jwt()` is whatever JWT PostgREST verified for that
request. I confirmed exactly which token the client sends by reading the installed `supabase-js`:

```js
// node_modules/@supabase/supabase-js/dist/index.mjs
async _getAccessToken() {
    return (await this._getSessionToken()) ?? this.supabaseKey;
}

const fetchWithAuth = (supabaseKey, supabaseUrl, getAccessToken, ...) => async (input, init) => {
    const realToken = await getAccessToken();
    let headers = new HeadersConstructor(init?.headers);
    if (!headers.has("apikey")) headers.set("apikey", supabaseKey);
    if (!headers.has("Authorization")) {
        const bearer = realToken ?? (allowKeyAsBearer ? supabaseKey : null);
        if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    }
    ...
};
```

So:

| Path | `Authorization` header | Postgres role | `auth.jwt() ->> 'user_role'` |
| --- | --- | --- | --- |
| Publishable/anon key **with** a signed-in user | the user's access token | `authenticated` | **present** — the hook ran when this token was minted |
| Publishable/anon key, **no** session | the publishable/anon key itself | `anon` | **NULL** — no user token, so no hook ever ran |
| Secret / `service_role` key | the secret key | `service_role` | **NULL**, and irrelevant — this role bypasses RLS entirely |

This is the answer to the ticket's "does the claim appear for BOTH paths" question: **the anon-key-with-user-JWT path
is precisely the path where the claim does appear.** The claim is absent only when there is no user, or when the
request is made with the service role — and the service role bypasses RLS, so no policy is consulted at all.

Supporting sources:

- PostgREST stores the verified JWT payload in the `request.jwt.claims` GUC, readable as
  `current_setting('request.jwt.claims', true)`. "If the client included no JWT (or one without a role claim) then
  PostgREST switches into the anonymous role." (<https://docs.postgrest.org/en/v12/references/auth.html>)
- Publishable keys map to the `anon` role for unauthenticated users or the `authenticated` role for users signed in
  via Supabase Auth; secret keys use "the built-in `service_role` Postgres role" with full data access and RLS bypass.
  (<https://supabase.com/docs/guides/api/api-keys>)
- `service_role` is listed as a role that bypasses Row Level Security.
  (<https://supabase.com/docs/guides/database/postgres/roles>)

**Corollary for the ADR's "checked twice" claim:** the RLS backstop only exists on the anon/publishable-key path. Any
code path that uses the secret key skips RLS entirely and is protected by the route-handler check *alone*. If we
introduce a secret-key client anywhere, the second line of defence silently disappears. Worth stating in the ADR.

### What happens when the claim is absent

`->>` on a key that is not present yields SQL `NULL`, so `NULL = 'admin'` evaluates to `NULL`, not `false`. PostgreSQL
treats that as a denial:

> "When a `USING` expression returns true for a given row then that row is visible to the user, while if false or null
> is returned then the row is not visible."
>
> "When a `WITH CHECK` expression returns true for a row then that row is inserted or updated, while if false or null
> is returned then an error occurs."
>
> "If row-level security is enabled for a table, but no applicable policies exist, a 'default deny' policy is assumed,
> so that no rows will be visible or updatable."

Source: <https://www.postgresql.org/docs/current/sql-createpolicy.html>

**So a missing claim fails closed.** That is the behaviour we want, but only for positively-phrased predicates. Two
traps:

1. **Never phrase a policy negatively.** `using ( (select auth.jwt() ->> 'user_role') <> 'admin' )` is `NULL` when the
   claim is missing, so it denies — which happens to be safe here, but `using ( not (...) )` reasoning is fragile and
   easy to get backwards. Write `= 'admin'`, not `<> `.
2. **`coalesce` only where you mean it.** `coalesce(auth.jwt() ->> 'user_role', 'student')` would silently grant the
   default role to a *keyless* request. Do not default the role inside a policy; default it in the data
   ([§7](#7-defaulting-new-users)).

There is also a JSON-vs-SQL-NULL wrinkle. The Supabase RBAC hook writes `jsonb_set(claims, '{user_role}', 'null')`
when a user has no row — that stores a **JSON null**, not an absent key. `->> ` on a JSON null also returns SQL `NULL`,
so the policies above still fail closed. But `claims ? 'user_role'` would return **true**, and in JavaScript
`data.claims.user_role` is `null` rather than `undefined`. Compare against `'admin'` explicitly; do not truth-test.

### Staleness caveat, stated by Supabase

> "Keep in mind that a JWT is not always 'fresh'. In the example above, even if you remove a user from a team and
> update the `app_metadata` field, that will not be reflected using `auth.jwt()` until the user's JWT is refreshed."

Source: <https://supabase.com/docs/guides/database/postgres/row-level-security>

---

## 5. Refresh and staleness

### Access token TTL

**Default 3600 seconds (1 hour).** Maximum 604,800 seconds (one week).

> "Most applications should use the default expiration time of 1 hour."
>
> "Setting a value over 1 hour is generally discouraged for security reasons" — and values under 5 minutes are
> discouraged because of server load, clock skew, and mid-request expiry.

Sources: <https://supabase.com/docs/guides/auth/sessions>,
<https://supabase.com/docs/guides/local-development/cli/config> (`auth.jwt_expiry`, default `3600`, max `604800`).
Settable as `jwt_exp` via the Management API (<https://supabase.com/docs/reference/api/v1-update-auth-service-config>).

### When a role change takes effect

**On the next token mint.** `token_refresh` is a documented `authentication_method` value
(<https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook>), which confirms the hook re-runs on every
refresh — not only at sign-in. So the sequence is: update `user_roles` → nothing changes for that user → next refresh
mints a token carrying the new role → both the route-handler check and RLS see it simultaneously.

The RBAC guide states the limit plainly: "The auth hook will only modify the access token JWT but not the auth
response," and the RLS guide adds that a change "will not be reflected using `auth.jwt()` until the user's JWT is
refreshed."

### How long a stale role can persist

**Up to one full `jwt_expiry` window — an hour on defaults.** Concretely: a token minted at `T` is valid until
`T + 3600`. A role changed at `T + 10` is invisible to that session until it refreshes, which happens shortly before
expiry.

The client refreshes proactively, with a 90-second margin, confirmed from the installed constants:

```js
// node_modules/@supabase/auth-js/dist/module/lib/constants.js
export const AUTO_REFRESH_TICK_DURATION_MS = 30 * 1000;
export const AUTO_REFRESH_TICK_THRESHOLD = 3;
export const EXPIRY_MARGIN_MS = AUTO_REFRESH_TICK_THRESHOLD * AUTO_REFRESH_TICK_DURATION_MS; // 90_000
```

> "Supabase client libraries always try to refresh the session ahead of time."

Source: <https://supabase.com/docs/guides/auth/sessions>

**Server-side there is no background timer.** `@supabase/ssr` explicitly disables it:

```js
// node_modules/@supabase/ssr/dist/main/createServerClient.js
auth: {
    ...
    flowType: "pkce",
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: true,
    ...
}
```

So on the server the refresh is *demand-driven*: it happens when something calls `getSession()` (or `getClaims()`,
which calls `getSession()` internally). Per the `getClaims` JSDoc: "If the user's access token is about to expire when
calling this function, the user's session will first be refreshed before validating the JWT." And per `getSession`:
"If the session's access token is expired or is about to expire, this method will use the refresh token to refresh the
session."

**This is why `proxy.ts` calling `getClaims()` on every request matters.** It is not only a session-liveness guard —
it is the thing that drives token rotation, and therefore the thing that bounds role staleness. The existing warning
comment in `lib/supabase/proxy.ts` ("IMPORTANT: If you remove getClaims() ... your users may be randomly logged out")
now has a second reason behind it.

### What forces a refresh

Ranked by how forceful they are:

1. **`supabase.auth.refreshSession()`** — "Returns a new session, regardless of expiry status."
   (<https://supabase.com/docs/reference/javascript/auth-refreshsession>) This is the explicit forced-refresh path
   ADR-0001 says would be needed if roles ever became user-editable. Note it must be called on a client that can
   persist the rotated cookies — in Next.js that means a route handler or the proxy, not a Server Component.
2. **Sign out and sign in again.** "When a user signs out, the sessions affected by the logout are removed from the
   database entirely." (<https://supabase.com/docs/guides/auth/sessions>) This is the blunt instrument and the one to
   put in the README for seeding roles.
3. **Waiting for the proactive refresh** — within 90 s of expiry, on the next `getClaims()`/`getSession()` call.

Refresh token mechanics worth knowing:

> "Refresh tokens never expire but can only be used once."
>
> "A refresh token can be used more than once within a defined reuse interval. By default this is 10 seconds."
>
> Unauthorized reuse: "the whole session is regarded as terminated and all refresh tokens belonging to it are marked
> as revoked."

Source: <https://supabase.com/docs/guides/auth/sessions>; `auth.refresh_token_reuse_interval` default `10`,
`auth.enable_refresh_token_rotation` default `true`
(<https://supabase.com/docs/guides/local-development/cli/config>).

### Practical consequence

ADR-0001's position — roles are seeded and static, so hour-scale staleness is acceptable — holds. But the README must
say **"sign out and back in after changing a role"**, because otherwise the first person to seed an admin will
reasonably conclude the hook is broken.

There is no supported way to invalidate a *specific* user's access token before it expires other than terminating the
session. If sub-hour revocation ever becomes a requirement, the claim-only design is the wrong design and the ADR
should be revisited.

---

## 6. Securing the role table — the security crux

The framing that makes this tractable, from Supabase's own API-hardening guide:

> "Grants control whether a role can access an object. RLS controls which rows the role can access."

Source: <https://supabase.com/docs/guides/api/securing-your-api>

Both are needed. Grants are the outer gate; RLS is the inner one. And RLS is not optional, because the `public` schema
is exposed through the Data API:

> "Tables and views exposed through the Data API without RLS can be accessed by any role with matching grants."

Source: <https://supabase.com/docs/guides/api/securing-your-api>

### The threat

If a user can `UPDATE public.user_roles SET role = 'admin' WHERE user_id = auth.uid()`, the entire scheme collapses —
the hook will faithfully stamp `admin` into their next token and RLS will faithfully honour it. **The hook is only as
trustworthy as the table it reads.** Every control below exists to make that write impossible.

### The migration

```sql
create type public.app_role as enum ('student', 'admin');

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role    public.app_role not null default 'student'
);

comment on table public.user_roles is
  'System of record for application roles. Read by the custom access token hook only. Never writable via the Data API.';

-- INNER GATE: RLS on, default-deny
alter table public.user_roles enable row level security;

-- OUTER GATE: the Data API roles have no privileges on this table at all
revoke all on table public.user_roles from authenticated, anon, public;

-- The auth server needs full access to read the table during token minting
grant all on table public.user_roles to supabase_auth_admin;

-- The ONLY policy: the auth server may SELECT. No INSERT/UPDATE/DELETE policy exists for anyone.
create policy "auth admin can read user roles"
  on public.user_roles
  as permissive for select
  to supabase_auth_admin
  using (true);
```

This mirrors Supabase's own RBAC guide, which shows exactly this grant/revoke/policy triple:

```sql
grant all
  on table public.user_roles
to supabase_auth_admin;

revoke all
  on table public.user_roles
  from authenticated, anon, public;

create policy "Allow auth admin to read user roles" ON public.user_roles
as permissive for select
to supabase_auth_admin
using (true);
```

Source: <https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac>

### Gap in the official guide — fix it

**The official RBAC guide never enables RLS on `user_roles`.** I checked the page's full SQL twice; it creates a policy
but no `alter table ... enable row level security`. A `create policy` on a table without RLS enabled is inert — the
policy is stored and does nothing.

On its own that guide is still *safe*, because the `revoke all` closes the outer gate. But it is one careless
`grant select on public.user_roles to authenticated` — or one Supabase default-privileges change — away from being
wide open, with a policy sitting there giving false assurance. **Include `alter table public.user_roles enable row
level security;` in our migration.** With RLS on and only a `supabase_auth_admin` SELECT policy, the table is
default-deny for every other role even if grants are later loosened by accident.

### Why the hook still works with RLS enabled

Because we deliberately did **not** use `security definer` ([§1](#1-declaring-the-hook)), the hook body executes as
`supabase_auth_admin`, which is not the table owner and has no `BYPASSRLS`. It therefore needs the explicit SELECT
policy above. The docs state this requirement directly:

> "You will need to alter your row-level security (RLS) policies to allow the `supabase_auth_admin` role to access
> tables that you have RLS policies on."

Source: <https://supabase.com/docs/guides/auth/auth-hooks>

If the policy is missing, the hook's `select` returns zero rows, `user_role` is `null`, and every user silently gets a
null role. That failure is quiet and looks exactly like "the hook isn't running" — worth a note in the README.

### Escalation vectors, and how each is closed

| Vector | Closed by |
| --- | --- |
| User writes their own row via the Data API | `revoke all ... from authenticated, anon, public` (no privilege) **and** RLS default-deny (no write policy exists for `authenticated`) |
| User reads the table to enumerate admins | Same two controls — there is no SELECT policy for `authenticated` either |
| User calls the hook directly to mint claims | `revoke execute on function public.custom_access_token_hook from authenticated, anon, public` (<https://supabase.com/docs/guides/auth/auth-hooks>) |
| Hook runs with `postgres` privileges and does something unintended | No `security definer` tag — Supabase explicitly recommends against it here |
| **Role sourced from user-editable metadata** | Do not put the role in `user_metadata` / `raw_user_meta_data`. See below. |
| Future `grant` accidentally re-opens the table | RLS enabled with no applicable policy → "default deny" (<https://www.postgresql.org/docs/current/sql-createpolicy.html>) |
| A `service_role` code path writes the table | Nothing in the database stops this — `service_role` bypasses RLS. Keep the secret key out of the app; see [§4](#4-reading-the-claim-inside-rls) |

### The single biggest trap: metadata

This is worth stating loudly because it is the most common way this design is got wrong:

> "**raw_user_meta_data** can be updated by the authenticated user using the `supabase.auth.update()` function. It is
> not a good place to store authorization data."
>
> "**raw_app_meta_data** cannot be updated by the user, so it's a good place to store authorization data."
>
> "Never rely on user_metadata for authorization decisions, as users can modify it."

Source: <https://supabase.com/docs/guides/database/postgres/row-level-security>

Note that the docs' own "Add admin role" example writes to `app_metadata` (`{app_metadata, admin}`), which is
acceptable, whereas the RBAC guide uses a dedicated top-level `user_role` claim. **Prefer the dedicated top-level
claim**: `app_metadata` is server-controlled but is a shared namespace that other Supabase features also write to, and
a top-level claim keeps the RLS predicate short and unambiguous. Either way, the source of truth must be our
`user_roles` table, never anything the user can `updateUser()` into.

### Optional belt-and-braces

If you want the table to be unreachable even in principle from the Data API, move it out of the exposed schema —
Supabase recommends "a dedicated schema" to control API surface
(<https://supabase.com/docs/guides/api/securing-your-api>). This would mean granting `usage` on that schema to
`supabase_auth_admin` instead of `public`. For a two-role mini-LMS this is probably over-engineering; the grants above
are sufficient. Recorded as an option, not a recommendation.

---

## 7. Defaulting new users

### Recommended shape

Supabase's documented pattern is an `after insert` trigger on `auth.users`:

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (new.id, new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Source: <https://supabase.com/docs/guides/auth/managing-user-data>

### Adapted for this project

```sql
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

create trigger on_auth_user_created_set_role
  after insert on auth.users
  for each row execute function public.handle_new_user_role();
```

### Pitfalls

1. **A failing trigger blocks signup.** "If the trigger fails, it could block signups, so test your code thoroughly."
   (<https://supabase.com/docs/guides/auth/managing-user-data>) The user-facing symptom is a generic
   `Database error saving new user`, which gives you nothing to debug from. `on conflict (user_id) do nothing` makes
   the insert idempotent so a retried or duplicated signup cannot wedge the flow.

2. **`security definer` is required *here*, unlike the hook.** These pull in opposite directions and the distinction
   is easy to get wrong:

   - The **hook** should be *invoker* rights, so it runs as `supabase_auth_admin` and is subject to the SELECT policy
     we wrote for it. Supabase "recommend[s] against the use the `security definer` tag" for hooks
     (<https://supabase.com/docs/guides/auth/auth-hooks>).
   - The **trigger** fires inside the signup transaction, which is also executing as `supabase_auth_admin` — but we
     enabled RLS on `user_roles` with **no INSERT policy for anyone**. An invoker-rights trigger would be blocked by
     default-deny. `security definer` makes it run as the function owner (`postgres`), which owns the table and
     therefore bypasses RLS.

   The alternative — adding an INSERT policy for `supabase_auth_admin` — widens the hook's own access for no benefit.
   Prefer `security definer` on the trigger, and keep the table's only policy read-only.

3. **`set search_path = ''` forces full qualification.** Every identifier must be schema-qualified, including the enum
   cast: write `'student'::public.app_role`, not `'student'::app_role`. Supabase uses `security definer set
   search_path = ''` precisely to "restrict execution context and prevent privilege escalation"
   (<https://supabase.com/docs/guides/auth/managing-user-data>). Omitting it on a `security definer` function owned by
   `postgres` is a genuine privilege-escalation risk.

4. **The trigger does not backfill.** It fires on insert only, so users who already exist in `auth.users` get no row —
   and therefore a `null` claim. Seed them in the same migration:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'student'::public.app_role from auth.users
   on conflict (user_id) do nothing;
   ```

5. **The column default is not enough on its own.** `role default 'student'` only applies to rows that exist. A user
   with no row at all gets `null` from the hook. The trigger is what guarantees the row.

6. **A trigger on `auth.users` couples us to a Supabase-managed schema.** We do not own `auth.users` and cannot migrate
   it. This is the documented pattern and is widely used, but it is a dependency worth acknowledging. The
   **Before User Created** hook (Free/Pro, <https://supabase.com/docs/guides/auth/auth-hooks>) is a supported
   alternative that avoids touching `auth` — not needed here, but the escape hatch if the trigger ever causes trouble.

---

## 8. Trust semantics: `getClaims()` vs `getUser()` vs `getSession()`

Added for the parallel Next.js caching research on issue #2, which needs to know whether `getClaims()` can be the
authoritative auth check and whether it can run inside a cached scope. Short answer: **`getClaims()` is the correct
default and Supabase now mandates it for exactly this purpose — but it is not a pure function and must never run
inside a cached scope.**

### The headline guidance, verbatim

From Supabase's own Next.js server-side auth guide:

> "*Never* trust `supabase.auth.getSession()` inside server code such as Proxy. It isn't guaranteed to revalidate the
> Auth token."
>
> "It's safe to trust `getClaims()` because it validates the JWT signature against the project's published public keys
> every time."
>
> "Use `getClaims` to protect pages and user data. It reads the access token from storage and verifies it."
>
> "Always use `supabase.auth.getClaims()` to protect pages and user data."

Source: <https://supabase.com/docs/guides/auth/server-side/nextjs>

That answers the ticket's headline question directly: **yes, `getClaims()` is safe as the authoritative authentication
check in a route handler.** The rest of this section establishes *why*, and where the edges are.

### Local vs remote verification — the exact branch

From the installed implementation:

```js
// node_modules/@supabase/auth-js/dist/module/GoTrueClient.js — getClaims()
const { header, payload, signature, raw: { header: rawHeader, payload: rawPayload } } = decodeJWT(token);

if (!options?.allowExpired) {
    validateExp(payload.exp);   // throws AuthInvalidJwtError when expired
}

const signingKey =
    !header.alg ||
    header.alg.startsWith('HS') ||
    !header.kid ||
    !('crypto' in globalThis && 'subtle' in globalThis.crypto)
        ? null
        : await this.fetchJwk(header.kid, options?.keys ? { keys: options.keys } : options?.jwks);

// If symmetric algorithm or WebCrypto API is unavailable, fallback to getUser()
if (!signingKey) {
    const { error } = await this.getUser(token);
    if (error) { throw error; }
    // getUser succeeds so the claims in the JWT can be trusted
    return { data: { claims: payload, header, signature }, error: null };
}

const algorithm = getAlgorithm(header.alg);
const publicKey = await crypto.subtle.importKey('jwk', signingKey, algorithm, true, ['verify']);
const isValid = await crypto.subtle.verify(algorithm, publicKey, signature,
    stringToUint8Array(`${rawHeader}.${rawPayload}`));
if (!isValid) { throw new AuthInvalidJwtError('Invalid JWT signature'); }

return { data: { claims: payload, header, signature }, error: null };
```

So it verifies **locally** unless one of exactly three conditions holds, each of which forces the network fallback:

1. `header.alg` is missing, or starts with `HS` — i.e. the project signs with the **legacy symmetric shared secret**.
2. `header.kid` is missing.
3. **WebCrypto is unavailable** (`globalThis.crypto.subtle` undefined).

In every one of those cases it delegates to `getUser(token)`, which is a network call — and only returns the claims
if that call succeeds. The library's own comment says it plainly: *"getUser succeeds so the claims in the JWT can be
trusted"*. **There is no path through `getClaims()` that returns unverified claims.** That is the crux.

The docs agree:

> "If your project is using asymmetric JWT signing keys, then the verification is done locally usually without a
> network request using the WebCrypto API."
>
> "If your project is using a symmetric secret to sign the JWT, it always sends a request similar to `getUser()` to
> validate the JWT at the server before returning the decoded token. This is also used if the WebCrypto API is not
> available in the environment. Make sure you polyfill it in such situations."
>
> "A network request is sent to your project's JWT signing key discovery endpoint
> `https://project-id.supabase.co/auth/v1/.well-known/jwks.json`, which is cached locally. If your environment is
> ephemeral, such as a Lambda function that is destroyed after every request, a network request will be sent for each
> new invocation."

Source: `getClaims` JSDoc in `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`;
<https://supabase.com/docs/reference/javascript/auth-getclaims>

### "Local" still means sometimes-networked

The JWKS cache is **in-memory, per client instance**, with a 10-minute TTL:

```js
// node_modules/@supabase/auth-js/dist/module/lib/constants.js
export const JWKS_TTL = 10 * 60 * 1000; // 10 minutes
```

```js
// GoTrueClient.js — fetchJwk()
jwk = this.jwks.keys.find((key) => key.kid === kid);
if (jwk && this.jwks_cached_at + JWKS_TTL > now) { return jwk; }
const { data, error } = await _request(this.fetch, 'GET', `${this.url}/.well-known/jwks.json`, { headers: this.headers });
```

This matters a great deal for this project, because both `lib/supabase/server.ts` and `lib/supabase/proxy.ts` carry
the comment *"Always create a new client within each function"* — a fresh client per request means a **cold JWKS cache
per request**. The mitigating factors: Supabase serves the endpoint through a CDN ("The endpoint is cached by the
Supabase Edge for 10 minutes", <https://supabase.com/docs/guides/auth/jwts>), and the library notes that "Supabase
provides a network-edge cache providing fast responses for these situations". There is also a documented escape hatch —
`getClaims()` accepts `options.jwks` / `options.keys` so a pre-fetched key set can be passed in, avoiding the fetch
entirely (visible in the branch above; see <https://supabase.com/docs/reference/javascript/auth-getclaims>).

The `@supabase/supabase-js` source notes that clients sharing a storage key share the JWKS cache:

> "the same JWKS cache, significantly speeding up getClaims() with asymmetric [keys]"

Source: `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`

**Practical consequence for issue #2:** `getClaims()` is *not* a pure local computation. It can issue an HTTP request
(JWKS fetch, or a full `getUser()` round-trip on a symmetric project), and — because it calls `getSession()`
internally — it can also **rotate the session and write refreshed auth cookies** ([§5](#5-refresh-and-staleness)).
Both properties make it illegal inside a cached scope. Keep it in the proxy and in route handlers, never behind a
cache boundary.

### What `getUser()` does differently

```js
// GoTrueClient.js — _getUser()
return await _request(this.fetch, 'GET', `${this.url}/user`, {
    headers: this.headers, jwt: data.session?.access_token, xform: _userResponse,
});
```

Unconditionally a network call, on every invocation. Its JSDoc:

> "Gets the current user details if there is an existing session. This method performs a network request to the
> Supabase Auth server, so the returned value is authentic and can be used to base authorization rules on."
>
> "This method fetches the user object from the database instead of local session."
>
> "Should always be used when checking for user authorization on the server."

Source: `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`

**Docs inconsistency, flagged.** That last line ("Should always be used…") predates `getClaims()` and now conflicts
with the Next.js guide's "Always use `supabase.auth.getClaims()`". The same file's `getSession` JSDoc resolves it in
favour of the newer advice: *"Since the introduction of asymmetric JWT signing keys, this method is considered
low-level and we encourage you to use `getClaims()` or `getUser()` instead."* Treat `getClaims()` as current and the
`getUser` JSDoc line as stale — but note I am reading intent from a version conflict, not from a dated changelog.

### The spectrum

| | What it reads | Verified? | Network | What it actually proves |
| --- | --- | --- | --- | --- |
| `getSession()` | cookies / storage | **No** | none (unless refreshing) | Nothing. A forged cookie passes. |
| `getClaims()` | the access token | **Yes** — signature + `exp` | JWKS fetch on cache miss; full `getUser()` on symmetric projects | The token was minted by *this* project's Auth server, is untampered, and is unexpired |
| `getUser()` | the access token | Yes, server-side | **always** | All of the above, **plus** the session is still live right now |

`getSession()` is the one with the standing warning, and it is warranted — the library actively wraps the returned
user in an `insecureUserWarningProxy` to nag about it (visible in `GoTrueClient.js`). **`getClaims()` is categorically
different from `getSession()`**, not a middle ground: it is cryptographically authoritative. The one thing it does not
prove is session liveness.

Has the guidance changed with asymmetric signing keys? Yes — that is exactly what changed. Before them, local
verification was impossible without distributing the shared secret, so `getUser()` was the only safe server-side
check. Asymmetric keys made local verification possible, `getClaims()` was introduced to do it, and the Next.js guide
now names it the default. The "never trust `getSession()`" warning is unchanged and still applies.

### Revocation — the one real gap

**This part is my analysis, not a doc quote.** I checked: the `getClaims()` reference page does not contain the words
"revoke", "revoked", or "revocation" anywhere. Supabase does not document this trade-off on that page, so what follows
is reasoning from documented mechanics, and should be read as such.

Local signature verification cannot detect server-side revocation. A user who has signed out, been deleted, or been
banned still holds an access token that verifies correctly until `exp`. So:

- **Window:** bounded by `jwt_expiry` — **1 hour on defaults** ([§5](#5-refresh-and-staleness)). Identical bound to
  the role-staleness window, and shrinkable the same way, by lowering `jwt_expiry`.
- **It closes at refresh, not at verify.** Sign-out deletes the session server-side — "When a user signs out, the
  sessions affected by the logout are removed from the database entirely"
  (<https://supabase.com/docs/guides/auth/sessions>) — so the *refresh* attempt fails and no new token is minted.
  `getClaims()` triggers that refresh via `getSession()` when the token is within 90 s of expiry.
- **In the normal cookie flow the risk is small.** `signOut()` also clears the auth cookies in that browser, so there
  is no token left to present. The exposure is a token that was *copied out* before sign-out.
- **Supabase documents the manual check** if you need it: "Check that the `session_id` claim in the JWT corresponds to
  a row in the `auth.sessions` table. If such a row does not exist, it means that the user has logged out."
  (<https://supabase.com/docs/guides/auth/sessions>) Every token carries `session_id` as a required claim
  ([§1](#1-declaring-the-hook)).

**The point that actually settles the design question:** switching route handlers to `getUser()` does *not* close this
window, because **RLS has the same window**. PostgREST authorises on the JWT's signature and expiry; it does not
consult `auth.sessions`. So a revoked-but-unexpired token still passes every policy in [§4](#4-reading-the-claim-inside-rls)
regardless of what the route handler did. Paying a round-trip per request to tighten the application check while the
database backstop stays open buys much less than it appears to.

### Concrete recommendation for this project

**Use `getClaims()` at the top of every route handler, including mutating ones.** It is what Supabase's Next.js guide
mandates, it is cryptographically authoritative, it yields the `user_role` claim in the same call (no second query),
and its revocation window is the same one RLS already has.

```ts
// app/api/consultations/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Claims = z.object({
  sub: z.string().uuid(),
  user_role: z.enum(["student", "admin"]).nullable().catch(null),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  // Authoritative: verifies the JWT signature and expiry. Never getSession() here.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claims = Claims.safeParse(data.claims);
  if (!claims.success) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admins read every consultation and write none.
  if (claims.data.user_role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ... mutate; RLS enforces the same rule authoritatively
}
```

Four rules that fall out of the implementation:

1. **Never `getSession()` for an auth decision on the server.** Only for the raw tokens.
2. **Never pass `allowExpired: true`** in an auth check — it skips `validateExp` and accepts expired tokens.
3. **Never call `getClaims()` inside a cached scope.** It can fetch JWKS and can write rotated session cookies.
4. **Narrow `data.claims` with Zod** rather than casting. `JwtPayload` has a `[key: string]: any` index signature
   ([§3](#3-reading-the-claim-client--and-server-side)), so `claims.user_role` is `any` and a bare `as` cast asserts
   something the type system never checked.

Use `getUser()` **in addition** only where a sub-hour revocation window on an irreversible action is genuinely
unacceptable — and record that it does not tighten the RLS-side window. For a two-role mini-LMS where admins cannot
write at all, it is not warranted. If the window matters, lower `jwt_expiry`; that shrinks both halves at once.

---

## 9. What I could NOT confirm

Listed explicitly, as the ticket requires.

1. **The exact SQL body of `auth.jwt()`.** I searched `supabase/postgres` (init scripts and all migrations),
   `supabase/supabase`, and GitHub code search across the `supabase` org, and could not find its definition in a
   Supabase-owned repository — it appears to be applied during project provisioning rather than checked in. Its
   *behaviour* is documented ("Returns the JWT of the user making the request",
   <https://supabase.com/docs/guides/database/postgres/row-level-security>) and the underlying
   `current_setting('request.jwt.claims', true)` mechanism is documented by PostgREST
   (<https://docs.postgrest.org/en/v12/references/auth.html>). Every conclusion in [§4](#4-reading-the-claim-inside-rls)
   rests on those two documented facts plus PostgreSQL's own `NULL` semantics, not on the unseen function body.

2. **Whether enabling the hook via `config.toml` / Management API auto-applies the function grants.** The docs state
   auto-granting for the dashboard flow only ("When you configure a Postgres function as a hook, Supabase will
   automatically apply the following grants"). Mitigation: write the grants into the migration explicitly. They are
   idempotent.

3. **Whether project `wdntcehfaallkiwrvmeu` uses asymmetric JWT signing keys or the legacy shared secret.** This
   requires dashboard access. It determines whether `getClaims()` verifies locally via WebCrypto (fast, no network) or
   falls back to a `getUser()` round-trip on every request — see [§3](#3-reading-the-claim-client--and-server-side).
   **Check `Authentication > JWT Keys` in the dashboard before relying on the ADR's "zero cost" wording.** Quick check:
   `curl https://wdntcehfaallkiwrvmeu.supabase.co/auth/v1/.well-known/jwks.json` — an RS256/ES256 key means asymmetric.

4. **Whether the docs' stated 2-second Postgres hook timeout is enforced as a statement timeout or a wall-clock budget.**
   The page renders it from a shared config value. Not material for a primary-key lookup.

5. **New-project default for JWT signing keys.** The signing-keys page documents migration from the legacy shared
   secret but does not state what new projects get by default
   (<https://supabase.com/docs/guides/auth/signing-keys>). Folded into item 3.

6. **Docs inconsistency, unresolved.** <https://supabase.com/docs/guides/auth/auth-hooks> both offers `security
   definer` as an option (Security model tab) and recommends against it (Developing tab). I have followed the stricter
   guidance; I could not determine which is more recent.

7. **Supabase does not document the revocation trade-off of `getClaims()`.** I verified that the words "revoke",
   "revoked" and "revocation" do not appear on <https://supabase.com/docs/reference/javascript/auth-getclaims>. The
   revocation analysis in [§8](#8-trust-semantics-getclaims-vs-getuser-vs-getsession) is therefore **my reasoning from
   documented mechanics** (local signature verification + `jwt_expiry` + sign-out deleting sessions), not a Supabase
   claim. Treat it as analysis to be sanity-checked, not as citation.

8. **A second docs inconsistency, unresolved.** The `getUser` JSDoc says "Should always be used when checking for user
   authorization on the server", while <https://supabase.com/docs/guides/auth/server-side/nextjs> says "Always use
   `supabase.auth.getClaims()` to protect pages and user data". I resolved this in favour of `getClaims()` because the
   `getSession` JSDoc in the same file explicitly frames `getClaims()` as post-dating asymmetric signing keys — but
   that is inference from a version conflict, not a dated deprecation notice.

9. **Whether the JWKS network fetch is material in this app's request path.** `@supabase/ssr` clients are created per
   request, so the in-memory JWKS cache (`JWKS_TTL` = 10 minutes) starts cold each time. Supabase says the endpoint is
   edge-cached, but I have not measured the actual per-request latency for `wdntcehfaallkiwrvmeu`. If it proves
   material, `getClaims({ jwks })` accepts a pre-fetched key set.

---

## 10. Impact on ADR-0001

The core decision is sound. Three of the ADR's statements need amending, one of them materially.

### Amend — "cannot be captured in a migration"

> "The auth hook is dashboard configuration, not code, so it cannot be captured in a migration. Setup instructions
> belong in the README or the environment will not reproduce."

Half right. It is genuinely not a migration — but it **is** config-as-code. `supabase/config.toml` supports
`[auth.hook.custom_access_token]`, and `supabase config push` applies it to the linked project via the Management API
(confirmed in the CLI source, [§2](#2-configuration-dashboard-configtoml-or-management-api)). Suggested replacement:

> The auth hook is configuration rather than schema, so it is not a migration — but it is still code. It lives in
> `supabase/config.toml` and is applied with `supabase config push`; the dashboard is only a manual fallback. The
> README documents both, and the ordering constraint that the migration must be applied before the hook is enabled.

### Amend — "at zero query cost"

> "the role arrives with the token at zero query cost"

True of the database, which is the comparison being made against the `profiles`-join option, so the argument stands.
But `getClaims()` is only free of *network* cost when the project uses asymmetric signing keys; with the legacy shared
secret it makes an Auth-server round-trip per call, including once per request in `proxy.ts`. Either confirm
asymmetric keys are enabled (see [§9](#9-what-i-could-not-confirm) item 3) or soften the wording to "at zero database
query cost".

### Add — the second line of defence has a hole

The ADR's rejection of application-layer-only checks rests on RLS being an authoritative backstop. That backstop only
exists on the anon/publishable-key path. Any `service_role` client bypasses RLS entirely
([§4](#4-reading-the-claim-inside-rls)), leaving the route-handler check alone. Worth one sentence in Consequences:
the design assumes the secret key is never used from application code.

### Confirmed as written

- "A role change does not take effect until the user's token refreshes" — correct, bounded by `jwt_expiry`
  (default 1 hour); `refreshSession()` is the forced-refresh path the ADR anticipates.
- "The role table remains the system of record; the claim is only its transport" — correct, and the security of the
  whole scheme reduces to the grants and RLS on that table ([§6](#6-securing-the-role-table)).
- Reading the claim in `proxy.ts`, route handlers, and policies alike — correct, via `getClaims()` and `auth.jwt()`.

### Downstream tickets unblocked

- **Role/hook migration ticket** — the SQL in [§1](#1-declaring-the-hook), [§6](#6-securing-the-role-table) and
  [§7](#7-defaulting-new-users) is complete and can be applied as one migration, in that order. Two additions to the
  official guide: `alter table ... enable row level security` (which the guide omits) and the default-role trigger.
- **RLS policy ticket** — predicate shape and the `(select ...)` wrapper are in [§4](#4-reading-the-claim-inside-rls).
- **README** — setup steps in [§2](#2-configuration-dashboard-configtoml-or-management-api), plus the
  "sign out and back in after a role change" note from [§5](#5-refresh-and-staleness).
- **Route handlers / issue #2 (Next.js caching)** — the canonical handler shape and the four rules (never
  `getSession()`, never `allowExpired`, never inside a cached scope, narrow with Zod) are in
  [§8](#8-trust-semantics-getclaims-vs-getuser-vs-getsession).

---

## Source index

Supabase documentation:

- <https://supabase.com/docs/guides/auth/auth-hooks>
- <https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook>
- <https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>
- <https://supabase.com/docs/guides/database/postgres/roles>
- <https://supabase.com/docs/guides/auth/sessions>
- <https://supabase.com/docs/guides/auth/jwts>
- <https://supabase.com/docs/guides/auth/jwt-fields>
- <https://supabase.com/docs/guides/auth/signing-keys>
- <https://supabase.com/docs/guides/auth/managing-user-data>
- <https://supabase.com/docs/guides/auth/server-side/nextjs>
- <https://supabase.com/docs/reference/javascript/auth-getclaims>
- <https://supabase.com/docs/guides/api/api-keys>
- <https://supabase.com/docs/guides/api/securing-your-api>
- <https://supabase.com/docs/guides/local-development/cli/config>
- <https://supabase.com/docs/reference/cli/supabase-config-push>
- <https://supabase.com/docs/reference/api/v1-update-auth-service-config>
- <https://supabase.com/docs/reference/javascript/auth-refreshsession>

Supabase source:

- <https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-hooks.mdx>
- <https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-hooks/custom-access-token-hook.mdx>
- <https://github.com/supabase/cli/blob/main/apps/cli/src/legacy/commands/config/push/config-sync/auth.sync.ts>

Installed packages (read directly, absolute paths):

- `/Users/oliverbennett/with-supabase-app/node_modules/@supabase/auth-js/dist/module/GoTrueClient.js` — `getClaims`, `getSession`, `getUser`/`_getUser`, `fetchJwk`
- `/Users/oliverbennett/with-supabase-app/node_modules/@supabase/auth-js/dist/module/lib/types.d.ts` — `JwtPayload`, `RequiredClaims`
- `/Users/oliverbennett/with-supabase-app/node_modules/@supabase/auth-js/dist/module/lib/constants.js` — `EXPIRY_MARGIN_MS`, `JWKS_TTL`
- `/Users/oliverbennett/with-supabase-app/node_modules/@supabase/supabase-js/dist/index.mjs` — `fetchWithAuth`, `_getAccessToken`
- `/Users/oliverbennett/with-supabase-app/node_modules/@supabase/ssr/dist/main/createServerClient.js` — `autoRefreshToken: false`

Other primary sources:

- <https://www.postgresql.org/docs/current/sql-createpolicy.html>
- <https://docs.postgrest.org/en/v12/references/auth.html>
