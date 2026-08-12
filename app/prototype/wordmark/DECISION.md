# Ticket #21 — decision

**Wordmark: A — hyphenated two-tone. Compact form: the "OL" monogram tile. No mark
in the header.**

Judged on 2026-08-12 across three lockup strategies, each rendered in every place it
has to work: header, footer, auth card, social crop, and favicon sizes down to 16px.

## The lockup

`Oli-Learn`, Outfit 700, `tracking-tight`. **`Oli-`** (including the hyphen) in
`--primary`; **`Learn`** in the large-text amber `33 95% 40%` (light) / `38 95% 68%`
(dark).

The name keeps its hyphen, so `CONTEXT.md` needs no amendment — the mark spells the
name the way the glossary does. That was the deciding argument against variant B: a
closed `OliLearn` logotype would have made the brand and the glossary disagree, and the
camel-case split only duplicates work the hyphen already does.

## The size rule — this is the part that is easy to get wrong

WCAG counts bold text as **large** from 18.66px, where 3:1 is enough. Outfit 700 reaches
that at `text-xl` (20px). The amber is 3.66:1, so:

| size | | |
|---|---|---|
| `text-xl` and above | **two-tone** | amber is large text, 3:1 applies — passes at 3.66:1 |
| `text-lg` and below | **single ink**, all `--primary` | amber would need 4.5:1 and fails; blue passes at 5.63:1 light / 6.20:1 dark |

So the header (`text-xl`) and hero are two-tone; the footer (`text-sm`) is solid blue.
It still reads as the brand, and it is legal.

## The compact form

**The "OL" monogram, not a glyph.** In the favicon strip the `GraduationCap` tile is an
unreadable blob at 16px and weak at 24px; the monogram is crisp at all four sizes. White
letters on `--primary` is 5.63:1.

That makes the glyph question moot — no `GraduationCap`, `CalendarCheck` or anything
else is needed for the identity. Icons still appear inside the product (stat tiles,
empty states), but they are not the mark.

**No mark in the header.** A two-tone wordmark already carries the colour; adding the
tile beside it duplicates the signal and competes with the Sign in button. The tile's
job is the favicon, the app icon, and any square crop.

## Where it lives in the code

One component, used by both bars — replacing the hard-coded `"Mini-LMS"` strings in
`components/site-header.tsx:22` and `components/site-footer.tsx:7`:

```tsx
// components/oli-learn-wordmark.tsx
export function Wordmark({ size = "xl" }: { size?: "sm" | "base" | "xl" | "3xl" | "5xl" }) {
  // two-tone at xl and above; single ink below — see the size rule
}
```

The monogram belongs beside it as `<Monogram />`, used for the icon files rather than in
the page.

## Consequences

- **#22 (favicon and social image)**: the favicon is the monogram tile at 16/32/48 and
  the apple icon at 180. The social PNG uses the full two-tone lockup, which is large
  enough to be legal.
- **#23 (landing)**: hero lockup two-tone; header `text-xl`.
- **#24 (dashboards)**: nothing new — they inherit the header.
