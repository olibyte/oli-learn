import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Focus has to stay visible in Windows High Contrast / forced-colors mode, and
 * in this codebase that is *not* something the component library gives you.
 *
 * Every interactive primitive in `components/ui/` draws its focus indicator
 * with a Tailwind `ring`, which compiles to a `box-shadow` - and forced-colors
 * mode does not paint box-shadows. The only reason focus survived there before
 * this file existed was that `outline-none`, which those same components apply,
 * happens to compile under Tailwind v3 to a *transparent* outline
 * (`outline: 2px solid #0000`) rather than to no outline at all, and
 * forced-colors repaints a transparent outline in a system colour. Tailwind v4
 * emits `outline-style: none` for the identical class, which would remove the
 * indicator with nothing to replace it.
 *
 * So `app/globals.css` states the guarantee itself. This test is what stops
 * that block being deleted as redundant - it looks redundant precisely because
 * the accident it replaces is invisible until the day it stops working.
 *
 * Parses the stylesheet rather than restating it, for the same reason
 * `contrast.test.ts` does: a test carrying its own copy keeps passing after
 * someone edits the file it is meant to be about.
 */

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Comments are stripped first, so prose about `outline` cannot satisfy a test. */
const CSS = readFileSync(here("../../app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const UI_DIR = here("../../components/ui");

function forcedColorsBlock(): string {
  const at = CSS.indexOf("@media (forced-colors: active)");
  expect(
    at,
    "app/globals.css has no `@media (forced-colors: active)` block",
  ).toBeGreaterThanOrEqual(0);

  // Walk braces from the block's opening one, so a nested rule cannot end it.
  const open = CSS.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) return CSS.slice(open + 1, i);
  }
  throw new Error("Unterminated `@media (forced-colors: active)` block");
}

describe("forced-colors focus indicator", () => {
  const block = forcedColorsBlock();

  it("targets :focus-visible", () => {
    expect(block).toMatch(/:focus-visible\s*\{/);
  });

  it("sets a real outline, not `none` and not zero width", () => {
    const outline = block.match(/outline:\s*([^;]+);/)?.[1].trim();
    expect(outline, "no `outline:` declaration inside the block").toBeDefined();

    expect(outline).not.toMatch(/\bnone\b/);
    // A width of 0 is the other way to have no indicator at all.
    const width = outline!.match(/(\d+(?:\.\d+)?)px/)?.[1];
    expect(Number(width ?? 0)).toBeGreaterThan(0);
  });

  it("uses a system colour, so it follows the user's own theme", () => {
    // The forced-colors keywords a focus ring may legitimately use. A literal
    // colour would be overridden by the mode anyway, or worse, ignored.
    expect(block).toMatch(/outline:[^;]*\b(Highlight|CanvasText|LinkText)\b/);
  });

  it("offsets the outline so it is not flush against the control", () => {
    expect(block).toMatch(/outline-offset:\s*[1-9]/);
  });
});

describe("the premise the block rests on", () => {
  const files = readdirSync(UI_DIR).filter((f) => f.endsWith(".tsx"));

  it("finds interactive primitives still applying `outline-none`", () => {
    const users = files.filter((f) =>
      readFileSync(`${UI_DIR}/${f}`, "utf8").includes("outline-none"),
    );

    // If this ever reaches zero the block above may genuinely be redundant -
    // but that is a conclusion to reach deliberately, not to discover by
    // finding this test red.
    expect(
      users.length,
      "no component applies `outline-none` any more - re-check whether the " +
        "forced-colors block in app/globals.css is still load-bearing",
    ).toBeGreaterThan(0);
  });

  it("finds focus drawn with a ring, which forced-colors mode does not paint", () => {
    const ringed = files.filter((f) =>
      /focus(-visible)?:ring/.test(readFileSync(`${UI_DIR}/${f}`, "utf8")),
    );

    expect(ringed.length).toBeGreaterThan(0);
  });
});
