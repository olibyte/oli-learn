# Ticket #22 — decision

**Social card: B — Product. One image file. One icon. Favicon deleted.**

Judged on 2026-08-13 with all three cards rendered at exactly 1200×630 — the size the
file ships at — so what was judged is what was captured.

## The assets

`./assets/` holds the real files, produced by the same route that was judged
(`/prototype/social/capture?variant=…`):

| file | size | destination |
|---|---|---|
| `opengraph-image.png` | 1200×630, 76 KB | `app/opengraph-image.png` |
| `icon.png` | 512×512, 8 KB | `app/icon.png` |
| `apple-icon.png` | 180×180, 3 KB | `app/apple-icon.png` |

These are references, not the shipped files — this map is spec-only. The build session
copies them in (or regenerates them from the capture route, which is why the route is
committed alongside them).

## Why B

Wordmark and headline left, a fragment of the real dashboard right. It is the only card
where a reviewer sees the *product* before clicking, which is the card's actual job on a
graded take-home. The rows carry `9:30 am AEST`, so the image also quietly demonstrates
the timezone decision from ADR-0004.

- **A — Identity** (monogram, wordmark, one line) reads at any thumbnail and says nothing
  about what the thing is. Best-ageing, least useful here.
- **C — Statement** is the poster's voice — huge two-tone headline, wordmark in the
  corner, the one borrowed geometric ring. Boldest and most legible at small sizes, but
  it shows nothing of the product.

Known limitation of B: at Slack-thumbnail scale the table text is illegible. The shapes
still read as "an application", which is the part that matters at that size.

## The three smaller calls

- **One image file.** `twitter.images` auto-fills from `openGraph.images` (established in
  ticket #17), so `app/twitter-image.png` does **not** come back. A Twitter-specific crop
  would be a second file to maintain for no gain.
- **One icon, not a light/dark pair.** The monogram tile carries its own blue ground, so
  it holds against both browser chromes — the gallery shows it on white and near-black at
  16/32/48/180.
- **Delete `app/favicon.ico`.** It is still Next's default from the initial commit
  (`d4fdf8d`) and takes precedence over `icon.png` in some browsers, so leaving it would
  silently keep the starter favicon.

## Metadata that ships with them

```ts
export const metadata: Metadata = {
  title: "Oli-Learn — consultation booking",
  description:
    "Students book and manage their own consultations. Administrators see every consultation in the system.",
};
```

`app/opengraph-image.alt.txt`:

```
Oli-Learn: consultation booking for students and administrators.
```

And per ticket #17, **delete the `metadataBase` block** at `app/layout.tsx:6-11` — its
`VERCEL_URL` fallback is worse than Next's own, which prefers the stable
`VERCEL_PROJECT_PRODUCTION_URL`.

## Two capture traps, since the build session may regenerate these

1. **Next's dev-tools indicator is a real DOM element** (`nextjs-portal`). An
   element-scoped screenshot bakes it into the image. The capture route hides it.
2. **An element taller than the viewport captures with a white band** where the unrendered
   region was. The browser viewport must exceed 630px before capturing the card.

## Left for the landing page

The card's headline — "Book time with a tutor, when it actually helps" — is the same
string the hero uses. [Ticket #23](https://github.com/olibyte/with-supabase-app/issues/23)
owns the final copy; if it changes there, this image is regenerated, not left to drift.
