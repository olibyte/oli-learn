/**
 * PROTOTYPE — throwaway route for ticket #21. Delete once the lockup is chosen.
 * Three lockup strategies: /prototype/wordmark?variant=A|B|C&glyph=cap
 */

import { Geist, Outfit } from "next/font/google";
import { Suspense } from "react";

import { WordmarkPrototype } from "./wordmark-prototype";

// The configuration settled in #19.
const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });

export default function WordmarkPrototypePage() {
  return (
    <div className={`${geist.variable} ${outfit.variable}`}>
      <Suspense fallback={<div className="p-8 text-sm">Loading lockups…</div>}>
        <WordmarkPrototype />
      </Suspense>
    </div>
  );
}
