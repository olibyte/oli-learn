import { cn } from "@/lib/utils";
import { isTwoTone, WORDMARK_SIZES, type WordmarkSize } from "@/lib/design/wordmark";

/**
 * The Oli-Learn wordmark (docs/design/oli-learn.md §3).
 *
 * `Oli-Learn`, Outfit 700, tracking-tight - blue `Oli-` (the hyphen included)
 * and amber `Learn`. The name keeps its hyphen so the mark spells the brand the
 * way `CONTEXT.md` does.
 *
 * **Choosing one ink or two is this component's job, not the caller's.** The
 * amber only clears WCAG at large-text sizes, so callers pass a size and the
 * component decides; see `lib/design/wordmark.ts` for the threshold and the
 * test that pins it. There is no prop to override it, because every legitimate
 * override is a contrast failure.
 *
 * No mark sits beside it in the header: a two-tone wordmark already carries the
 * colour, and adding the tile would compete with the Sign in button.
 */
export function Wordmark({
  size = "xl",
  className,
}: {
  size?: WordmarkSize;
  className?: string;
}) {
  const type = cn(
    "font-display font-bold tracking-tight",
    WORDMARK_SIZES[size].className,
    className,
  );

  if (!isTwoTone(size)) {
    return <span className={cn(type, "text-primary")}>Oli-Learn</span>;
  }

  return (
    <span className={type}>
      <span className="text-primary">Oli-</span>
      <span className="text-brand-amber">Learn</span>
    </span>
  );
}

/**
 * The compact form: an `OL` tile in white Outfit 700 on `--primary`, 5.63:1.
 *
 * This is the brand's square crop - the favicon, the app icon, any avatar-sized
 * slot. A glyph tile was tested and rejected: `GraduationCap` is an unreadable
 * blob at 16px, where the monogram stays crisp.
 *
 * The shipped icons are committed PNGs, so nothing renders this at request
 * time. It is kept because it is the source those PNGs were captured from - the
 * alternative is that regenerating them means going back to a prototype branch.
 */
export function Monogram({
  px,
  className,
}: {
  px: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-primary font-display font-bold text-primary-foreground",
        className,
      )}
      style={{
        width: px,
        height: px,
        // Proportional, so the tile reads the same at 16px and at 512px.
        borderRadius: Math.max(3, px * 0.22),
        fontSize: px * 0.5,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}
    >
      OL
    </span>
  );
}
