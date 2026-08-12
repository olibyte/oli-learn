# Ticket #23 — decision

**Layout B — Split. Blue hero accent. "Create account" primary, "Sign in" beside it.**

Judged on 2026-08-13 at 1280px and 375px, light and dark. Reference captures in
`./assets/` (`landing-desktop.png`, `landing-desktop-dark.png`, `landing-375.png`),
taken from `?bare=1`, which drops the prototype banner.

## The layout

Hero left, demo-credentials card right, **both above the fold** — then value pills with
one-line bodies, then a role explainer in a bordered card, then the footer.

- **A — Pitch** was rejected on evidence rather than taste: with a full-height hero on
  the wash, the credentials card lands *below the fold* at 900px and straddles the wash
  boundary. The anatomy agreed at charting put credentials high on the page; A is the
  conventional shape that quietly fails that.
- **C — Door** — two role panels, each with its own account and a "Sign in as…" button —
  is the most efficient for a reviewer and barely a landing page. It also carries hidden
  scope: those buttons imply they prefill the login form, which means teaching
  `/auth/login` to accept `?email=`. Out of scope for this map.

## The accent rule

**Blue carries the hero.** AA forces amber down to its dark step (`33 95% 40%`), which at
headline size reads rust rather than gold. Blue also matches the social card already
generated in #22.

**Amber stays rare**: the wordmark's `Learn`, and the value pills. Nothing else. That is
what keeps it reading as an accent rather than a second brand colour.

## Copy — the whole inventory

| slot | string |
|---|---|
| Hero | **Book time with a tutor, _when it actually helps_.** |
| Subhead | Students book and manage their own consultations. Administrators see every consultation in the system. |
| Primary CTA | Create account → `/auth/sign-up` |
| Secondary CTA | Sign in → `/auth/login` |
| Credentials heading | Try it without signing up |
| Credentials subhead | Two demo accounts, one for each role. |
| Pill 1 | Book in minutes |
| Body 1 | Pick a time, say why you need it, done. No email threads, no waiting for a reply. |
| Pill 2 | Change your mind |
| Body 2 | Reschedule or cancel from the same list. Nothing is deleted — a cancelled consultation stays visible. |
| Pill 3 | Oversight built in |
| Body 3 | Administrators see every consultation across the system, read-only, without touching a student's booking. |
| Role 1 | **Students** — Sign in, book a consultation, and mark it complete once it has happened. |
| Role 2 | **Administrators** — Sign in and see every consultation in the system, across every student. |
| Footer | wordmark + "— consultation booking" · "All times shown in AEST." |

The hero string is the same one baked into the social image, and it did not change — so
**`opengraph-image.png` does not need regenerating**.

## Iconography

Lucide, three glyphs, one per value: `CalendarPlus`, `CalendarClock`, `Eye`. The role
explainer uses `GraduationCap` and `ShieldCheck`. All at `size-5`, in `--primary`.

The poster's geometry is reproduced as **one** faint concentric ring bleeding off the
hero's edge at `border-primary/10` — never in front of content, never more than one per
page. More than that reads as decoration for its own sake.

## Responsive

At 375px the hero stacks above the credentials card, both CTAs go full width, and the
value pills wrap. The header keeps the wordmark plus both actions at that width — tight
but intact, so no hamburger is needed. The header stays sticky at every size.

## Known refinement, not a blocker

In dark mode the value pills use `--accent` (`30 55% 22%`), which reads olive-brown
against the navy. It passes contrast at 7.37:1, but a future pass may want a bluer chip.
Recorded rather than fixed, because it is a token question and #18 is closed.
