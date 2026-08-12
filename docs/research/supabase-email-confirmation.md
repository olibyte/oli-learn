# Turning on email confirmations requires provisioning an email provider, not flipping a flag

**Bottom line: it is "flip two flags AND provision SMTP".** On a Free-plan project using Supabase's default SMTP sender, `enable_confirmations = true` does not make signup slower or flakier — it makes signup *impossible* for everyone who is not a member of the Supabase organisation. The public gets an HTTP 400 and no account. Provisioning a real sender is not optional cleanup afterwards; it is a precondition, and it requires a domain you control. That does not fit a one-day budget, so the correct move for this project is to leave `enable_confirmations = false` and document the reason.

Everything below is sourced from Supabase's own documentation, the Supabase CLI source, the GoTrue/`supabase/auth` source, and each email provider's own docs.

## 1. The default sender is an allowlist of two messages an hour

Two separate restrictions apply, and the recipient one is the crux.

**Who it will send to: only members of the project's organisation.** Supabase's SMTP guide is unambiguous — "Unless you configure a custom SMTP server for your project, Supabase Auth will refuse to deliver messages to addresses that are not part of the project's team", and "All other addresses will fail with the error message *Email address not authorized.*" ([auth-smtp.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-smtp.mdx), rendered at [supabase.com/docs/guides/auth/auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)). The error-code reference says the same thing in the words the API returns: `email_address_not_authorized` — "Email sending is not allowed for this address as your project is using the default SMTP service. Emails can only be sent to members in your Supabase organization." ([authErrorCodes.json](https://github.com/supabase/supabase/blob/master/apps/docs/data/errorCodes/authErrorCodes.json), rendered at [error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)).

This is an **exact-address allowlist, not a domain allowlist**. `checkEmailAddressAuthorization` in [`internal/api/mail.go`](https://github.com/supabase/auth/blob/master/internal/api/mail.go) compares the recipient against `External.Email.AuthorizedAddresses` with `strings.EqualFold` after stripping `+label` suffixes. Nothing else matches.

**How many: 2 per hour, project-wide, not raisable.** The docs interpolate a shared constant whose value is `inbuilt_smtp_per_hour: { value: 2 }` ([shared-data/config.ts](https://github.com/supabase/supabase/blob/master/packages/shared-data/config.ts)). The rate-limits table counts `/auth/v1/signup`, `/auth/v1/recover` and `/auth/v1/user` against one shared bucket and marks it "Custom SMTP Only" for customisation — "You can only change this with your own custom SMTP setup" ([auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [going-into-prod.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/deployment/going-into-prod.mdx)).

That last point has a direct consequence in this repo. `supabase/config.toml` sets `[auth.rate_limit] email_sent = 2`, and its own comment says "Requires auth.email.smtp to be enabled." The CLI honours that literally: `pushAuthConfig` only writes `rate_limit_email_sent` into the Management API body `if (local.email.smtp !== undefined && local.email.smtp.enabled)` ([auth.sync.ts](https://github.com/supabase/cli/blob/main/apps/cli/src/legacy/commands/config/push/config-sync/auth.sync.ts)). **Today that line is decorative** — `supabase config push` never sends it, because this project has no `[auth.email.smtp]` block.

Supabase also states plainly that the default sender carries "No SLA guarantee on message delivery or uptime", and is intended for "Building toy projects, demos or any non-mission-critical application".

## 2. A public signup does not silently fail — it loudly 400s, and no user row survives

This was worth tracing to the source, because "the user is created but never gets the mail" and "the signup is rejected" are very different failure modes to document.

It is the second. In [`internal/api/signup.go`](https://github.com/supabase/auth/blob/master/internal/api/signup.go), `signupNewUser` and `a.sendConfirmation(...)` run inside **the same `db.Transaction`**. `sendConfirmation` ([`mail.go`](https://github.com/supabase/auth/blob/master/internal/api/mail.go)) calls `sendEmail`, which performs the authorisation check *before* attempting delivery and returns `apierrors.NewBadRequestError(apierrors.ErrorCodeEmailAddressNotAuthorized, "Email address %q cannot be used as it is not authorized", ...)`. `sendConfirmation` sees an `*HTTPError` and returns it verbatim rather than wrapping it as a 500. That error propagates out of the transaction closure, so **the transaction rolls back and the user is never persisted**.

So with confirmations on and default SMTP, a member of the public who signs up gets:

- **HTTP 400**, error code `email_address_not_authorized`
- **no account** — not an unconfirmed one, none at all
- **no email**, because none was attempted

A reviewer opening the deployed app and trying to register would hit exactly this, unless their address happens to be on the Supabase organisation's team list. There is no partial-success state to recover from and no "resend confirmation" path that helps.

Two adjacent facts worth having on record:

- **`example.com` is rejected independently of any of this.** `email_address_invalid` reads "Example and test domains are currently not supported. Use a different email address." ([authErrorCodes.json](https://github.com/supabase/supabase/blob/master/apps/docs/data/errorCodes/authErrorCodes.json)). In `mail.go` this is raised when the validation client returns `ErrInvalidEmailAddress` / `ErrInvalidEmailFormat` / `ErrInvalidEmailDNS`. It fires on the *send* path, which is why the seeded `@example.com` accounts are fine today — nothing ever tries to mail them.
- **Locally, none of this bites.** `supabase start` runs a mail catcher (`[local_smtp]`, web UI on port 54324) and messages are captured rather than delivered. `enable_confirmations = true` therefore looks perfectly healthy on a local stack and only breaks once `supabase config push` reaches the hosted project — a trap worth naming explicitly if anyone revisits this.

## 3. Custom SMTP is free to *enable* and non-trivial to *obtain*

**Availability is not the obstacle.** Custom SMTP is listed as included on every plan tier, Free included ([supabase.com/pricing](https://supabase.com/pricing)). Removing Supabase branding from emails is the paid-only email feature; the SMTP server itself is not.

**Wiring it from the repo is genuinely cheap.** `supabase/config.toml` already carries the commented block, and `pushAuthConfig` maps every field onto the Management API (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`, `smtp_sender_name` — see [auth.sync.ts](https://github.com/supabase/cli/blob/main/apps/cli/src/legacy/commands/config/push/config-sync/auth.sync.ts)). The password is an `env(...)` reference, so no secret enters git. For Resend that is a five-line diff plus one environment variable:

```toml
[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(RESEND_API_KEY)"
admin_email = "no-reply@<a-domain-you-own>"
sender_name = "Oli-Learn"
```

(host/port/user per [Resend's Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp).)

**The obstacle is the `admin_email` line.** Every provider Supabase lists requires you to prove control of a sending identity before it will deliver to arbitrary strangers, and for the ones with usable free tiers that means DNS records on a domain you own:

- **Resend** — Free plan is 3,000 emails/month, 100/day, **1 domain**, and includes SMTP relay ([resend.com/pricing](https://resend.com/pricing)). But "You must add and verify at least one domain to send emails with Resend" and Resend "sends emails using a domain you own (i.e., not a shared or public domain)" ([verified domains](https://resend.com/docs/dashboard/domains/introduction)). The shared test domain is not a loophole: with `resend.dev` "You can only send testing emails to your own email address", and to reach anyone else you must "verify a domain at resend.com/domains, and change the `from` address" ([403 error guidance](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)). Its Supabase guide lists "A verified domain" as a prerequisite.
- **AWS SES** — new accounts land in the sandbox, where "You can only send mail **to** verified email addresses and domains", capped at 200 messages per 24 hours and 1 per second. Leaving the sandbox is a reviewed support request with an initial response "within 24 hours" ([request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)).

The remaining providers Supabase names — Postmark, Twilio SendGrid, ZeptoMail, Brevo ([auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)) — were not verified here; Brevo's own docs and pricing pages return HTTP 403 to automated fetches, so no claim is made about their free tiers either way.

**Note the ceiling even after you succeed.** Once custom SMTP is saved, "a low rate-limit of 30 messages per hour is imposed", adjustable afterwards ([auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)); going-into-prod phrases the same number as "30 new users per hour".

**Total realistic cost:** register or repurpose a domain, add DKIM/SPF records and wait for propagation, create the provider account, generate a key, add a Vercel/CI secret, push config, then re-test signup end to end. Nothing here is hard; nothing here is fifteen minutes either, and the domain step in particular is not something a take-home budget should absorb. `oli-learn.vercel.app` cannot stand in — it is a `vercel.app` subdomain, not a zone this project controls.

## 4. The seeded accounts are unaffected

They keep working, and the reason is one line of GoTrue.

Sign-in gates on nothing but the timestamp: `if params.Email != "" && !user.IsConfirmed() { return ... "Email not confirmed" }` in [`internal/api/token.go`](https://github.com/supabase/auth/blob/master/internal/api/token.go), where `IsConfirmed()` is exactly `return u.EmailConfirmedAt != nil` ([`internal/models/user.go`](https://github.com/supabase/auth/blob/master/internal/models/user.go)). `enable_confirmations` is not consulted at sign-in at all — it only decides, at *signup* time, whether GoTrue calls `user.Confirm(tx)` immediately or sends a confirmation instead ([signup.go](https://github.com/supabase/auth/blob/master/internal/api/signup.go)).

`supabase/seed.sql` inserts `admin@example.com` and `student@example.com` straight into `auth.users` with `email_confirmed_at` populated, and its own comment already records why. Those rows are therefore confirmed by construction, they bypass the `email_address_invalid` check (which lives on the send path, not on the table), and they would continue to sign in normally with confirmations enabled. **The demo credentials in the README are not a blocker for this decision either way** — the blocker is new public signups.

## 5. Password knobs: four legal values, and a real range of 6–72

**`password_requirements` accepts exactly four values**, enumerated identically in both CLI implementations — `""`, `letters_digits`, `lower_upper_letters_digits`, `lower_upper_letters_digits_symbols` ([packages/config/src/auth/index.ts](https://github.com/supabase/cli/blob/main/packages/config/src/auth/index.ts); [apps/cli-go/pkg/config/auth.go](https://github.com/supabase/cli/blob/main/apps/cli-go/pkg/config/auth.go), whose `UnmarshalText` rejects anything else with "must be one of ..."). Default is `""`.

They are sugar. The CLI expands each to a colon-delimited character-class string for GoTrue's `password_required_characters`, and the Management API enum accepts only those literal expansions:

| `password_requirements` | expands to |
| --- | --- |
| `letters_digits` | `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789` |
| `lower_upper_letters_digits` | `abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789` |
| `lower_upper_letters_digits_symbols` | the above plus a fourth group of ASCII symbols |

(mapping from `PASSWORD_REQUIREMENTS_TO_CHAR` in [auth.sync.ts](https://github.com/supabase/cli/blob/main/apps/cli/src/legacy/commands/config/push/config-sync/auth.sync.ts); enum confirmed against the live Management API schema at `https://api.supabase.com/api/v1-json`, `UpdateAuthConfigBody.password_required_characters`.) Each colon-separated group is a set the password must contain **at least one** character from — `checkPasswordStrength` in [`internal/api/password.go`](https://github.com/supabase/auth/blob/master/internal/api/password.go) loops the groups and calls `strings.ContainsAny`.

**`minimum_password_length` has a hard floor of 6 and an effective ceiling of 72.**

- Floor, enforced twice: the CLI's default is `6` ([auth/index.ts](https://github.com/supabase/cli/blob/main/packages/config/src/auth/index.ts)), the Management API declares `minimum: 6` on `password_min_length`, and GoTrue silently clamps anyway — `if config.Password.MinLength < defaultMinPasswordLength { config.Password.MinLength = defaultMinPasswordLength }`, with `defaultMinPasswordLength int = 6` ([configuration.go](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go)). Setting 4 does not fail; it just becomes 6.
- The Management API's nominal ceiling is `maximum: 32767`, but that is a lie in practice. `password.go` declares `const MaxPasswordLength = 72` — "BCrypt hashed passwords have a 72 character limit" — and rejects anything longer *before* the strength check. Configure a minimum above 72 and every password is simultaneously too short and too long: **signup becomes unsatisfiable.** The usable range is 6–72.

So this repo's current `minimum_password_length = 6` is already at the floor. Raising it to 8 or 10 and setting `password_requirements = "lower_upper_letters_digits"` costs nothing, sends nothing, and needs no provider — unlike confirmations.

## Recommendation

**Leave `enable_confirmations = false`, and say so in the README's known limitations with the reason.** The honest sentence is roughly: *email confirmation is off because the project uses Supabase's default SMTP sender, which only delivers to members of the Supabase organisation — turning confirmations on would reject every public signup with a 400 rather than merely delaying it. Enabling it means provisioning a domain and an SMTP provider first.*

The hardening that *is* free today, and is genuinely two flags, lives in `[auth]`:

```toml
minimum_password_length = 8                            # or 10; 6 is the floor
password_requirements = "lower_upper_letters_digits"
```

Keep them distinct in any write-up. Password strength is a config change. Email confirmation is an infrastructure change wearing a config change's clothes.

## Sources

Supabase documentation

- [Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-smtp.mdx)
- [Rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) · [source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/deployment/going-into-prod.mdx)
- [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes) · [data](https://github.com/supabase/supabase/blob/master/apps/docs/data/errorCodes/authErrorCodes.json)
- [Pricing](https://supabase.com/pricing)
- [`packages/shared-data/config.ts`](https://github.com/supabase/supabase/blob/master/packages/shared-data/config.ts) — the `2` behind the docs' interpolated rate limit

Supabase CLI

- [`packages/config/src/auth/index.ts`](https://github.com/supabase/cli/blob/main/packages/config/src/auth/index.ts) — config schema, defaults, enums
- [`apps/cli-go/pkg/config/auth.go`](https://github.com/supabase/cli/blob/main/apps/cli-go/pkg/config/auth.go) — `PasswordRequirements` constants and validation
- [`.../config-sync/auth.sync.ts`](https://github.com/supabase/cli/blob/main/apps/cli/src/legacy/commands/config/push/config-sync/auth.sync.ts) — what `supabase config push` actually sends
- Management API schema, `https://api.supabase.com/api/v1-json` (`UpdateAuthConfigBody`)

GoTrue / `supabase/auth`

- [`internal/api/signup.go`](https://github.com/supabase/auth/blob/master/internal/api/signup.go) — the transaction that rolls back
- [`internal/api/mail.go`](https://github.com/supabase/auth/blob/master/internal/api/mail.go) — `sendConfirmation`, `sendEmail`, `checkEmailAddressAuthorization`
- [`internal/api/token.go`](https://github.com/supabase/auth/blob/master/internal/api/token.go) — the sign-in confirmation gate
- [`internal/models/user.go`](https://github.com/supabase/auth/blob/master/internal/models/user.go) — `IsConfirmed`, `Confirm`
- [`internal/api/password.go`](https://github.com/supabase/auth/blob/master/internal/api/password.go) — `MaxPasswordLength`, `checkPasswordStrength`
- [`internal/conf/configuration.go`](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go) — `defaultMinPasswordLength`, clamping
- [`internal/api/apierrors/errorcode.go`](https://github.com/supabase/auth/blob/master/internal/api/apierrors/errorcode.go) — error-code constants

Email providers

- [Resend pricing](https://resend.com/pricing) · [verified domains](https://resend.com/docs/dashboard/domains/introduction) · [resend.dev restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain) · [Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp)
- [Amazon SES — request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

Checked against `supabase/config.toml` and `supabase/seed.sql` at commit `5a8191a`, 2026-08-13.
