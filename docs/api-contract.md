# API contract

The mutation surface for consultations. Settled in [#9](https://github.com/olibyte/with-supabase-app/issues/9); implemented by [#10](https://github.com/olibyte/with-supabase-app/issues/10).

## Shape of the surface

Per [ADR-0002](./adr/0002-apis-for-writes-rsc-for-reads.md), "ALWAYS use APIs, NEVER use Server Actions" governs **mutations**. Every write is a route handler; there are **no read endpoints at all**, and that is deliberate rather than an oversight.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/consultations` | Book a consultation |
| `PATCH` | `/api/consultations/[id]` | Complete, un-complete, cancel, or reschedule |

**Deliberately absent:**

- **No `GET`.** Reads come from Server Components using the request-scoped Supabase client. After a mutation the client calls `useRouter().refresh()`, which re-requests the route and re-renders the Server Components without losing client state — so a read endpoint would duplicate the read path for no gain. (This is `next/navigation`'s `refresh()`, not `next/cache`'s, which requires a Server Action and is therefore unavailable to us.)
- **No `DELETE`.** Cancelling is a status transition ([ADR-0003](./adr/0003-consultation-state-machine.md)) and the admin view must keep showing cancelled rows. No `DELETE` privilege was granted to any role, so the endpoint would fail at the database even if written.
- **No admin write endpoints.** The admin view is read-only, enforced by the absence of any admin write policy.

Next returns `405` automatically for undefined methods, with a synthesised `Allow` header.

## Request schemas

Validated with zod 4.4.3. Field names are `camelCase` at the API boundary and mapped to `snake_case` columns in the handler.

```ts
const isoFuture = z.iso
  .datetime({ offset: true })
  .refine((v) => new Date(v).getTime() > Date.now(), {
    message: "Must be in the future",
  });

// POST /api/consultations
const CreateConsultation = z.strictObject({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(1000),
  scheduledAt: isoFuture,
});

// PATCH /api/consultations/[id]
// A union of two strict objects, so sending both at once is rejected. The body
// describes the desired state rather than naming an action - PATCH semantics,
// not RPC.
const PatchConsultation = z.union([
  z.strictObject({ status: z.enum(["scheduled", "completed", "cancelled"]) }),
  z.strictObject({ scheduledAt: isoFuture }),
]);
```

The four operations map onto `PATCH` as:

| Operation | Body |
| --- | --- |
| Mark complete | `{ "status": "completed" }` |
| Mark incomplete | `{ "status": "scheduled" }` |
| Cancel | `{ "status": "cancelled" }` |
| Reschedule | `{ "scheduledAt": "2030-01-01T10:00:00Z" }` |

The bounds mirror the database's check constraints exactly (1–100, 1–100, 1–1000). Client-side rejection is a courtesy; the constraints are the authority.

## Handler order

The sequence matters as much as the pieces:

1. **Authenticate** with `supabase.auth.getClaims()` → `401` if absent. Never trust `proxy.ts` for this; Next's docs state repeatedly that middleware is not an authorization boundary, and `getClaims()` is safe as the authoritative check because this project uses asymmetric ES256 signing keys and verifies locally.
2. **`await ctx.params`** — `params` is a Promise in 16; the Next 15 sync shim is fully removed.
3. **Parse the body** → `422`. After authentication, so an unauthenticated caller learns nothing about the schema.
4. **Mutate** through the request-scoped client, which executes as the signed-in user. RLS is the authorization boundary.
5. **Zero rows affected → `404`.** This is not a database error; it is exactly what an admin's write attempt or a student targeting someone else's row produces. Without this step the handler returns `200` for a write that did nothing.
6. **Map Postgres errors** (below), never pass them through raw.

## The proxy must not redirect `/api`

`proxy.ts`'s matcher covers `/api`, which is the safer default and stays that way. But its unauthenticated branch originally redirected *everything* to `/auth/login` — and `fetch` follows a 302 transparently, so an API caller received `200 OK` containing an HTML login page and failed while parsing it as JSON.

`lib/supabase/proxy.ts` therefore returns the `401` problem body directly for `/api/*` paths, carrying over any refreshed auth cookies, and only redirects for HTML routes. The body shape is shared with `lib/api/problem.ts` so there is one source of truth.

## Status codes

| Code | When |
| --- | --- |
| `201` | Created, with `Location: /api/consultations/{id}` |
| `200` | Patched, returning the updated resource |
| `400` | Body is not valid JSON |
| `401` | No valid session |
| `404` | Not found, **or not yours** — see below |
| `422` | Schema validation failed, or the transition is illegal |
| `500` | Unexpected — no detail returned |

**`404` for someone else's row, always.** A row you cannot see is indistinguishable from one that does not exist, so nothing is leaked about which IDs are real — which is also why #6 chose a `uuid` primary key. This falls out naturally: RLS returns zero rows in both cases, so the handler *cannot* tell them apart without a service-role lookup, and ADR-0001 bans the secret key from application code.

## Error body

[RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457), served as `application/problem+json`:

```jsonc
{
  "type": "/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "Reason must not be empty.",
  "instance": "/api/consultations/9f2b...c41a",
  "errors": [{ "field": "reason", "message": "Must not be empty" }]
}
```

`errors` is an RFC-sanctioned extension member, present only for field-level failures.

### Catalogue

| `type` | Status | Raised by |
| --- | --- | --- |
| `/errors/malformed-json` | 400 | `request.json()` throwing |
| `/errors/unauthenticated` | 401 | no claims |
| `/errors/not-found` | 404 | zero rows, or Postgres `42501` |
| `/errors/validation-failed` | 422 | zod |
| `/errors/invalid-transition` | 422 | Postgres `23514` from the rules trigger |
| `/errors/internal` | 500 | anything else |

### Mapping database errors

The rules trigger raises `check_violation` (`23514`) with messages we wrote — "A cancelled consultation cannot be changed", "A consultation cannot be booked in the past", and so on. **Map them explicitly to `detail`; do not pass the Postgres message through.** The strings are ours today, but coupling HTTP responses to database text means any future reword silently changes the public API. `42501` maps to `404`, not `403`, per the decision above.

### What it must never contain

No Postgres error codes or SQL, no table or column names, no stack traces, no other user's data, and no distinction between "absent" and "forbidden". `500` carries a `title` and nothing else.

## Known limitations

**Concurrency is last-write-wins.** Two tabs patching the same consultation will not conflict; the second silently wins. Optimistic concurrency (an `If-Match` header over `updated_at`) is the standard fix and is deliberately out of scope — recorded here so it reads as a decision rather than an oversight.
