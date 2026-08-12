// Throwaway: derive Oli-Learn token candidates and verify WCAG AA in both themes.
// HSL triples are written exactly as they appear in globals.css ("H S% L%").

const hsl = (s) => s.trim().split(/\s+/).map((p) => parseFloat(p));

function hslToRgb(str) {
  let [h, s, l] = hsl(str);
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance(str) {
  const [r, g, b] = hslToRgb(str).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const hex = (str) =>
  "#" + hslToRgb(str).map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------------------
// Three candidate systems. They disagree about WHERE the brand colour lives,
// not about shade.
// ---------------------------------------------------------------------------

// A' — CHOSEN: A's palette, white app ground, blue wash kept as a separate token.
const A = {
  light: {
    background: "0 0% 100%", wash: "213 100% 98%", foreground: "213 60% 14%",
    card: "0 0% 100%", cardForeground: "213 60% 14%",
    primary: "213 88% 43%", primaryForeground: "0 0% 100%",
    accent: "38 95% 90%", accentForeground: "27 85% 25%",
    muted: "213 45% 95%", mutedForeground: "213 22% 40%",
    border: "213 32% 82%", ring: "213 88% 43%",
    destructive: "0 72% 40%", destructiveForeground: "0 0% 100%",
    scheduledBg: "213 92% 92%", scheduledFg: "213 88% 30%",
    completedBg: "160 60% 90%", completedFg: "162 88% 22%",
    cancelledBg: "213 25% 92%", cancelledFg: "213 20% 35%",
  },
  dark: {
    background: "213 50% 10%", wash: "213 55% 8%", foreground: "210 40% 96%",
    card: "213 45% 13%", cardForeground: "210 40% 96%",
    primary: "211 92% 62%", primaryForeground: "213 60% 10%",
    accent: "30 55% 22%", accentForeground: "38 95% 76%",
    muted: "213 35% 18%", mutedForeground: "213 22% 72%",
    border: "213 30% 24%", ring: "211 92% 62%",
    destructive: "0 75% 68%", destructiveForeground: "0 60% 12%",
    scheduledBg: "213 60% 22%", scheduledFg: "211 92% 80%",
    completedBg: "162 45% 18%", completedFg: "158 70% 72%",
    cancelledBg: "213 25% 20%", cancelledFg: "213 18% 70%",
  },
};

// B — "Amber action": blue is chrome/brand, amber is the action colour.
const B = {
  light: {
    background: "213 100% 98%", foreground: "213 60% 14%",
    card: "0 0% 100%", cardForeground: "213 60% 14%",
    primary: "27 92% 34%", primaryForeground: "40 100% 97%",
    accent: "213 92% 93%", accentForeground: "213 88% 28%",
    muted: "213 45% 95%", mutedForeground: "213 22% 40%",
    border: "213 32% 82%", ring: "27 92% 34%",
    destructive: "0 72% 40%", destructiveForeground: "0 0% 100%",
    scheduledBg: "38 95% 88%", scheduledFg: "27 90% 27%",
    completedBg: "160 60% 90%", completedFg: "162 88% 22%",
    cancelledBg: "213 25% 92%", cancelledFg: "213 20% 35%",
  },
  dark: {
    background: "213 55% 9%", foreground: "210 40% 96%",
    card: "213 48% 12%", cardForeground: "210 40% 96%",
    primary: "38 95% 58%", primaryForeground: "27 90% 10%",
    accent: "213 55% 20%", accentForeground: "211 92% 78%",
    muted: "213 35% 17%", mutedForeground: "213 22% 72%",
    border: "213 30% 23%", ring: "38 95% 58%",
    destructive: "0 75% 68%", destructiveForeground: "0 60% 12%",
    scheduledBg: "30 60% 20%", scheduledFg: "38 95% 74%",
    completedBg: "162 45% 18%", completedFg: "158 70% 72%",
    cancelledBg: "213 25% 19%", cancelledFg: "213 18% 70%",
  },
};

// C — "Ink & signal": navy ink UI; blue and amber appear only as signal.
const C = {
  light: {
    background: "0 0% 100%", foreground: "213 55% 12%",
    card: "0 0% 100%", cardForeground: "213 55% 12%",
    primary: "213 55% 16%", primaryForeground: "210 40% 98%",
    accent: "213 40% 96%", accentForeground: "213 55% 16%",
    muted: "213 30% 96%", mutedForeground: "213 18% 42%",
    border: "213 24% 83%", ring: "213 88% 43%",
    destructive: "0 72% 40%", destructiveForeground: "0 0% 100%",
    scheduledBg: "213 92% 94%", scheduledFg: "213 88% 30%",
    completedBg: "160 55% 92%", completedFg: "162 88% 22%",
    cancelledBg: "213 20% 94%", cancelledFg: "213 18% 38%",
  },
  dark: {
    background: "213 45% 8%", foreground: "210 35% 96%",
    card: "213 40% 11%", cardForeground: "210 35% 96%",
    primary: "210 35% 94%", primaryForeground: "213 55% 12%",
    accent: "213 35% 16%", accentForeground: "210 35% 94%",
    muted: "213 30% 15%", mutedForeground: "213 18% 70%",
    border: "213 28% 21%", ring: "211 92% 62%",
    destructive: "0 75% 68%", destructiveForeground: "0 60% 12%",
    scheduledBg: "213 60% 20%", scheduledFg: "211 92% 80%",
    completedBg: "162 45% 17%", completedFg: "158 70% 72%",
    cancelledBg: "213 22% 18%", cancelledFg: "213 16% 68%",
  },
};

// pair, min ratio, why it matters
const checks = (t) => [
  ["foreground / background", t.foreground, t.background, 4.5, "body text"],
  ["mutedForeground / background", t.mutedForeground, t.background, 4.5, "subheads, table meta"],
  ["mutedForeground / muted", t.mutedForeground, t.muted, 4.5, "text on muted fills"],
  ["mutedForeground / card", t.mutedForeground, t.card, 4.5, "cancelled row (replaces opacity-55)"],
  ["primaryForeground / primary", t.primaryForeground, t.primary, 4.5, "CTA label"],
  ["primary / background", t.primary, t.background, 4.5, "links, ghost button text"],
  ["primary / card", t.primary, t.card, 4.5, "links on cards"],
  ["accentForeground / accent", t.accentForeground, t.accent, 4.5, "pill badge text"],
  ["destructive / background", t.destructive, t.background, 4.5, "ghost Cancel label — KNOWN FAILURE"],
  ["destructive / card", t.destructive, t.card, 4.5, "ghost Cancel on a card"],
  ["destructiveForeground / destructive", t.destructiveForeground, t.destructive, 4.5, "destructive button label"],
  ["scheduledFg / scheduledBg", t.scheduledFg, t.scheduledBg, 4.5, "status badge"],
  ["completedFg / completedBg", t.completedFg, t.completedBg, 4.5, "status badge"],
  ["cancelledFg / cancelledBg", t.cancelledFg, t.cancelledBg, 4.5, "status badge"],
  ["ring / background", t.ring, t.background, 3, "focus indicator (non-text)"],
  ["border / background", t.border, t.background, 1.4, "separators (decorative)"],
  ["foreground / wash", t.foreground, t.wash, 4.5, "hero heading on the wash"],
  ["mutedForeground / wash", t.mutedForeground, t.wash, 4.5, "hero subhead on the wash"],
  ["primary / wash", t.primary, t.wash, 4.5, "hero accent + CTA on the wash"],
  ["border / wash", t.border, t.wash, 1.4, "cards on the wash"],
  ["card / wash", t.card, t.wash, 1.05, "card must separate from the wash"],
];

let failures = 0;
for (const [name, variant] of [["A — Poster", A], ["B — Amber action", B], ["C — Ink & signal", C]]) {
  console.log(`\n${"=".repeat(78)}\n${name}\n${"=".repeat(78)}`);
  for (const theme of ["light", "dark"]) {
    console.log(`\n  ${theme.toUpperCase()}  bg ${hex(variant[theme].background)}  primary ${hex(variant[theme].primary)}`);
    for (const [label, fg, bg, min, why] of checks(variant[theme])) {
      const r = ratio(fg, bg);
      const ok = r >= min;
      if (!ok) failures++;
      console.log(
        `    ${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(6)}:1  (min ${min})  ${label.padEnd(34)} ${why}`
      );
    }
  }
}
console.log(`\n${failures === 0 ? "ALL PAIRS PASS" : `${failures} FAILING PAIRS`}`);
