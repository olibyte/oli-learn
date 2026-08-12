/**
 * The wordmark's size rule (docs/design/oli-learn.md §3).
 *
 * `Oli-Learn` is two-tone - blue `Oli-`, amber `Learn` - but only where the
 * amber is legal. The amber step reaches 3.66:1 on white, which clears WCAG's
 * 3:1 bar for *large* text and misses the 4.5:1 bar for everything else. So the
 * mark drops to a single ink below the large-text threshold rather than
 * shipping a colour that fails.
 *
 * This lives apart from the component so the rule can be checked against the
 * threshold it derives from instead of being restated as a list of sizes.
 */

/**
 * WCAG 2.2 counts text as "large" from 18pt, or 14pt when bold. The wordmark is
 * always Outfit 700, so the bold threshold applies: 14pt = 18.66px.
 */
export const LARGE_TEXT_BOLD_PX = 18.66;

/** Tailwind's `text-*` scale, with the px each step resolves to. */
export const WORDMARK_SIZES = {
  sm: { className: "text-sm", px: 14 },
  base: { className: "text-base", px: 16 },
  lg: { className: "text-lg", px: 18 },
  xl: { className: "text-xl", px: 20 },
  "2xl": { className: "text-2xl", px: 24 },
  "3xl": { className: "text-3xl", px: 30 },
} as const;

export type WordmarkSize = keyof typeof WORDMARK_SIZES;

/**
 * Whether `Learn` may be set in amber at this size. Derived from the px value
 * rather than hard-coded, so the boundary cannot drift away from the reason for
 * it - `text-lg` is 18px and therefore single-ink by 0.66px.
 */
export const isTwoTone = (size: WordmarkSize): boolean =>
  WORDMARK_SIZES[size].px >= LARGE_TEXT_BOLD_PX;
