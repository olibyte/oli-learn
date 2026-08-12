"use client";

/**
 * PROTOTYPE — throwaway. Ticket #21.
 *
 * Three lockup *strategies*, not three shades: where the split lives, and
 * whether colour lives in the letters or in a mark beside them.
 *
 * Type is Outfit 700 (#19). Blue is `--primary`; amber is the large-text step
 * `33 95% 40%` verified in #18 — 3.66:1 on white, 3.47:1 on the wash, 4.87:1 on
 * navy. A wordmark is large text, so 3:1 is the bar it must clear.
 */

import {
  BookOpen,
  CalendarCheck,
  Compass,
  GraduationCap,
  MessagesSquare,
} from "lucide-react";

export const GLYPHS = {
  cap: { label: "GraduationCap", Icon: GraduationCap },
  calendar: { label: "CalendarCheck", Icon: CalendarCheck },
  book: { label: "BookOpen", Icon: BookOpen },
  compass: { label: "Compass", Icon: Compass },
  talk: { label: "MessagesSquare", Icon: MessagesSquare },
} as const;

export type GlyphKey = keyof typeof GLYPHS;

export const LOCKUPS = [
  {
    key: "A",
    name: "Hyphenated",
    thesis:
      "Oli-Learn exactly as the glossary spells it. The hyphen carries the split; amber lands on the second half.",
  },
  {
    key: "B",
    name: "Closed logotype",
    thesis:
      "OliLearn as one word — the camel-case boundary does the work the hyphen did. Contradicts CONTEXT.md, which would need amending.",
  },
  {
    key: "C",
    name: "Mark-led",
    thesis:
      "Colour moves out of the letters and into a tile beside them. The wordmark is single-ink; the mark carries the brand.",
  },
] as const;

/** The compact mark: glyph in a rounded tile. Also the favicon candidate. */
export function Mark({
  glyph,
  px,
  radius = "rounded-lg",
}: {
  glyph: GlyphKey;
  px: number;
  radius?: string;
}) {
  const { Icon } = GLYPHS[glyph];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground ${radius}`}
      style={{ width: px, height: px }}
    >
      <Icon style={{ width: px * 0.62, height: px * 0.62 }} strokeWidth={2.4} />
    </span>
  );
}

/** Monogram alternative — the other thing that survives 16px. */
export function Monogram({ px, radius = "rounded-lg" }: { px: number; radius?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-primary font-[family-name:var(--font-display)] font-bold text-primary-foreground ${radius}`}
      style={{ width: px, height: px, fontSize: px * 0.52, lineHeight: 1 }}
    >
      OL
    </span>
  );
}

/** The mark has to grow with the type or the lockup falls apart at hero scale. */
const MARK_PX: Record<string, number> = {
  "text-sm": 18,
  "text-base": 20,
  "text-xl": 26,
  "text-2xl": 32,
  "text-3xl": 38,
  "text-4xl": 48,
  "text-5xl": 60,
};

export function Lockup({
  variant,
  glyph,
  size = "text-xl",
  withMark,
}: {
  variant: string;
  glyph: GlyphKey;
  size?: string;
  withMark?: boolean;
}) {
  const type = `font-[family-name:var(--font-display)] font-bold tracking-tight ${size}`;
  const px = MARK_PX[size] ?? 26;
  const radius = px <= 20 ? "rounded-[5px]" : px <= 32 ? "rounded-lg" : "rounded-xl";

  // WCAG counts bold text as "large" from 18.66px, where 3:1 is enough. Outfit
  // 700 reaches that at text-xl. Below it the amber (3.66:1) is illegal, so the
  // lockup drops to a single ink — primary blue, which passes at any size.
  const twoTone = !["text-sm", "text-base", "text-lg"].includes(size);
  if (!twoTone) {
    return (
      <span className={`inline-flex items-center gap-2 ${type} text-primary`}>
        {(withMark || variant === "C") && (
          <Mark glyph={glyph} px={px} radius={radius} />
        )}
        <span>{variant === "B" ? "OliLearn" : "Oli-Learn"}</span>
      </span>
    );
  }

  if (variant === "B") {
    return (
      <span className={`inline-flex items-center gap-2 ${type}`}>
        {withMark && <Mark glyph={glyph} px={px} radius={radius} />}
        <span>
          <span className="text-primary">Oli</span>
          <span className="text-[hsl(var(--amber))]">Learn</span>
        </span>
      </span>
    );
  }

  if (variant === "C") {
    return (
      <span className={`inline-flex items-center gap-2.5 ${type}`}>
        <Mark glyph={glyph} px={px} radius={radius} />
        <span className="text-foreground">Oli-Learn</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${type}`}>
      {withMark && <Mark glyph={glyph} px={px} radius={radius} />}
      <span>
        <span className="text-primary">Oli-</span>
        <span className="text-[hsl(var(--amber))]">Learn</span>
      </span>
    </span>
  );
}
