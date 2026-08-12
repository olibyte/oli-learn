/**
 * PROTOTYPE — throwaway route for ticket #22. Delete once the card is chosen.
 * /prototype/social?variant=A|B|C
 */

import { Geist, Outfit } from "next/font/google";
import { Suspense } from "react";

import { SocialPrototype } from "./social-prototype";

const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });

export default function SocialPrototypePage() {
  return (
    <div
      className={`${geist.variable} ${outfit.variable}`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      <Suspense fallback={<div className="p-8 text-sm">Loading cards…</div>}>
        <SocialPrototype />
      </Suspense>
    </div>
  );
}
