/**
 * PROTOTYPE — throwaway route for ticket #19. Delete once the face is chosen.
 * Four display typefaces on one surface: /prototype/type?variant=A|B|C|D
 */

import { Suspense } from "react";

import { figtree, geist, nunitoSans, outfit, poppins } from "./fonts";
import { TypePrototype } from "./type-prototype";

export default function TypePrototypePage() {
  return (
    <div
      className={`${geist.variable} ${outfit.variable} ${poppins.variable} ${figtree.variable} ${nunitoSans.variable}`}
    >
      <Suspense fallback={<div className="p-8 text-sm">Loading faces…</div>}>
        <TypePrototype />
      </Suspense>
    </div>
  );
}
