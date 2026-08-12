# One institutional clock is authoritative for display, and every renderer pins it

`scheduled_at` is `timestamptz`, so the *instant* was never in doubt. What was in doubt is the wall-clock time each viewer is shown, and the two dashboards disagreed: the student's list formats in the browser's zone, while the admin view — a pure Server Component — formatted in the server's, which is UTC on Vercel. The same consultation therefore read as two different times depending on who opened it.

Every consultation is now displayed in **one institutional zone**, `Australia/Melbourne`, with **both the zone and the locale pinned** at every call site: `Intl.DateTimeFormat("en-AU", { timeZone: INSTITUTION_TIME_ZONE, … })`. The zone is a single exported constant in `lib/time.ts`, not an environment variable. Times are labelled with the zone wherever they are shown.

Booking is the deliberate exception. `<input type="datetime-local">` continues to mean *the viewer's own clock*, with a live echo underneath showing the institutional equivalent.

## Considered Options

- **The viewer's own zone everywhere**, making the admin's time cell a client component. Rejected, though it is by far the cheapest: it makes each viewer's reading internally consistent but leaves student and admin still reading different wall-clock times for one consultation, so "9:30" is never a shared reference between the two people discussing it.
- **UTC everywhere with an explicit label.** Rejected as honest and hostile: nobody books a tutoring session in UTC.
- **A per-row timezone column.** Rejected as modelling a second campus that does not exist. The scope is one institution running one-to-one consultations; the zone is a presentation constant, not domain vocabulary, and `CONTEXT.md` gains no term. This assumption is worth revisiting the day a second location appears.
- **Making the booking input mean institution time.** Rejected: it needs a zone-aware naive-string→instant conversion, and that conversion has real DST edge cases twice a year — times that never occur and times that occur twice. Keeping the input in the browser's zone leaves that problem with the browser, where it is already solved.

## Consequences

- **Rendering is deterministic**, which is the reason the admin view can stay a pure Server Component with no client JavaScript. The previous formatting was non-deterministic only because `undefined` asks each runtime for its own defaults; naming the locale and zone removes the ambiguity. See ADR-0002.
- Node and Chrome were checked and produce byte-identical output for this locale and zone — `9:30 am`, with an ordinary space. That is a property of today's ICU, not a guarantee: ICU 72 changed the space before `am`/`pm` to U+202F, and a future runtime could diverge again. `suppressHydrationWarning` therefore **stays** on the client-rendered times, with its comment rewritten — it now guards against ICU drift rather than marking intentional divergence.
- A student outside the institution's zone books in their own clock and reads back the institution's. The echo under the input is what makes that legible rather than surprising, so it is part of the decision, not decoration.
- Every displayed time carries its zone label, which also means a screenshot in the README is unambiguous about what it shows.
