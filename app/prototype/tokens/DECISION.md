# Ticket #18 — decision

**Winner: A′ — variant A ("Poster") with variant C's white application ground.**

Judged in the browser on 2026-08-12 against the sample surface in this directory, in both themes.

## What was chosen

Variant A's palette: bright blue carries every action, amber is emphasis only — the
wordmark's second syllable, the value pills, nothing else. Two amendments taken from
variant C:

1. `--background` is **white**, not blue-tinted. On the dashboard, A's tinted ground
   fought the table; C's white ground let the rows read.
2. The blue-tinted ground survives as its own token, `--wash`, for marketing surfaces —
   the landing hero band and any empty state that wants a lift.

## Why not the others

- **B — Amber action** was ruled out on evidence, not taste. Amber cannot carry white
  text at 4.5:1, so promoting it to the action colour drags it down to `#a64f07` — rust
  brown. Every primary button and the hero heading came out terracotta. The idea is
  sound and the execution is not available at AA.
- **C — Ink & signal** made a good admin skin but set `--primary` to near-black navy,
  leaving the wordmark with no second colour and no brand.

## Verified

All 21 pairs pass in light and 21 in dark, recomputed in the browser from the tokens
themselves (see the contrast tables on the prototype page, and `contrast.mjs` here).
Two results worth carrying forward:

- The ghost **Cancel** button reaches 6.95:1 light / 5.57:1 dark. It was 3.8:1.
- The **cancelled row** is an explicit `--muted-foreground` plus `line-through`, not
  `opacity-55`. Every element in the row now sits at 6.10:1 light / 8.01:1 dark.

One honest caveat: a white `--card` on `--wash` separates at only **1.05:1**. Cards on
the landing wash must carry a border; they cannot rely on the fill alone.

## Notes for later tickets

- **#21 (wordmark)**: the pill amber `27 85% 25%` is too dark to read as amber in a
  wordmark, and bright amber fails as body text on light. But a wordmark is *large*
  text, which needs only 3:1 — and `33 95% 40%` (`#c77005`) clears it on white (3.66:1),
  on the wash (3.47:1) and on navy (4.87:1). One amber, both themes.
- **#24 (dashboards)**: status colours are settled here — scheduled blue, completed
  green, cancelled slate, each as a bg/fg pair.
- The `destructive` button variant hard-codes `text-white` and `dark:bg-destructive/60`,
  bypassing `--destructive-foreground`. The composite still passes (6.95:1 / 5.92:1), so
  this is a tidiness note for the spec, not a defect.

## Final tokens

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

The old `--chart-1`…`--chart-5` tokens are unused by this app and should be dropped
rather than recoloured.
