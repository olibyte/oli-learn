import { describe, expect, it } from "vitest";

import {
  isTwoTone,
  LARGE_TEXT_BOLD_PX,
  WORDMARK_SIZES,
  type WordmarkSize,
} from "./wordmark";

const SIZES = Object.keys(WORDMARK_SIZES) as WordmarkSize[];

describe("the wordmark size rule", () => {
  it.each(SIZES)(
    "%s goes two-tone only when it clears the large-text threshold",
    (size) => {
      expect(isTwoTone(size)).toBe(
        WORDMARK_SIZES[size].px >= LARGE_TEXT_BOLD_PX,
      );
    },
  );

  /**
   * The two call sites the spec names. If either flips, the header loses its
   * brand colour or the footer starts failing contrast.
   */
  it("puts the header (text-xl) in two tones and the footer (text-sm) in one", () => {
    expect(isTwoTone("xl")).toBe(true);
    expect(isTwoTone("sm")).toBe(false);
  });

  /**
   * The interesting boundary: `text-lg` is 18px, which is *below* the 18.66px
   * bold threshold. It looks large enough and is not, which is exactly the
   * mistake the rule exists to prevent.
   */
  it("keeps text-lg single-ink despite looking large", () => {
    expect(WORDMARK_SIZES.lg.px).toBeLessThan(LARGE_TEXT_BOLD_PX);
    expect(isTwoTone("lg")).toBe(false);
  });

  it("never returns to two tones as size decreases", () => {
    const ascending = [...SIZES].sort(
      (a, b) => WORDMARK_SIZES[a].px - WORDMARK_SIZES[b].px,
    );
    const flags = ascending.map(isTwoTone);

    expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
  });
});
