# Ticket #24 — decision

**Student: C — "Next up" card, three counts, and a nudge. Admin: no tiles, no totals.**

Judged on 2026-08-13 at 1280px and 375px, light and dark, with the empty state.
Reference captures in `./assets/` (they include the prototype's own chrome bar at the
top — that is the switcher, not the design).

## Student dashboard

Heading, then a **Next up** card carrying the next consultation's date, time, zone and
its two actions — then a thin row of three counts, then the list.

It answers "when am I next in?" before "how many have I had?", and it costs less vertical
space than three tiles while carrying more. Tiles (A) were the conventional option;
the inline summary (B) was densest and least distinctive.

Tiles are **never interactive** in any variant — there is no filtered view to navigate
to, and a tile that looks clickable promises one that does not exist.

## Admin view: no tiles, and why

`app/protected/admin/page.tsx:22` paginates by keyset at 25 rows — that is what the
`(scheduled_at desc, id desc)` index exists for. **A page of 25 rows knows nothing about
the system totals**, so the charting sketch's "same tiles, system-wide" was not free:
it needed either `count: "exact"` on the same query (an exact count over an RLS-filtered
table is a full scan) or a second aggregate query.

The admin view is a paginated log, so it says what it is instead:

> Newest first, 25 per page. Cancelled consultations stay listed.

This is a deliberate reduction from the charting sketch, taken with the scalability
criterion in mind rather than by omission. It also keeps the view's zero-client-JS
character intact (ADR-0002, ADR-0004).

## "Upcoming" — the definition, and the hole it leaves

**Upcoming = `status === 'scheduled'` AND `scheduled_at` is in the future.** Both halves
are required; counting every `scheduled` row as upcoming is the obvious way to get this
wrong.

That leaves a real gap: a consultation still `scheduled` whose time has passed is neither
upcoming, completed, nor cancelled — so the three counts do not sum to the row count.
Rather than a fourth count, the gap becomes the most actionable line on the page:

> **Scheduled** · 1 scheduled consultation has already passed — mark it complete, or cancel.

Four counts would be a wall of numbers; the sentence tells someone to *do* something.
The prototype's fixtures include this row on purpose so the state is visible.

## Status, rows, and the cancelled treatment

- Status pills use the tokens from #18 — scheduled blue, completed green, cancelled slate.
  The cancelled pill is deliberately the quietest of the three.
- A cancelled row is `text-muted-foreground` plus `line-through` — **never `opacity-55`**,
  which is what put every element in that row below AA.
- Below `md` the rows become cards, matching the precedent already set in the app.
- Dates carry their zone: `14 Aug 2026 9:30 am AEST`, formatted with zone and locale
  pinned per ADR-0004, and the abbreviation read from the formatter rather than
  hard-coded.

## Empty state

An amber circle with `CalendarPlus`, "No consultations yet", one line that also tells the
student bookings are reversible ("nothing you book is set in stone"), and a primary CTA.
Only the student view has one; an admin seeing an empty system is not a state worth
designing for here.

## Copy

| slot | string |
|---|---|
| Student heading | Your consultations |
| Student instruction | Book a time, reschedule it, or mark it complete once it has happened. |
| Admin heading | All consultations |
| Admin instruction | Every consultation in the system, across every student. Read-only. |
| Admin page note | Newest first, 25 per page. Cancelled consultations stay listed. |
| Empty heading | No consultations yet |
| Empty body | Book one and it appears here. You can reschedule or cancel it later — nothing you book is set in stone. |
| Empty CTA | Book your first consultation |
| Nudge | *N* scheduled consultation(s) has/have already passed — mark it/them complete, or cancel. |
