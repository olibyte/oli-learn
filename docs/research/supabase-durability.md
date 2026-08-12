# Supabase durability and blast radius on the free tier

Research for issue #38. The question: what protects this project's data, and who other than its
owner can destroy, flood, corrupt or expose it?

Every claim below is sourced from Supabase's own documentation, pricing and changelog, from the
PostgREST documentation, or from the PostgreSQL manual. No blog posts, no recall. Where a fact
differs by plan tier it is stated per tier; **this project runs on the Free plan**, and the Free
plan answer is the operative one.

A second class of evidence appears throughout, marked **measured**: HTTP probes run against this
project's own Supabase URL using only the publishable key from `.env` — the key that is already
shipped to every browser that loads the app. No account was created, no row was written, and the
project reference is deliberately not reproduced here. Where a doc and the live endpoint disagree,
the live endpoint is treated as authoritative.

**The one-line answer**: nobody but the account holder can delete a row — the `delete` privilege
is granted to no Data API role and `truncate` is revoked — but there is **no backup of any kind on
the Free plan**, so the account itself is the single point of failure, and the `SUPABASE_ACCESS_TOKEN`
in the developer's local `.env` is the credential that loses everything.

---

## 1. Backups: the Free plan has none

### What is taken automatically

Nothing. The backups guide is unambiguous that daily backups begin at Pro:

| plan | automatic daily backups | retention |
| --- | --- | --- |
| **Free** | **none** | — |
| Pro | yes | "the last 7 days of daily backups" |
| Team | yes | "the last 14 days of daily backups" |
| Enterprise | yes | "up to 30 days of daily backups" |

Source: [Database Backups](https://supabase.com/docs/guides/platform/backups). The same page tells
Free projects to do it themselves: *"We recommend that free tier plan projects regularly export
their data using the Supabase CLI `db dump` command and maintain off-site backups."*

The production checklist repeats the point from the other direction — *"Database backups are not
available for download for Free Plan projects"*
([Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)) — and the
[pricing page](https://supabase.com/pricing) lists no backup line for Free at all.

### Point-in-time recovery

Not available on Free, and not included in Pro's base price either. PITR is *"an add-on"* for
*"Pro, Team and Enterprise Plan projects"*, and it additionally *requires at least a Small compute
add-on* — which Free, on Nano compute, does not have. Pricing runs $0.137/hour (~$100/month) for 7
days of retention, $0.274/hour for 14, $0.55/hour for 28
([Database Backups](https://supabase.com/docs/guides/platform/backups);
[pricing](https://supabase.com/pricing)).

So reaching *any* recovery point requires Pro at $25/month, and reaching PITR requires roughly
$125/month. That is the real cost of the current gap.

### Can a Free project be backed up manually, repeatably, from the repo?

Yes, and this is the one genuinely actionable finding in this section. `supabase db dump`
*"Dumps contents from a remote database"* and *"Runs `pg_dump` in a container with additional flags
to exclude Supabase managed schemas"*
([CLI reference](https://supabase.com/docs/reference/cli/supabase-db-dump)). It takes `--linked`,
`--data-only`, `--role-only`, `--schema`, and `-f/--file`, so schema and data can be captured as
separate committed-adjacent artefacts.

`pg_dump` is the right tool for a live project: *"It makes consistent backups even if the database
is being used concurrently. pg_dump does not block other users accessing the database (readers or
writers)"* ([PostgreSQL 17 manual, pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)).
A dump taken against the running project cannot corrupt or stall it.

**The trap, and it is a real one.** `pg_dump` *"only dumps a single database"* and does **not**
dump roles or other cluster-wide objects; that is `pg_dumpall`'s job (same manual page), which is
why the CLI exposes `--role-only` separately. Worse for this schema specifically: the CLI excludes
Supabase-managed schemas, and `auth` is one of them. Both tables in this project foreign-key into
`auth.users` — `consultations.student_id` and `user_roles.user_id`, both
`references auth.users (id) on delete cascade`. A default `supabase db dump` therefore captures the
consultations but **not the identities they point at**, and restoring it into a fresh project would
fail on the foreign keys until the users exist again.

This is inferred from the documented exclusion rather than measured — no restore was attempted —
so treat it as the first thing to verify if a backup procedure is adopted. A three-file procedure
(`--role-only`, `--schema auth` for the user rows, then the default `public` dump) is the shape
that would actually round-trip.

---

## 2. Destruction: what a publishable key holder can actually destroy

### What the key is

The publishable key (`sb_publishable_...`) is not a JWT. It *"maps to the `anon` role when the user
is not logged in"* and to the `authenticated` role once a Supabase Auth session exists, and it is
*"Safe to expose online: web page, mobile or desktop app, GitHub actions, CLIs, source code"*
([API keys](https://supabase.com/docs/guides/api/api-keys);
[Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys)). It carries no
privilege of its own — it selects a Postgres role, and that role's grants and RLS policies decide
everything. The legacy `anon` key maps to exactly the same roles; it is a long-lived JWT and is
*"deprecated by the end of 2026"*
([Migrating to new API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)).

The distinction that matters is at the other end of the pair: the secret key (`sb_secret_...`) and
legacy `service_role` have *"full access to your project's data, bypassing Row Level Security"*.
Neither is in this repo's `.env.example`, and ADR-0001 already bans the secret key from application
code.

### The answer: nothing, by row

This project's migrations close the destructive verbs at the privilege layer, not the policy layer.
`20260811213255_create_consultations.sql` ends with:

```sql
revoke all on public.consultations from anon, authenticated;
grant select, insert, update on public.consultations to authenticated;
```

No `delete`. No `truncate`. And `20260811214508_create_user_roles_and_auth_hook.sql` does
`revoke all on table public.user_roles from authenticated, anon, public`.

This is the correct layer for it, because the two gates are independent. PostgreSQL's manual opens
the RLS chapter by saying so: *"In addition to the SQL-standard privilege system available through
GRANT, tables can have row security policies that restrict, on a per-user basis, which rows can be
returned by normal queries or inserted, updated, or deleted by data modification commands"*
([PostgreSQL 17, Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)).
*In addition to* — not *instead of*. A future `for delete` policy written by mistake would
therefore be **dead code**, not a breach: the privilege it needs was never granted. That is a
meaningfully stronger guarantee than a policy alone, and it justifies the migration comments
already spent on it.

`truncate` deserves its own line, and the same manual page is the authority: *"Operations that
apply to the whole table, such as TRUNCATE and REFERENCES, are not subject to row security."*
RLS cannot stop a truncate at all, so revoking the privilege is the **only** thing that does —
exactly what `revoke all ... from anon, authenticated` accomplishes before the narrower grant is
issued.

**Measured**, against the live project with the publishable key and no session:

| request | result |
| --- | --- |
| `GET /rest/v1/consultations?select=*` | `401` · `42501 permission denied for table consultations` |
| `GET /rest/v1/user_roles?select=*` | `401` · `42501 permission denied for table user_roles` |
| `DELETE /rest/v1/consultations?id=eq.<uuid>` | `401` · `42501 permission denied for table consultations` |
| `POST /rest/v1/rpc/custom_access_token_hook` | `401` · `42501 permission denied for function custom_access_token_hook` |
| `GET /rest/v1/consultations` with a fabricated key | `401` · `Invalid API key` |
| `GET /rest/v1/consultations` with no key | `401` · `No API key found in request` |

So the honest destruction answer has two halves:

- **Signed out**: nothing at all. `anon` holds no grant on either table.
- **Signed in** (anyone can obtain this — see §3): insert rows owned by themselves, and update
  their own rows within the state machine the `consultations_enforce_rules` trigger enforces. They
  cannot delete anything, cannot truncate anything, cannot touch another student's row, and cannot
  read `user_roles` or execute the token hook to promote themselves.

What they *can* do is fill the database. That is a §3 problem, and it is the real one.

### Rotation

Secret keys rotate cleanly and this is documented: create a new key in Settings → API Keys, cut
over, then *"delete the compromised one"*, noting that *"Deleting a secret key is irreversible and
once done it will be gone forever"* ([API keys](https://supabase.com/docs/guides/api/api-keys)).
Multiple keys are supported precisely so components can be rotated independently
([Migrating to new API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)).

**Negative result: rotation of the *publishable* key is not documented.** The guides describe
creation ("You can add more keys with different names later") and describe revocation for secret
keys, but nowhere state the publishable-key revocation path or an upper bound on how many a project
may hold. Practically this matters little — the publishable key is designed to be public and grants
nothing that RLS does not already permit — but it should not be *assumed* rotatable. By contrast
the legacy `anon` key, being a JWT signed by the project secret, cannot be rotated in isolation at
all: invalidating it means rotating the signing key, which affects every issued token.

---

## 3. Flooding: the limits, and what breaking them does

### The quotas

From the [pricing page](https://supabase.com/pricing) and
[Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk):

| Free plan limit | value |
| --- | --- |
| Database size | **500 MB** |
| File storage | 1 GB |
| Egress | 5 GB (plus 5 GB cached egress) |
| Monthly active users | 50,000 |
| API requests | **"Unlimited API requests"** |
| Active projects | 2 |
| Compute | Nano — shared CPU, up to 0.5 GB RAM |
| Direct Postgres connections | 60 |
| Pooler max clients | 200 |
| Inactivity | *"Free projects are paused after 1 week of inactivity"* |

### The Data API has no published request rate limit

This is the important negative result of the section. Supabase documents rate limits for **Auth**
in detail and for the **Management API** (120 requests per minute, *"Per user, per
project/organization"* — [Management API](https://supabase.com/docs/reference/api/introduction)),
but publishes **no per-request rate limit for the Data API**. The pricing page's Free-plan entry is
literally *"Unlimited API requests"*.

**Measured**: response headers from a rejected `/rest/v1/` read show `server: cloudflare`, a
`cf-ray` id and `x-envoy-attempt-count`, so Cloudflare and an Envoy gateway do sit in front of
PostgREST — but no `RateLimit-*`, `Retry-After` or equivalent header is returned, and no threshold
is documented. Plan on the binding constraints being egress, connections and database size rather
than a request cap.

Note also that IP allowlisting does not help here:
[Network Restrictions](https://supabase.com/docs/guides/platform/network-restrictions) states they
*"apply to Postgres and the database pooler. They don't apply to HTTPS APIs such as PostgREST,
Storage, and Auth, or to Supabase client libraries like supabase-js."*

### Auth limits, which do exist

From [Rate limits](https://supabase.com/docs/guides/auth/rate-limits) and the
[CLI config reference](https://supabase.com/docs/guides/local-development/cli/config) (whose
defaults `supabase/config.toml` mirrors verbatim):

| operation | limit | scope |
| --- | --- | --- |
| Sign-ups **and** sign-ins | 30 per 5 minutes | per IP (`sign_in_sign_ups`) |
| Emails sent (built-in provider) | 2 per hour | project-wide |
| Token refresh | 1800/hour, bursts to 30 · `token_refresh = 150` per 5 min | per IP |
| Verification (`/auth/v1/verify`) | 360/hour, bursts to 30 | per IP |
| Anonymous sign-ins | 30 per hour | per IP |
| MFA challenge/verify | 15 per minute | per IP |

Exceeding any of them returns **`429 Too Many Requests`**.

**The open door.** `supabase/config.toml:235` sets `enable_confirmations = false`, and the live
project agrees — **measured**, `GET /auth/v1/settings` returns `200` with
`"disable_signup": false` and `"mailer_autoconfirm": true`. So email confirmation is off and
anyone can mint a real `authenticated` session on demand. The 2-emails-per-hour cap never binds
because no email is sent. The only brake is `sign_in_sign_ups`: **30 accounts per 5 minutes per IP**,
or ~8,600/day from a single address and linearly more from more addresses.

Each account can then insert consultations. The row is bounded by the check constraints —
names ≤ 100 chars, `reason` ≤ 1000 — so call it ~1.2 KB of row plus two indexes. Filling 500 MB is
on the order of a few hundred thousand rows: tedious, entirely feasible, and not rate-limited by
anything documented. `auth.users` rows from the sign-ups count toward the same 500 MB.

The mitigation is already scaffolded and switched off: `[auth.captcha]` is present but commented
out at `supabase/config.toml:222-226`, and the production checklist recommends *"CAPTCHA protection
on the signup, sign-in and password reset endpoints"*
([Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)). Turning on
`enable_confirmations` would also work and costs nothing but the 2/hour built-in mail cap.

### What happens when a limit is hit

Not a bill — a progressive shutdown. The [Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
describes notification and *"a grace period before fair use policy applies"*, then
*"If you continue to exceed the limits, service restrictions will apply"*, listing:

- *"Pausing projects"*
- *"Switching databases to read-only mode"*
- *"Disabling new project launches/transfers"*
- *"Responding with a 402 status code for all API requests"*

Database size has its own hard trip: at 500 MB a Free project *"enter[s] read-only mode"* and
clients get `cannot execute INSERT in a read-only transaction`. Exit is manual —
`set session characteristics as transaction read write;`, delete data, `vacuum;` — with normal
operation resuming automatically below 95% of disk
([Understanding Database and Disk Size](https://supabase.com/docs/guides/platform/database-size)).

Separately, inactivity pauses the project after *"low activity over a 7-day period"*; *"a few user
requests to the database each day over the previous week is enough"* to prevent it, and a paused
project has a restore window measured in months before manual recovery is required
([Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). For a
take-home repo that nobody visits, **this is the most likely way the project actually goes dark** —
not an attack.

### Spend cap

There is no bill to cap. The Spend Cap *"is available only with the Pro Plan. However, you will not
be charged while using the Free Plan"*
([Cost Control](https://supabase.com/docs/guides/platform/cost-control)). The Free-plan failure
mode is denial of service, never a surprise invoice — which is the right trade for a public
take-home, and worth stating plainly to anyone nervous about publishing.

---

## 4. Exposure: what an unauthenticated caller can see

### Only two schemas are reachable

**Measured**, requesting the `auth` schema via `Accept-Profile: auth` returns `406` with
`PGRST106` and the hint *"Only the following schemas are exposed: public, graphql_public"* — which
matches `supabase/config.toml:13`. `auth.users` is therefore not reachable through the Data API at
any privilege level the publishable key can select, corroborating the README's claim that reaching
emails would need a `security definer` function.

### OpenAPI introspection is closed — but only recently

PostgREST serves a full OpenAPI description at the API root, including *"SQL comments converted
into description fields for schemas, tables, columns"*, filtered by
the role's privileges; the default `openapi-mode` is `follow-privileges`, with `ignore-privileges`
and `disabled` as the alternatives
([PostgREST OpenAPI](https://docs.postgrest.org/en/v13/references/api/openapi.html);
[PostgREST configuration](https://docs.postgrest.org/en/v13/references/configuration.html)).

Supabase now blocks that endpoint for public keys outright. **Measured**, `GET /rest/v1/` with the
publishable key returns `401`:

```json
{"message":"Secret API key required","hint":"Only secret API keys can be used for this endpoint."}
```

This is new: the changelog
[Removing access to OpenAPI spec via the anon key](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key)
dates it to **11 March 2026** for new projects and **8 April 2026** for existing ones. Only secret
keys, service-role keys and the Management API can read it now. Anyone reasoning from
pre-2026 knowledge will expect the whole schema to be dumpable from the browser key. It is not.

### But the schema is still a partial oracle — and this is the finding

Blocking the spec does not stop enumeration, because PostgREST's error codes distinguish
*"forbidden"* from *"absent"*. **Measured**:

| probe | status | code |
| --- | --- | --- |
| `GET /rest/v1/definitely_not_a_table` | `404` | `PGRST205 Could not find the table 'public.definitely_not_a_table' in the schema cache` |
| `GET /rest/v1/user_roles` | `401` | `42501 permission denied for table user_roles` |

Two different answers. So an anonymous caller who *guesses the name* `user_roles` learns that
`public.user_roles` **exists**, and the same for `consultations`. The 42501 hint is more generous
still — it names the object and schema back: *"Grant the required privileges to the current role
with: `GRANT SELECT ON public.user_roles TO anon;`"*. No column names, types or row counts leak, and
no data is returned, but existence is confirmed.

The same applies to the auth hook, with a twist:

| probe | status | code |
| --- | --- | --- |
| `POST /rest/v1/rpc/custom_access_token_hook` with `{"event":{}}` | `401` | `42501 permission denied for function custom_access_token_hook` |
| `POST /rest/v1/rpc/enforce_consultation_rules` | `404` | `PGRST202 ... no matches were found in the schema cache` |

So **yes — `public.custom_access_token_hook` does show up despite the explicit revoke**, if and
only if the caller sends a body matching its `(event jsonb)` signature. The revoke stops execution,
not discovery. `enforce_consultation_rules` stays invisible because it is a trigger function with
no callable RPC signature, so it is indistinguishable from a name that does not exist.

This is a disclosure, not a vulnerability: knowing a hook named `custom_access_token_hook` exists
tells an attacker only that this project follows Supabase's documented RBAC pattern, which the
public README states outright anyway. It is worth writing down precisely because the migration
comments imply the revoke hides the function, and it does not.

### Other endpoints on the project URL

**Measured**, with the publishable key and no session:

- `GET /auth/v1/settings` → **`200`**, disclosing the full auth configuration: every social
  provider and its enabled flag, `"email": true`, `"disable_signup": false`,
  `"mailer_autoconfirm": true`, `"saml_enabled": false`, `"passkeys_enabled": false`. This is by
  design — the client library needs it to render a login form — but it does tell an attacker that
  sign-ups are open and unconfirmed, which is exactly the §3 precondition.
- `GET /storage/v1/bucket` → `200` with `[]`. Storage is reachable and empty; the project uses none.
- `POST /graphql/v1` → `200` with `{"errors":[{"message":"pg_graphql extension is not enabled."}]}`,
  so there is no GraphQL introspection surface. Consistent with the changelog note that pg_graphql
  is no longer enabled by default for projects created after 30 May 2026
  ([Tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)).

That changelog is worth knowing for a reproducer: from **30 May 2026** new projects no longer expose
`public` tables to the Data API automatically, and from **30 October 2026** the setting reaches all
existing projects. This repo's migrations grant explicitly rather than relying on the default, so
they are already correct under both regimes — but anyone recreating the project from these
migrations after October will get a *different* default than the author did, and explicit grants
are why that will not matter.

---

## 5. Account level: the actual blast radius

Everything above concerns the project URL. The dashboard account is a strictly larger target, and
on the Free plan it is the least defended.

### MFA

Supabase supports *"a unique time-based one-time password (TOTP) to your user account as an
additional security factor"*. Enforcement, however, is plan-gated: *"If you are an organization
owner and on the Pro, Team or Enterprise plan, you can enforce that all organization members must
have MFA enabled"*
([Multi-Factor Authentication](https://supabase.com/docs/guides/platform/multi-factor-authentication)).
A Free organization can therefore **enable** MFA per-user but cannot **require** it.

### Roles are org-wide on Free

*"Project scoped roles are only available on the Team and Enterprise plans"*
([Access Control](https://supabase.com/docs/guides/platform/access-control)). Every member of a
Free organization holds access across every project in it. Owner-exclusive actions are transferring
projects out, deleting the organization, and managing other owners.

### The leaked `SUPABASE_ACCESS_TOKEN`

`.env.example` documents this variable as *"A PERSONAL access token for your Supabase account — not
a project credential"*, needed only because `supabase login`'s browser flow fails in
non-interactive shells. It is CLI-only and is never read by the application.

Supabase's own warning is the whole answer: **"PATs carry the same privileges as your user account,
so be sure to keep it secret"** ([Management API](https://supabase.com/docs/reference/api/introduction)).
There is no documented way to scope a PAT to one project or one operation — OAuth2 tokens are the
scoped alternative, *"tied to specific scopes"*, and PATs are not. A holder of that token can, via
the Management API:

- **Delete the project.** `DELETE /v1/projects/{ref}`
  ([Delete a project](https://supabase.com/docs/reference/api/v1-delete-a-project)) — documented
  with no confirmation step and no irreversibility warning.
- **Read every API key**, including the secret key, which bypasses RLS entirely and makes §2's
  whole grant argument moot ([Get project API keys](https://supabase.com/docs/reference/api/v1-get-project-api-keys)).
- Run SQL, apply migrations, change auth configuration, pause and restore, across **every
  organization and project the account can reach** — not just this one.

Rate limiting is no protection here: 120 requests per minute is many more than one delete.

**Chain it with §1 and the conclusion is stark.** There are no automatic backups on the Free plan
and no PITR, so a project deleted through a leaked PAT is not recoverable — there is nothing to
restore from. Of every credential in this repo's `.env`, the PAT is the only one whose compromise
is unrecoverable, and it is the only one with no defence in depth behind it.

Two mitigating facts, both real:

- `.env` is git-ignored (`.gitignore:35`) and **has never been committed** — verified with
  `git log --all -- .env`, which returns nothing. Only `.env.example` ships, with empty values.
- Supabase auto-revokes **secret keys** (`sb_secret_...`) detected in public GitHub repositories.
  This is a genuine safety net for the wrong credential: it covers project secret keys, **not**
  personal access tokens.

The proportionate response, given the repo is going public: generate the PAT with a short expiry,
delete it from the dashboard once `supabase link` has been run, and enable TOTP on the account.
None of that costs anything or requires Pro.

---

## Summary: what to expect versus what is true

| expectation | reality on this project's Free plan | source |
| --- | --- | --- |
| Supabase backs my data up | **No backups at all on Free**; daily backups start at Pro | [backups](https://supabase.com/docs/guides/platform/backups) |
| PITR is a Pro feature | An **add-on** on Pro+, needing ≥ Small compute; ~$100/mo for 7 days | [backups](https://supabase.com/docs/guides/platform/backups) |
| A manual backup is a workaround | It is the **documented recommendation** for Free — `supabase db dump` | [backups](https://supabase.com/docs/guides/platform/backups), [CLI](https://supabase.com/docs/reference/cli/supabase-db-dump) |
| A dump captures everything | Managed schemas are excluded, so `auth.users` is missing and FKs will fail on restore | [CLI](https://supabase.com/docs/reference/cli/supabase-db-dump), [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) |
| A bad RLS policy could allow deletes | No — `delete` is granted to nobody, and policies apply *in addition to* privileges | [PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) |
| The publishable key is a lesser secret | It is not a secret: *"Safe to expose online"*; it only selects `anon`/`authenticated` | [API keys](https://supabase.com/docs/guides/api/api-keys) |
| The publishable key can be rotated | **Not documented.** Rotation and instant revocation are documented for *secret* keys only | [API keys](https://supabase.com/docs/guides/api/api-keys) |
| The Data API is rate limited | **No published request limit**; Free is billed as "Unlimited API requests" | [pricing](https://supabase.com/pricing) |
| Sign-up is throttled | Only 30 per 5 min **per IP**, and confirmations are off, so accounts are free and instant | [rate limits](https://supabase.com/docs/guides/auth/rate-limits), `config.toml:235` |
| Hitting free limits costs money | It cannot: no charges on Free. It costs **availability** — read-only mode, pausing, `402` | [cost control](https://supabase.com/docs/guides/platform/cost-control), [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) |
| IP allowlisting protects the API | It covers Postgres and the pooler only, *"not HTTPS APIs such as PostgREST, Storage, and Auth"* | [network restrictions](https://supabase.com/docs/guides/platform/network-restrictions) |
| `/rest/v1/` leaks the whole schema | Blocked for public keys since Mar/Apr 2026 — *"Secret API key required"* | [changelog 42949](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key) |
| The revokes hide `user_roles` | They hide its **data**; `401`-vs-`404` still confirms the table **exists** | measured |
| The revoke hides the auth hook | It stops execution only — a correctly-shaped RPC call confirms the function exists | measured |
| MFA can be required on the account | Only *enforced* org-wide on Pro+; a Free org can enable it but not require it | [MFA](https://supabase.com/docs/guides/platform/multi-factor-authentication) |
| A PAT is a project credential | It carries **the whole user account**, every org and project, and can delete the project | [Management API](https://supabase.com/docs/reference/api/introduction), [delete project](https://supabase.com/docs/reference/api/v1-delete-a-project) |

The table's two halves point in opposite directions, and that is the conclusion: **the schema is
well defended and the account is not.** Making the repo public exposes the publishable key, which is designed to be
public and which §2 measured as able to read and write nothing without a session and nothing but its
own rows with one. It does not expose the PAT. The risk of publishing is low; the risk that already
exists — no backups, an unenforceable-MFA account holding an unscoped token — is unchanged by
publishing and is worth fixing on its own schedule.
