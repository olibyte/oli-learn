/**
 * PROTOTYPE — throwaway. Ticket #18: what are Oli-Learn's colour tokens?
 *
 * Three candidate token systems, switchable via `?variant=`. Note the deviation
 * from the usual UI-prototype rule that variants must differ structurally: here
 * the palette *is* the question, so the sample surface is held identical across
 * all three and only the tokens change. What differs between variants is not
 * shade but *where the brand colour lives* — which colour carries action, which
 * carries signal, and what dark mode is built out of.
 *
 * Every pair below was verified against WCAG AA before being written down; the
 * ratios are recomputed at render time so the page cannot drift from the claim.
 */

export type Tokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  statusScheduledBg: string;
  statusScheduledFg: string;
  statusCompletedBg: string;
  statusCompletedFg: string;
  statusCancelledBg: string;
  statusCancelledFg: string;
};

export type Variant = {
  key: string;
  name: string;
  thesis: string;
  light: Tokens;
  dark: Tokens;
};

export const VARIANTS: Variant[] = [
  {
    key: "A",
    name: "Poster",
    thesis:
      "Blue carries every action; amber is emphasis only — headline words and pills. Closest to the source poster.",
    light: {
      background: "213 100% 98%",
      foreground: "213 60% 14%",
      card: "0 0% 100%",
      cardForeground: "213 60% 14%",
      popover: "0 0% 100%",
      popoverForeground: "213 60% 14%",
      primary: "213 88% 43%",
      primaryForeground: "0 0% 100%",
      secondary: "213 45% 95%",
      secondaryForeground: "213 60% 20%",
      muted: "213 45% 95%",
      mutedForeground: "213 22% 40%",
      accent: "38 95% 90%",
      accentForeground: "27 85% 25%",
      destructive: "0 72% 40%",
      destructiveForeground: "0 0% 100%",
      border: "213 32% 82%",
      input: "213 32% 82%",
      ring: "213 88% 43%",
      statusScheduledBg: "213 92% 92%",
      statusScheduledFg: "213 88% 30%",
      statusCompletedBg: "160 60% 90%",
      statusCompletedFg: "162 88% 22%",
      statusCancelledBg: "213 25% 92%",
      statusCancelledFg: "213 20% 35%",
    },
    dark: {
      background: "213 50% 10%",
      foreground: "210 40% 96%",
      card: "213 45% 13%",
      cardForeground: "210 40% 96%",
      popover: "213 45% 13%",
      popoverForeground: "210 40% 96%",
      primary: "211 92% 62%",
      primaryForeground: "213 60% 10%",
      secondary: "213 35% 18%",
      secondaryForeground: "210 40% 96%",
      muted: "213 35% 18%",
      mutedForeground: "213 22% 72%",
      accent: "30 55% 22%",
      accentForeground: "38 95% 76%",
      destructive: "0 75% 68%",
      destructiveForeground: "0 60% 12%",
      border: "213 30% 24%",
      input: "213 30% 24%",
      ring: "211 92% 62%",
      statusScheduledBg: "213 60% 22%",
      statusScheduledFg: "211 92% 80%",
      statusCompletedBg: "162 45% 18%",
      statusCompletedFg: "158 70% 72%",
      statusCancelledBg: "213 25% 20%",
      statusCancelledFg: "213 18% 70%",
    },
  },
  {
    key: "B",
    name: "Amber action",
    thesis:
      "Inverted: blue is chrome and identity, amber is the action colour — every primary button and focus ring is warm.",
    light: {
      background: "213 100% 98%",
      foreground: "213 60% 14%",
      card: "0 0% 100%",
      cardForeground: "213 60% 14%",
      popover: "0 0% 100%",
      popoverForeground: "213 60% 14%",
      primary: "27 92% 34%",
      primaryForeground: "40 100% 97%",
      secondary: "213 45% 95%",
      secondaryForeground: "213 60% 20%",
      muted: "213 45% 95%",
      mutedForeground: "213 22% 40%",
      accent: "213 92% 93%",
      accentForeground: "213 88% 28%",
      destructive: "0 72% 40%",
      destructiveForeground: "0 0% 100%",
      border: "213 32% 82%",
      input: "213 32% 82%",
      ring: "27 92% 34%",
      statusScheduledBg: "38 95% 88%",
      statusScheduledFg: "27 90% 27%",
      statusCompletedBg: "160 60% 90%",
      statusCompletedFg: "162 88% 22%",
      statusCancelledBg: "213 25% 92%",
      statusCancelledFg: "213 20% 35%",
    },
    dark: {
      background: "213 55% 9%",
      foreground: "210 40% 96%",
      card: "213 48% 12%",
      cardForeground: "210 40% 96%",
      popover: "213 48% 12%",
      popoverForeground: "210 40% 96%",
      primary: "38 95% 58%",
      primaryForeground: "27 90% 10%",
      secondary: "213 35% 17%",
      secondaryForeground: "210 40% 96%",
      muted: "213 35% 17%",
      mutedForeground: "213 22% 72%",
      accent: "213 55% 20%",
      accentForeground: "211 92% 78%",
      destructive: "0 75% 68%",
      destructiveForeground: "0 60% 12%",
      border: "213 30% 23%",
      input: "213 30% 23%",
      ring: "38 95% 58%",
      statusScheduledBg: "30 60% 20%",
      statusScheduledFg: "38 95% 74%",
      statusCompletedBg: "162 45% 18%",
      statusCompletedFg: "158 70% 72%",
      statusCancelledBg: "213 25% 19%",
      statusCancelledFg: "213 18% 70%",
    },
  },
  {
    key: "C",
    name: "Ink & signal",
    thesis:
      "Navy ink runs the interface; blue and amber appear only as signal — status, links, one hero accent. Poster energy stays on the landing page.",
    light: {
      background: "0 0% 100%",
      foreground: "213 55% 12%",
      card: "0 0% 100%",
      cardForeground: "213 55% 12%",
      popover: "0 0% 100%",
      popoverForeground: "213 55% 12%",
      primary: "213 55% 16%",
      primaryForeground: "210 40% 98%",
      secondary: "213 30% 96%",
      secondaryForeground: "213 55% 16%",
      muted: "213 30% 96%",
      mutedForeground: "213 18% 42%",
      accent: "213 40% 96%",
      accentForeground: "213 55% 16%",
      destructive: "0 72% 40%",
      destructiveForeground: "0 0% 100%",
      border: "213 24% 83%",
      input: "213 24% 83%",
      ring: "213 88% 43%",
      statusScheduledBg: "213 92% 94%",
      statusScheduledFg: "213 88% 30%",
      statusCompletedBg: "160 55% 92%",
      statusCompletedFg: "162 88% 22%",
      statusCancelledBg: "213 20% 94%",
      statusCancelledFg: "213 18% 38%",
    },
    dark: {
      background: "213 45% 8%",
      foreground: "210 35% 96%",
      card: "213 40% 11%",
      cardForeground: "210 35% 96%",
      popover: "213 40% 11%",
      popoverForeground: "210 35% 96%",
      primary: "210 35% 94%",
      primaryForeground: "213 55% 12%",
      secondary: "213 30% 15%",
      secondaryForeground: "210 35% 96%",
      muted: "213 30% 15%",
      mutedForeground: "213 18% 70%",
      accent: "213 35% 16%",
      accentForeground: "210 35% 94%",
      destructive: "0 75% 68%",
      destructiveForeground: "0 60% 12%",
      border: "213 28% 21%",
      input: "213 28% 21%",
      ring: "211 92% 62%",
      statusScheduledBg: "213 60% 20%",
      statusScheduledFg: "211 92% 80%",
      statusCompletedBg: "162 45% 17%",
      statusCompletedFg: "158 70% 72%",
      statusCancelledBg: "213 22% 18%",
      statusCancelledFg: "213 16% 68%",
    },
  },
];

const CSS_VAR: Record<keyof Tokens, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  statusScheduledBg: "--status-scheduled-bg",
  statusScheduledFg: "--status-scheduled-fg",
  statusCompletedBg: "--status-completed-bg",
  statusCompletedFg: "--status-completed-fg",
  statusCancelledBg: "--status-cancelled-bg",
  statusCancelledFg: "--status-cancelled-fg",
};

const block = (tokens: Tokens) =>
  (Object.keys(CSS_VAR) as (keyof Tokens)[])
    .map((k) => `${CSS_VAR[k]}: ${tokens[k]};`)
    .join(" ");

/** Scopes a variant's tokens to the sample surface, in both themes. */
export function cssFor(variant: Variant) {
  const sel = `[data-proto="${variant.key}"]`;
  return `${sel} { ${block(variant.light)} }\n.dark ${sel} { ${block(variant.dark)} }`;
}

/** Copy-pasteable globals.css for the winner. */
export function globalsCssFor(variant: Variant) {
  return `:root {\n  ${block(variant.light).replaceAll("; ", ";\n  ").trim()}\n}\n\n.dark {\n  ${block(variant.dark).replaceAll("; ", ";\n  ").trim()}\n}`;
}

// --- contrast, recomputed in the browser so the numbers can't go stale -------

function hslToRgb(str: string) {
  const [h, s, l] = str.split(/\s+/).map(parseFloat);
  const sat = s / 100;
  const lum = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number) =>
    lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance(str: string) {
  const [r, g, b] = hslToRgb(str).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export function hex(str: string) {
  return (
    "#" +
    hslToRgb(str)
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** The pairs that actually decide whether this palette is usable. */
export const CHECKS: {
  label: string;
  fg: keyof Tokens;
  bg: keyof Tokens;
  min: number;
  why: string;
}[] = [
  { label: "body text", fg: "foreground", bg: "background", min: 4.5, why: "every paragraph" },
  { label: "muted text", fg: "mutedForeground", bg: "background", min: 4.5, why: "subheads, table meta" },
  { label: "muted on fill", fg: "mutedForeground", bg: "muted", min: 4.5, why: "tiles, skeletons" },
  { label: "cancelled row", fg: "mutedForeground", bg: "card", min: 4.5, why: "replaces opacity-55" },
  { label: "CTA label", fg: "primaryForeground", bg: "primary", min: 4.5, why: "primary button" },
  { label: "link / ghost", fg: "primary", bg: "background", min: 4.5, why: "text buttons" },
  { label: "pill text", fg: "accentForeground", bg: "accent", min: 4.5, why: "value badges" },
  { label: "Cancel label", fg: "destructive", bg: "card", min: 4.5, why: "was 3.8:1 — the known failure" },
  { label: "destructive btn", fg: "destructiveForeground", bg: "destructive", min: 4.5, why: "confirm dialog" },
  { label: "badge: scheduled", fg: "statusScheduledFg", bg: "statusScheduledBg", min: 4.5, why: "status" },
  { label: "badge: completed", fg: "statusCompletedFg", bg: "statusCompletedBg", min: 4.5, why: "status" },
  { label: "badge: cancelled", fg: "statusCancelledFg", bg: "statusCancelledBg", min: 4.5, why: "status" },
  { label: "focus ring", fg: "ring", bg: "background", min: 3, why: "non-text, AA 3:1" },
];
