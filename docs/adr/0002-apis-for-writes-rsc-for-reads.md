# Mutations go through route handlers; reads go through Server Components

The brief says "ALWAYS use APIs, NEVER use Server Actions." Server Actions are React's *mutation* primitive, so we read that rule as governing writes: every mutation is a REST route handler under `app/api/`, and no Server Action exists in the codebase. Reads are served directly from Server Components using the request-scoped Supabase client, which is not a Server Action and keeps the caller's identity intact.

## Considered Options

- **Route the reads through `/api/*` as well.** Rejected. A Server Component fetching its own route handler needs an absolute URL and hand-forwarded cookies, which adds a network hop to reach the same Postgres row and is the classic way to silently lose the caller's identity — precisely the failure RLS then has to catch.
- **Make the pages client components and fetch everything.** Rejected. It gives up streaming and ships materially more JavaScript for no gain in a dashboard that is authenticated on every request.

## Consequences

- The REST surface is complete for writes and deliberately partial for reads. The README must say so plainly, because a reviewer will otherwise read the missing read endpoints as an oversight.
- Reads depend on RLS for authorisation rather than on handler code, which is only sound because [ADR-0001](./0001-rbac-via-jwt-claim-and-rls.md) makes the database the authoritative check.
