import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Oli-Learn palette's whole justification is WCAG AA in both themes
 * (docs/design/oli-learn.md §1), so the claim is checked rather than asserted.
 *
 * This parses `app/globals.css` itself instead of restating the triples. A test
 * that carried its own copy of the palette would keep passing after someone
 * edited the stylesheet - which is exactly the drift the check exists to catch.
 */

const CSS = readFileSync(
  fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
  "utf8",
);

/** `--name: H S% L%;` pairs inside a given selector's block. */
function tokens(selector: string): Record<string, string> {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = withoutComments.match(
    new RegExp(`${selector}\\s*\\{([^}]*)\\}`),
  );
  if (!block) throw new Error(`No \`${selector}\` block in app/globals.css`);

  const found: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(
    /--([\w-]+):\s*([\d.]+\s+[\d.]+%\s+[\d.]+%)\s*;/g,
  )) {
    found[name] = value;
  }
  return found;
}

function relativeLuminance(hsl: string): number {
  const [h, s, l] = hsl.split(/\s+/).map(parseFloat);
  const sat = s / 100;
  const lum = l / 100;

  // HSL -> sRGB, per CSS Color 4.
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const channel = (n: number) =>
    lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  // sRGB -> linear, then the WCAG 2.x coefficients.
  const [r, g, b] = [channel(0), channel(8), channel(4)].map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * `[foreground, background, minimum, what it is]`.
 *
 * 4.5 is AA for body text; 3 is AA for large text (bold from 18.66px) and for
 * non-text indicators like the focus ring. The two sub-3 minimums are not
 * contrast requirements but separation floors - a border that vanishes into its
 * ground, and the card-on-wash case that forces cards on the wash to carry one.
 */
const PAIRS: ReadonlyArray<readonly [string, string, number, string]> = [
  ["foreground", "background", 4.5, "body text"],
  ["muted-foreground", "background", 4.5, "subheads and table meta"],
  ["muted-foreground", "muted", 4.5, "text on muted fills"],
  ["muted-foreground", "card", 4.5, "cancelled row - replaces opacity-55"],
  ["primary-foreground", "primary", 4.5, "CTA label"],
  ["primary", "background", 4.5, "links and ghost button text"],
  ["primary", "card", 4.5, "links on cards"],
  ["accent-foreground", "accent", 4.5, "value pill text"],
  ["destructive", "background", 4.5, "ghost Cancel label"],
  ["destructive", "card", 4.5, "ghost Cancel on a card"],
  ["destructive-foreground", "destructive", 4.5, "destructive button label"],
  ["status-scheduled-fg", "status-scheduled-bg", 4.5, "scheduled pill"],
  ["status-completed-fg", "status-completed-bg", 4.5, "completed pill"],
  ["status-cancelled-fg", "status-cancelled-bg", 4.5, "cancelled pill"],
  ["ring", "background", 3, "focus indicator (non-text)"],
  ["foreground", "wash", 4.5, "hero heading on the wash"],
  ["muted-foreground", "wash", 4.5, "hero subhead on the wash"],
  ["primary", "wash", 4.5, "hero accent and CTA on the wash"],
  // Large text only - the Wordmark component enforces that, see its own test.
  ["amber", "background", 3, "wordmark `Learn` on the app ground"],
  ["amber", "wash", 3, "wordmark `Learn` on the wash"],
  ["amber", "card", 3, "wordmark `Learn` on a card"],
  ["border", "background", 1.4, "separators"],
  ["border", "wash", 1.4, "cards on the wash"],
  ["card", "wash", 1.05, "a card must separate from the wash"],
];

describe.each([
  ["light", ":root"],
  ["dark", "\\.dark"],
])("%s theme", (_theme, selector) => {
  const palette = tokens(selector);

  it.each(PAIRS)("%s on %s clears %s:1 — %s", (fg, bg, minimum) => {
    expect(palette[fg], `--${fg} missing from app/globals.css`).toBeDefined();
    expect(palette[bg], `--${bg} missing from app/globals.css`).toBeDefined();

    expect(ratio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(minimum);
  });
});

describe("token hygiene", () => {
  it("defines the same token names in both themes, except --radius", () => {
    const light = Object.keys(tokens(":root")).filter((n) => n !== "radius");
    const dark = Object.keys(tokens("\\.dark"));

    expect(new Set(dark)).toEqual(new Set(light));
  });

  it("has no --chart-* tokens: they were unused, so they were deleted", () => {
    expect(CSS).not.toMatch(/--chart-/);
  });
});
