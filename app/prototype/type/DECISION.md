# Ticket #19 — decision

**Winner: Outfit**, variable, headings only. Geist stays for body and UI.

Judged in the browser on 2026-08-12 across four faces on the app's real strings —
hero, dashboard headings, stat-tile numerals, table headers, dates and times — with
the A′ palette from ticket #18 applied.

## The configuration

```ts
import { Geist, Outfit } from "next/font/google";

const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });
```

No `weight` array: Outfit is variable, and per ticket #17 naming weights on a variable
family is byte-identical to taking the whole range. No `display` either — `swap` is
already the default.

## The rest of the decision

| | |
|---|---|
| **Hero and wordmark** | Outfit **700** |
| **Section headings** (`Your consultations`, `All consultations`) | Outfit **600** |
| **Everything else** | Geist, unchanged |
| **Tracking** | `tracking-tight` at `text-3xl` and above only; default below. Outfit is loose at display sizes and correct at UI sizes |
| **Hero scale** | `text-4xl` → `sm:text-5xl` → `md:text-6xl`, `leading-[1.08]` |
| **Page headings** | `text-3xl`; sub-sections `text-2xl` / `text-xl` |
| **Numerals** | `tabular-nums` on stat tiles and on table dates/times — already the app's habit |

## The italic question, answered

The ticket asked whether the poster's italic supporting line is worth reproducing.
**It isn't available**: Next's own font metadata
(`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`) lists Outfit
as `styles: ['normal']` — there is no italic, so any italic heading would be a synthetic
oblique. Geist *does* ship a true italic, so if a supporting line ever wants one it uses
the body face. Nothing is lost: the poster's italic reads dated outside a poster.

## Why not the others

Measured from the emitted `@font-face` rules and the files on disk, all four loaded at
once:

| face | files | emitted | fetched on a latin page |
|---|---|---|---|
| **Outfit** | 2 | 45.9 KB | **~31.5 KB** (one variable file) |
| Figtree | 2 | 29.7 KB | ~19.7 KB |
| Nunito Sans | 5 | 104.8 KB | ~30.2 KB |
| Poppins | 9 | 154.1 KB | **~115 KB** (three static weights) |

- **Poppins** is the truest match to the poster and the only candidate with no variable
  version on Google Fonts, so three weights are three downloads — roughly 3.7× Outfit's
  transfer for the same silhouette. It is also wider, costing real horizontal space in
  the hero.
- **Figtree** is the cheapest and the closest to Geist — close enough that the second
  family stops earning its bytes. If the heading doesn't read as different from the
  body, don't ship two fonts.
- **Nunito Sans** is the warmest and the least like the reference: a deliberate move
  away from the poster rather than toward it.

Outfit gets the poster's geometry at roughly a quarter of Poppins's transfer, and is
unmistakably not Geist.

## Consequences

- **#21 (wordmark)**: the lockup is Outfit 700. Its letterforms were checked at
  `text-base` through `text-5xl` in this prototype and hold at all four.
- **#22 (social image)**: the committed PNG must be rendered in Outfit 700 to match the
  header. (Moot for `ImageResponse`, which was ruled out in #17 — it cannot consume the
  self-hosted woff2 anyway.)
- **#23 / #24**: the scale and weight rules above are the ones to build against.
