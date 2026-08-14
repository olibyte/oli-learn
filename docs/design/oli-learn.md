# Oli-Learn — brand and UI spec

Everything a build session needs to apply the rebrand without re-deciding anything.
Values here are operative; the reasoning behind each lives in the ticket linked at the
end of its section, and the working prototype code lives on the `prototype/oli-learn-*`
branches.

**Status**: built. Section 9's dark-mode value pills remain deliberately open.

Two things were resolved during the build rather than followed:

- **The footer names the zone, not an abbreviation** (§4's copy table said "AEST").
  Melbourne is AEDT from roughly October to April, and deriving the current
  abbreviation means reading the clock during render, which Cache Components rejects
  as an unstable value. Individual times still carry the abbreviation for their own
  instant, which is where it disambiguates something.
- **The landing hero ships at `text-4xl sm:text-5xl`**, which is what was judged and
  captured, rather than §2's general scale ending in `md:text-6xl`. In the split
  layout that applies to a ~560px column and pushes the credentials card down — the
  failure that eliminated layout A.

`--amber` was added to §1's block: §3 needs two theme-dependent amber values and §1
had no name for them. The values are §3's, unchanged.

---

## 1. Colour tokens

Bright blue carries every action; **amber is emphasis only** — the wordmark's second
syllable and the landing page's value pills, nowhere else. The application ground is
white; the blue-tinted ground survives as `--wash`, for marketing surfaces only.

Replace the token block in `app/globals.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 213 60% 14%;
  --wash: 213 100% 98%;
  --card: 0 0% 100%;
  --card-foreground: 213 60% 14%;
  --popover: 0 0% 100%;
  --popover-foreground: 213 60% 14%;
  --primary: 213 88% 43%;
  --primary-foreground: 0 0% 100%;
  --secondary: 213 45% 95%;
  --secondary-foreground: 213 60% 20%;
  --muted: 213 45% 95%;
  --muted-foreground: 213 22% 40%;
  --accent: 38 95% 90%;
  --accent-foreground: 27 85% 25%;
  --destructive: 0 72% 40%;
  --destructive-foreground: 0 0% 100%;
  --border: 213 32% 82%;
  --input: 213 32% 82%;
  --ring: 213 88% 43%;
  --status-scheduled-bg: 213 92% 92%;
  --status-scheduled-fg: 213 88% 30%;
  --status-completed-bg: 160 60% 90%;
  --status-completed-fg: 162 88% 22%;
  --status-cancelled-bg: 213 25% 92%;
  --status-cancelled-fg: 213 20% 35%;
  --radius: 0.5rem;
}

.dark {
  --background: 213 50% 10%;
  --foreground: 210 40% 96%;
  --wash: 213 55% 8%;
  --card: 213 45% 13%;
  --card-foreground: 210 40% 96%;
  --popover: 213 45% 13%;
  --popover-foreground: 210 40% 96%;
  --primary: 211 92% 62%;
  --primary-foreground: 213 60% 10%;
  --secondary: 213 35% 18%;
  --secondary-foreground: 210 40% 96%;
  --muted: 213 35% 18%;
  --muted-foreground: 213 22% 72%;
  --accent: 30 55% 22%;
  --accent-foreground: 38 95% 76%;
  --destructive: 0 75% 68%;
  --destructive-foreground: 0 60% 12%;
  --border: 213 30% 24%;
  --input: 213 30% 24%;
  --ring: 211 92% 62%;
  --status-scheduled-bg: 213 60% 22%;
  --status-scheduled-fg: 211 92% 80%;
  --status-completed-bg: 162 45% 18%;
  --status-completed-fg: 158 70% 72%;
  --status-cancelled-bg: 213 25% 20%;
  --status-cancelled-fg: 213 18% 70%;
}
```

Every pair passes WCAG AA in both themes; the prototype recomputes the ratios in the
browser so the claim cannot drift. Two consequences that must survive the port:

- The ghost **Cancel** button reaches 6.95:1 light / 5.57:1 dark. It was 3.8:1.
- A cancelled row is `text-muted-foreground` + `line-through`. **Never `opacity-55`** —
  that is what put every element in the row below AA.
- A white card on `--wash` separates at only 1.05:1, so cards on the wash need borders.
- `--chart-1`…`--chart-5` are unused: delete rather than recolour.

→ [#18](https://github.com/olibyte/oli-learn/issues/18) · branch `prototype/oli-learn-tokens`

## 2. Typography

```ts
import { Geist, Outfit } from "next/font/google";

const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });
```

No `weight` array — Outfit is variable, so naming weights is byte-identical to taking the
whole range. No `display` — `swap` is already the default.

| | |
|---|---|
| Hero, wordmark | Outfit **700** |
| Section headings | Outfit **600** |
| Everything else | Geist |
| Tracking | `tracking-tight` at `text-3xl`+ only |
| Hero scale | `text-4xl` → `sm:text-5xl` → `md:text-6xl`, `leading-[1.08]` |
| Numerals | `tabular-nums` on tiles and table dates |

Outfit has **no italic**; a supporting line that wants one uses Geist.

→ [#19](https://github.com/olibyte/oli-learn/issues/19) · branch `prototype/oli-learn-type`

## 3. Wordmark and icons

`Oli-Learn`, Outfit 700, `tracking-tight`. `Oli-` (hyphen included) in `--primary`;
`Learn` in the large-text amber `33 95% 40%` light / `38 95% 68%` dark.

**The size rule is the component's job, not the caller's:**

| size | treatment |
|---|---|
| `text-xl` and above | two-tone — amber is large text, 3:1 applies, it passes at 3.66:1 |
| `text-lg` and below | **single ink**, all `--primary` — amber would need 4.5:1 and fails |

One component replaces the hard-coded strings in `components/site-header.tsx` and
`components/site-footer.tsx`. No mark beside the wordmark in the header.

The compact form is the **`OL` monogram tile**, white Outfit 700 on `--primary`. A glyph
tile was tested and rejected: illegible at 16px.

Assets are built and committed on `prototype/oli-learn-social` under
`app/prototype/social/assets/`:

| file | size | destination |
|---|---|---|
| `opengraph-image.png` | 1200×630 | `app/opengraph-image.png` |
| `icon.png` | 512×512 | `app/icon.png` |
| `apple-icon.png` | 180×180 | `app/apple-icon.png` |

Regenerate from `/prototype/social/capture?variant=B` if the hero copy changes. Two traps
if you do: hide `nextjs-portal` (Next's dev indicator is a real DOM element and bakes
itself in), and make the viewport taller than 630px or the capture gets a white band.

Metadata:

```ts
export const metadata: Metadata = {
  title: "Oli-Learn — consultation booking",
  description:
    "Students book and manage their own consultations. Administrators see every consultation in the system.",
};
```

`app/opengraph-image.alt.txt` → `Oli-Learn: consultation booking for students and administrators.`

→ [#21](https://github.com/olibyte/oli-learn/issues/21), [#22](https://github.com/olibyte/oli-learn/issues/22) · branches `prototype/oli-learn-wordmark`, `prototype/oli-learn-social`

## 4. Landing page

Hero left, demo-access card right, **both above the fold** → value pills with
one-line bodies → role explainer in a bordered card → footer. Sticky header at every
size; at 375px the hero stacks above the card, CTAs go full width, pills wrap. No
hamburger.

- **Blue** carries the hero accent. Amber at headline size reads rust, because AA forces
  it to its dark step.
- Icons: `CalendarPlus`, `CalendarClock`, `Eye` for the values; `GraduationCap`,
  `ShieldCheck` for the roles. All `size-5` in `--primary`.
- The poster's geometry appears as **exactly one** faint ring at `border-primary/10`,
  bleeding off the hero edge, never in front of content.
- CTAs: "Create account" primary, "Sign in" beside it.

The full string-by-string copy table is in `DECISION.md` on the branch — hero, subhead,
credentials card, three pills with bodies, two role lines, footer.

**That card's copy has since changed twice, its position never.** It stopped printing
credentials in [#31](https://github.com/olibyte/oli-learn/issues/31) — the repo and the
domain are public — and stopped addressing a reviewer in
[#47](https://github.com/olibyte/oli-learn/issues/47), which is why the deployed page
no longer says anywhere what it is. The slot beside the hero and the explicit border
are both still what §4 and #23 decided, and for the reasons they gave.

→ [#23](https://github.com/olibyte/oli-learn/issues/23) · branch `prototype/oli-learn-landing`

## 5. Dashboards

**Student**: heading → a **Next up** card carrying the next consultation's date, time,
zone and its two actions → a thin row of three counts → the list.

**Admin**: heading → "Newest first, 25 per page. Cancelled consultations stay listed." →
the list → pager. **No tiles and no totals** — the view is keyset-paginated at 25 rows, so
any system-wide count would need a query it does not make, and an exact count over an
RLS-filtered table is a full scan. This is a deliberate reduction from the original sketch.

- `upcoming` = `status === 'scheduled'` **and** `scheduled_at` in the future. Both halves.
- A still-scheduled row whose time has passed falls outside all three counts. That gap is
  handled by a sentence, not a fourth number: *"N scheduled consultations have already
  passed — mark them complete, or cancel."*
- Tiles are **never interactive**: there is no filtered view to navigate to.
- Status pills use the `--status-*` pairs. Below `md`, rows become cards.
- Empty state (student only): amber `CalendarPlus` circle, "No consultations yet", a line
  saying bookings are reversible, primary CTA.

→ [#24](https://github.com/olibyte/oli-learn/issues/24) · branch `prototype/oli-learn-dashboards`

## 6. Time

One institutional clock — `Australia/Melbourne` — with **both zone and locale pinned**
(`en-AU`) at every call site, and every displayed time labelled with its zone. Booking's
`datetime-local` stays in the viewer's clock, with a live echo showing the institutional
equivalent.

Node and Chrome were verified to produce byte-identical output for this locale and zone,
which is why the admin view keeps zero client JS — and why `suppressHydrationWarning`
stays, now guarding against future ICU drift.

→ [ADR-0004](../adr/0004-institution-time-zone-is-authoritative.md) · [#20](https://github.com/olibyte/oli-learn/issues/20)

## 7. Deletions the rebrand owes

Nothing breaks if these are missed, which is exactly why they are listed:

- `app/favicon.ico` — Next's default from the initial commit; it outranks `icon.png` in
  some browsers.
- The `metadataBase` block at `app/layout.tsx:6-11` — its `VERCEL_URL` fallback is worse
  than Next's own, which prefers the stable `VERCEL_PROJECT_PRODUCTION_URL`.
- `--chart-1`…`--chart-5` from `globals.css`.
- `app/twitter-image.png` is **not** recreated: `twitter.images` auto-fills from
  `openGraph.images`.

## 8. Build order

Tokens → type → wordmark component → header/footer → landing → dashboards → assets and
metadata → deletions. Each step is independently visible, so the branch stays reviewable.

Ships as **one PR, merged not squashed**, with those steps as separate commits.

## 9. What this spec does not cover

Ruled out of scope: admin filtering/sorting/pagination, any courses-or-lessons model,
notification or email design, marketing pages beyond `/`, and motion work.

Left open deliberately: in dark mode the landing page's value pills use `--accent`
(`30 55% 22%`), which reads olive-brown against navy. It passes at 7.37:1, so it is taste
rather than defect — and it is a token question, which was already closed.
