# Fonts, favicons and social images in Next 16.3.0

Research for issue #17. Every claim below is sourced from the copy of Next.js installed in this
repo — `node_modules/next/dist/docs/` for documentation and `node_modules/next/dist/` for the
shipped implementation — plus measurements taken against this repo's own `.next` build output.
Nothing here is from recall. `node_modules/next/package.json` reports `"version": "16.3.0"`.

Paths are relative to the repo root. Where the docs and the implementation disagree, the
implementation is treated as authoritative and the disagreement is called out.

---

## 1. A second `next/font/google` family beside Geist

### The API did not change in 16

This is the first and most useful negative result. `next/font` is **unchanged** since 13.2. The
"Version Changes" table at the bottom of the font reference
(`node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md:1063-1068`) lists only
two rows — `v13.2.0` (renamed from `@next/font`) and `v13.0.0` (introduced) — and the Next 16
upgrade guide (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`) contains no
`next/font`, `font/google` or `localFont` section at all. Whatever you know about `next/font` from
Next 13-15 still applies verbatim. The `AGENTS.md` warning is real for other APIs (see §2 and §4),
but not for this one.

### The current idiom for two families

Call both loaders at module scope, give each a `variable`, and put both `.variable` class names on
one element. The documented example is at
`node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md:743-772`:

```tsx
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
const roboto_mono = Roboto_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-roboto-mono' })

<html lang="en" className={`${inter.variable} ${roboto_mono.variable} antialiased`}>
```

`font.md:739` explicitly permits either `<html>` or `<body>` for the variable class names. This
repo currently applies `geistSans.className` to `<body>` (`app/layout.tsx:30`), which is the
*other* application method (`font.md:878-884`) and does not expose a CSS variable even though
`variable: "--font-geist-sans"` is passed at `app/layout.tsx:18` — the variable is only defined on
elements that carry `geistSans.variable`. Moving to two families means switching to the variable
method for both.

Concretely, for this repo:

```tsx
// app/layout.tsx
import { Geist, Fraunces } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  weight: "700",          // single static instance — see the byte table below
  subsets: ["latin"],
});

// ...
<html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${display.variable}`}>
  <body className="antialiased">
```

### Wiring it to Tailwind — this repo is Tailwind v3, not v4

`font.md:830-839` shows the Tailwind **v4** form (`@theme inline { --font-sans: var(--font-inter) }`)
and `font.md:841-863` shows the **v3** form (`theme.extend.fontFamily` in `tailwind.config.js`).
This repo is on v3 — `package.json` pins `"tailwindcss": "^3.4.1"` and `app/globals.css:1-3` uses
the `@tailwind base/components/utilities` directives — so use the v3 form in
`tailwind.config.ts`:

```ts
theme: {
  extend: {
    fontFamily: {
      sans: ["var(--font-geist-sans)", ...],
      display: ["var(--font-display)", ...],
    },
  },
}
```

Copying the `@theme inline` block from the docs into this repo would silently do nothing.

### `display`, `subsets`, `weight` for a headings-only face

**`display`** — leave it off. The default is already `'swap'`, hard-coded in the validator:
`node_modules/next/dist/compiled/@next/font/dist/google/validate-google-font-function-call.js:12`
destructures `display = 'swap'`. The docs agree (`font.md:174`). The explicit
`display: "swap"` at `app/layout.tsx:19` is a no-op; harmless, but it is not doing what it looks
like it is doing.

**`subsets`** — required in practice, and it does **not** mean what the name suggests.

- It is required whenever `preload` is true (the default). Omitting it is a hard build error, not a
  warning: `validate-google-font-function-call.js:29-32` calls `nextFontError` with
  *"Preload is enabled but no subsets were specified for font ..."*
  (`validate-google-font-function-call.js:29`).
- It controls **preloading only, not downloading**. The Google Fonts URL Next builds carries no
  subset parameter at all — see `getGoogleFontsUrl` in
  `node_modules/next/dist/compiled/@next/font/dist/google/get-google-fonts-url.js:44-53`, which
  produces e.g. `https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap`. The
  loader then downloads **every** `@font-face` source in that response
  (`.../google/loader.js:102-129`) and only marks the ones whose subset comment matches your
  `subsets` array for preloading (`.../google/find-font-files-in-css.js:9-31`). The emitted
  filename records the decision: `.p` in the name means preloaded
  (`node_modules/next/dist/build/webpack/loaders/next-font-loader/index.js:66-77`).

You can see this in this repo's existing build. `Geist({ subsets: ["latin"] })` produced five
`.woff2` files in `.next/static/media`, only one of which carries `.p`:

| file | bytes | subset |
| --- | --- | --- |
| `caa3a2e1cccd8315-s.p.0wgildi0cnwt9.woff2` | 29,288 | latin (**preloaded**) |
| `7178b3e590c64307-s.21jp631_3pja2.woff2` | 16,540 | latin-ext |
| `8a480f0b521d4e75-s.1qq4vpdcun5oj.woff2` | 14,900 | cyrillic |
| `53b9e256198e5412-s.390ncx5urfkfu.woff2` | 7,968 | vietnamese |
| `fef07dbb0973bf53-s.3p2_lha1f2xer.woff2` | 7,252 | cyrillic-ext |

(The `-s` suffix means a size-adjusted fallback is in use, same source lines.) The four
non-latin files are served but never fetched by a browser rendering Latin text, because the
`@font-face` blocks carry `unicode-range`. `subsets: ["latin"]` buys you the preload link, not a
smaller build.

**`weight`** — this is where the real decision is, and the intuitive answer is wrong.

Omitting `weight` on a variable family makes Next request the entire weight range as one file.
`validate-google-font-function-call.js:47-55` defaults `weights` to `['variable']` when no weight
is given, and `get-font-axes.js:41-46` turns that into `` `${min}..${max}` `` — hence
`Geist:wght@100..900` above.

### Byte cost, measured

Sizes below are the actual `Content-Length` of each `.woff2` Google serves for the URL Next builds,
fetched with the same modern-Chrome user agent Next uses
(`node_modules/next/dist/compiled/@next/font/dist/google/fetch-resource.js:22-27` pins
`Chrome/104.0.0.0` precisely so the response is woff2). The Geist row reproduces this repo's
committed build output byte-for-byte, which validates the method.

| declaration | URL Next requests | latin | latin-ext | other subsets | total emitted |
| --- | --- | ---: | ---: | ---: | ---: |
| `Geist({subsets:['latin']})` *(current)* | `Geist:wght@100..900` | 29,288 | 16,540 | 30,120 | 75,948 |
| `Fraunces({subsets:['latin']})` | `Fraunces:wght@100..900` | 36,560 | 33,640 | 11,536 | 81,736 |
| `Fraunces({weight:'700',...})` | `Fraunces:wght@700` | **18,288** | 17,672 | 6,268 | 42,228 |
| `Fraunces({weight:['400','700'],...})` | `Fraunces:wght@400;700` | 36,560 | 33,640 | 11,536 | 81,736 |
| `Playfair_Display({subsets:['latin']})` | `Playfair Display:wght@400..900` | 38,460 | 20,980 | 30,200 | 89,640 |
| `Playfair_Display({weight:'700',...})` | `Playfair Display:wght@700` | 23,316 | 13,052 | 18,072 | 54,440 |
| `Instrument_Serif({weight:'400',...})` | `Instrument Serif:wght@400` | 15,040 | 7,828 | — | 22,868 |

Two things worth internalising:

1. **A variable face costs roughly two static weights.** Fraunces variable latin is 36,560 bytes
   against 18,288 for a single pinned 700. For a face used only on headings, pinning one weight
   halves the over-the-wire cost of the thing users actually download.
2. **Asking for two weights of a variable family does not cost two files — it costs the variable
   file.** `Fraunces:wght@400;700` returns the *same* variable `.woff2` URL twice (once per
   `@font-face` block), and `find-font-files-in-css.js:24-25` de-duplicates by URL, so it is
   downloaded and emitted once. `weight: ['400','700']` is therefore byte-identical to the full
   variable range, not "two statics". If you want two weights of a display face, you are paying
   for the whole range whether you ask for it or not — so either pin exactly one weight, or just
   take the variable font and use the full range.

**Recommendation for a headings-only display face:** pin a single weight, take `latin`, let
`display` default.

```ts
const display = Fraunces({ variable: "--font-display", weight: "700", subsets: ["latin"] });
```

That adds ~18 KB to the preloaded critical path on top of Geist's existing ~29 KB.

### One build-time consequence

`next/font/google` fetches from `fonts.googleapis.com` and `fonts.gstatic.com` **during the build**
(`.../google/loader.js:86` and `:109`, over `node:https` in `fetch-resource.js`). In dev a failure
falls back to a local font after a 3 s timeout; in a production build it re-throws and fails the
build (`loader.js:148-172`). Adding a second family doubles the number of build-time network
dependencies. Worth knowing before CI runs on a locked-down network.

---

## 2. File-convention metadata in `app/`

### Accepted filenames and extensions

The authoritative list is `STATIC_METADATA_IMAGES` in
`node_modules/next/dist/esm/lib/metadata/is-metadata-route.js:4-47`, which matches the docs tables
at `.../03-file-conventions/01-metadata/app-icons.md:22-26` and
`.../01-metadata/opengraph-image.md:21-26`:

| convention | image extensions | code extensions | valid locations |
| --- | --- | --- | --- |
| `favicon` | `.ico` **only** | — (cannot be generated) | `app/` root only |
| `icon` | `.ico .jpg .jpeg .png .svg` | `.js .ts .tsx` | any segment |
| `apple-icon` | `.jpg .jpeg .png` | `.js .ts .tsx` | any segment |
| `opengraph-image` | `.jpg .jpeg .png .gif` | `.js .ts .tsx` | any segment |
| `twitter-image` | `.jpg .jpeg .png .gif` | `.js .ts .tsx` | any segment |
| `opengraph-image.alt` / `twitter-image.alt` | `.txt` | — | beside the image |

Details the tables don't state:

- **`favicon` is root-only and `.ico`-only**, enforced by a dedicated regex
  `/^[\\/]favicon\.ico$/` (`is-metadata-route.js:77`). `app-icons.md:171` also notes you cannot
  *generate* a favicon from code — use `icon.tsx` for that.
- **Numbered variants are single-digit.** `app-icons.md:64` says you can add "a number suffix";
  the matcher is `variantsMatcher = '\\d?'` (`is-metadata-route.js:109`), so `icon1.png` …
  `icon9.png` work and `icon10.png` does not.

### Sizes: Next reads them, it does not require them

There is no required size for any of these files. The build reads the image's intrinsic dimensions
and writes them into the tags:
`node_modules/next/dist/esm/build/webpack/loaders/next-metadata-image-loader.js:99-109` sets
`type` from the extension and either numeric `width`/`height` (og/twitter) or a `sizes` string
(icons), falling back to `sizes: 'any'` for SVG or when the size can't be determined.

The only enforced limits are file-size limits, and they **fail the build**:
`node_modules/next/dist/build/webpack/loaders/next-metadata-route-loader.js:74-96` injects a throw
if `twitter-image` exceeds 5 MB or `opengraph-image` exceeds 8 MB.

1200×630 is a convention, not a rule — it is simply what every example in
`opengraph-image.md` uses (e.g. `:104-107`). Likewise 180×180 for `apple-icon` is Apple's
convention, not Next's; Next will report whatever you give it.

### Docs vs. reality: the favicon `<head>` output

`app-icons.md:32-34` claims `favicon.ico` emits:

```html
<link rel="icon" href="/favicon.ico" sizes="any" />
```

What this repo's build actually emitted (`.next/server/app/index.html`) is:

```html
<link rel="icon" href="/favicon.ico?favicon.2vob68tjqpejf.ico" sizes="256x256" type="image/x-icon"/>
```

— a content-hash cache-busting query, the measured pixel size, and an explicit `type`. The doc's
snippet is stale. Anything asserting on the exact head output should assert against the build, not
the doc.

### The `.gif` trap — use PNG

`.gif` is accepted by the filename matcher for `opengraph-image`/`twitter-image`
(`is-metadata-route.js:29-46`) but is **not wired through the MIME layer**:

- `getContentType` in `next-metadata-route-loader.js:58-69` has branches for `png`, `jpeg`, `ico`
  and `svg` and otherwise returns `'text/plain'`. There is no `gif` branch.
- `imageExtMimeTypeMap` (`node_modules/next/dist/lib/mime-type.js:13-18`) contains only
  `jpeg`, `png`, `ico`, `svg`, so `next-metadata-image-loader.js:100-102` omits `og:image:type`
  entirely for a GIF.

Net effect: an `opengraph-image.gif` is served with `Content-Type: text/plain` and no
`og:image:type` meta. Ship PNG.

### `.alt.txt`

`opengraph-image.md:54-76` documents the convention; the implementation is
`next-metadata-image-loader.js:110-115`. Two things the docs omit:

- It applies **only** to `opengraph-image` and `twitter-image` — the code is guarded by
  `if (type === 'openGraph' || type === 'twitter')`. There is no `icon.alt.txt`.
- The file is read **verbatim**: `imageData.alt = await fs.readFile(altPath, 'utf8')`, with no
  trim. A trailing newline ends up inside the `content` attribute. Write the file without one.

### `twitter-image` may be unnecessary

`postProcessMetadata` (`node_modules/next/dist/esm/lib/metadata/resolve-metadata.js:549-584`)
auto-fills `twitter.images` from `openGraph.images` whenever twitter has none — along with title
and description. So `app/opengraph-image.png` alone produces both `og:image` and `twitter:image`.
Add `app/twitter-image.png` only if you want a genuinely different crop; otherwise it is a second
file to keep in sync for no gain.

### The cost of a committed PNG

Static image files are **base64-inlined into the generated route module**:
`next-metadata-route-loader.js:85` emits
`Buffer.from("<the entire file as base64>", 'base64')` into the route source. A committed OG PNG
therefore costs roughly 1.33× its bytes in the server bundle. Keep it lean; 8 MB is the ceiling,
not a target.

The route is served with `Cache-Control: public, max-age=0, must-revalidate` in production
(`CACHE_HEADERS.REVALIDATE`, `next-metadata-route-loader.js:46-49`), confirmed in this repo's
build at `.next/server/app/favicon.ico.meta`. The URL carries a content hash, so revalidation is
cheap and correctness is preserved across deploys.

---

## 3. `ImageResponse` from JSX vs. a committed PNG

### Supported — and it prerenders at build in this repo

`ImageResponse` is present and is imported from `next/og` (`node_modules/next/og.js` re-exports
`./dist/server/og/image-response`). The reference is
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md`. It has been
at `next/og` since v14.0.0 (`image-response.md:207-211`).

On when it runs: `opengraph-image.md:91` states generated images are *"statically optimized
(generated at build time and cached) unless they use Request-time APIs or uncached data"*. That
sentence is written for the non-Cache-Components model, and **this repo has
`cacheComponents: true`** (`next.config.ts`). The Cache Components rule is at
`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md:768`: `GET` route
handlers *"prerender when they don't access uncached or runtime data"*. `opengraph-image.tsx`
compiles to exactly such a handler
(`getSingleImageRouteCode`, `next-metadata-route-loader.js:189-200`), so a static OG image with no
`fetch`, no `cookies()` and no `headers()` prerenders at build either way.

Verified empirically against this repo's existing build. `/favicon.ico` — a metadata route under
`cacheComponents: true` — appears in `.next/prerender-manifest.json` with:

```json
{ "renderingMode": "STATIC", "compute": "static", "initialRevalidateSeconds": false, "routeType": "route" }
```

and its bytes are on disk at `.next/server/app/favicon.ico.body`. Metadata routes prerender.

### Build-time cost

Rendering happens once per build, not per request. The machinery is bundled inside Next:
`node_modules/next/dist/compiled/@vercel/og/` ships `resvg.wasm` (1,378,357 bytes), `yoga.wasm`
(71,736 bytes) and `Geist-Regular.ttf` (125,956 bytes) — roughly 1.6 MB pulled into the server
bundle for that route, against ~1.33× the PNG for the static-file alternative. The pipeline is
satori → SVG → resvg (`image-response.md:49`); on Node it will use `sharp` instead of resvg if it
happens to be installed (`getSharp()` in `compiled/@vercel/og/index.node.js`), which it is not
here, so the wasm path applies.

`image-response.md:50-52` also documents the hard constraints: flexbox only (no `display: grid`),
a 500 KB bundle-size limit, and font formats restricted to `ttf`/`otf`/`woff`.

The response `ImageResponse` constructs sets its own headers — in production
`cache-control: public, immutable, no-transform, max-age=31536000` (constructor in
`compiled/@vercel/og/index.node.js`). The generated URL carries a content hash
(`next-metadata-image-loader.js:62`), so immutable is safe.

### Which fonts are usable inside it — the important finding

**The default font in Next 16.3 is Geist, not Noto Sans.** The bundled `@vercel/og` is version
0.11.1 (`node_modules/next/dist/compiled/@vercel/og/package.json`) and its Node entry declares:

```js
var fontData = fs2.readFileSync(fileURLToPath(new URL("./Geist-Regular.ttf", import.meta.url)));
var fonts = [{ name: "geist", data: fontData, weight: 400, style: "normal" }];
```

(`compiled/@vercel/og/index.node.js`). So an `ImageResponse` with no `fonts` option renders in
Geist 400 — which happens to match this app's body face for free. If you remember `@vercel/og`
defaulting to Noto Sans, that is out of date.

Three consequences for a builder:

1. **Passing `fonts` replaces the default, it does not merge.** The render call is
   `fonts: options.fonts || defaultFonts` (`render()` in `compiled/@vercel/og/index.node.js`). If
   you pass your display face, Geist is gone unless you pass it too.
2. **You cannot reuse the `next/font` asset.** `next/font/google` self-hosts **woff2**
   (`.next/static/media/*.woff2`, and `fetch-resource.js:22-27` deliberately requests woff2), but
   `ImageResponse` accepts only `ttf`, `otf`, `woff` (`image-response.md:52`). To use the display
   face inside the OG image you must commit a separate `.ttf`/`.otf` and read it at module scope,
   exactly as `opengraph-image.md:111-113` shows:
   ```ts
   const displayFont = await readFile(join(process.cwd(), 'assets/Fraunces-Bold.ttf'))
   ```
3. **Uncovered glyphs trigger a network fetch at render time.** satori's `loadAdditionalAsset`
   hook (`loadDynamicAsset` / `loadGoogleFont` in `compiled/@vercel/og/index.node.js`) downloads a
   Google font for any script the supplied fonts don't cover, and a twemoji SVG for emoji. Keep OG
   text to Latin characters covered by the bundled font and no network call happens.

### Recommendation

For a single, unchanging brand card, a committed `app/opengraph-image.png` is the cheaper and more
predictable option: no wasm in the bundle, no font file to commit, no satori CSS subset to fight,
and the design is whatever the designer exported. `ImageResponse` earns its cost when the image
must vary per route — which, given the scope settled for this app, it does not. If it is chosen
anyway for the convenience of keeping the wordmark in code, it is fully supported and prerenders
at build.

---

## 4. `metadataBase` and the `VERCEL_URL` fallback

**The fallback at `app/layout.tsx:6-11` should be deleted.** It is not merely redundant in 16.3 —
for this app it produces a *worse* URL than doing nothing.

### What 16.3 actually infers

The inference lives in `getSocialImageMetadataBaseFallback`
(`node_modules/next/dist/esm/lib/metadata/resolvers/resolve-url.js:26-37`, mirrored at
`node_modules/next/dist/lib/metadata/resolvers/resolve-url.js:58-69`). Its own doc comment reads:

> *in dev, it should always be localhost; in Vercel preview builds, it should be the preview build
> ID; in start, it should be the user-provided metadataBase value. Otherwise, it'll fall back to
> the Vercel production deployment, and localhost as a last resort.*

The precedence, from `resolve-url.js`:

| environment | base used for social images |
| --- | --- |
| `NODE_ENV=development` | `http://localhost:${PORT ?? 3000}` — **user `metadataBase` ignored** |
| production, `VERCEL_ENV=preview` | `VERCEL_BRANCH_URL` ?? `VERCEL_URL` — **user `metadataBase` ignored** |
| production, otherwise | user `metadataBase` ?? `VERCEL_PROJECT_PRODUCTION_URL` ?? localhost |

And crucially, for **file-convention** images the user's value is bypassed in the first two cases
regardless of what is set. `resolveAndValidateImage`
(`node_modules/next/dist/esm/lib/metadata/resolvers/resolve-opengraph.js:60-73`) enters the
fallback branch when `isRelativeUrl && (!metadataBase || isStaticMetadataRouteFile)`, and
`isStaticMetadataRouteFile` is forced true for `opengraph-image`/`twitter-image` files
(`resolve-metadata.js:69-86`). The source comment explains the intent directly:

> *In the `opengraph-image` case, since the user isn't explicitly passing a relative path, this
> ensures the ogImage will be properly discovered across different environments without the user
> needing to have a bunch of `process.env` checks when defining their `metadataBase`.*

That is a description of exactly the code currently in `app/layout.tsx:6-11`, and the framework
now does it for you.

### Why the current code is actively worse

`VERCEL_URL` is the **deployment-specific** hostname. `VERCEL_PROJECT_PRODUCTION_URL` — which is
what Next's own fallback reaches for in production (`getProductionDeploymentUrl`,
`resolve-url.js:15-18`) — is the **stable project domain**. As written, production `og:image` URLs
point at an immutable per-deployment hostname instead of
`https://with-supabase-app-wheat-ten.vercel.app`. On preview deployments the hand-rolled value is
discarded anyway (preview branch wins), and in dev it is discarded too. So the code has no effect
in two of three environments and the wrong effect in the third.

### The one caveat before deleting it

`metadataBase` still governs relative URLs in non-social fields — `alternates.canonical`,
`openGraph.url`, `itunes`, `pagination` — via the plain `resolveUrl` path with no fallback
(`resolve-metadata.js:107-166`). This repo sets none of those; `app/layout.tsx:10-15` is the only
`metadata` export in the codebase (verified by grep across `app/` and `components/`), and it
declares only `metadataBase`, `title` and `description`. So deleting it is safe today. If a
canonical URL is ever added, set `metadataBase` then — as a plain literal, not a `VERCEL_URL`
expression.

Note also that icons never consult `metadataBase` at all: `resolve-metadata.js:130` calls
`resolveIcons(metadata.icons)` with no base argument.

### A second docs contradiction

`generate-metadata.md:428` states:

> *Using a relative path in a URL-based `metadata` field without configuring a `metadataBase` will
> cause a build error.*

This is **not true in 16.3**. There is no such error in the shipped code. For social images you get
at most a `warnOnce` — *"metadataBase property in metadata export is not set for resolving social
open graph or twitter images, using ..."* (`resolve-opengraph.js:69-72`) — and that warning is
itself suppressed when `process.env.VERCEL` is set, i.e. it will never fire on a Vercel build. For
other fields, `resolveAbsoluteUrlWithPathname` simply passes the relative string through unchanged
(`resolve-url.js:73`). Do not expect the build to catch a missing `metadataBase`.

---

## Summary: where 16.3 differs from what you would expect

| expectation | reality in 16.3 | source |
| --- | --- | --- |
| `next/font` changed in 16 | Unchanged since 13.2; no font section in the v16 upgrade guide | `font.md:1063-1068` |
| `subsets: ['latin']` shrinks the build | Only controls preloading; all subsets are downloaded and emitted | `google/loader.js:102-129`, `find-font-files-in-css.js:9-31` |
| Two weights = two font files | Two weights of a *variable* family returns the variable file, de-duplicated to one download | measured; `find-font-files-in-css.js:24-25` |
| `display: 'swap'` must be set | Already the default | `validate-google-font-function-call.js:16` |
| `favicon.ico` emits `sizes="any"` | Emits a hashed href, measured `sizes`, and `type` | `.next/server/app/index.html` vs `app-icons.md:33` |
| `.gif` works for OG images | Filename matches, but served as `text/plain` with no `og:image:type` | `next-metadata-route-loader.js:58-69`, `lib/mime-type.js:13-18` |
| `ImageResponse` defaults to Noto Sans | Defaults to **Geist 400**; passing `fonts` replaces rather than merges | `compiled/@vercel/og/index.node.js` (v0.11.1) |
| `next/font` files can be reused in `ImageResponse` | No — woff2 out, only ttf/otf/woff in | `image-response.md:52` |
| `metadataBase` needs a `VERCEL_URL` fallback | 16.3 infers it, prefers the *stable* production domain, and overrides the user value for file-convention images | `resolve-url.js:26-37`, `resolve-opengraph.js:60-73` |
| Missing `metadataBase` is a build error | Warning at most, and suppressed on Vercel | `resolve-opengraph.js:69-72` |
| Metadata routes are dynamic under `cacheComponents` | Prerendered `STATIC` at build | `.next/prerender-manifest.json`, `migrating-to-cache-components.md:768` |
| `params` in `opengraph-image`/`icon` is an object | **Breaking in 16:** it is a `Promise` now | `version-16.md:317-352` |

The last row is the only genuine breaking change in this area, and it does not affect a static
brand image with no dynamic segment — but it would bite immediately on a per-route OG image.
