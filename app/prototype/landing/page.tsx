/**
 * PROTOTYPE — throwaway route for ticket #23. Delete once the layout is chosen.
 * /prototype/landing?variant=A|B|C&accent=blue|amber
 */

import { Geist, Outfit } from "next/font/google";
import { Suspense } from "react";

import { LandingPrototype } from "./landing-prototype";

const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });

export default function LandingPrototypePage() {
  return (
    <div
      className={`${geist.variable} ${outfit.variable}`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      <Suspense fallback={<div className="p-8 text-sm">Loading…</div>}>
        <LandingPrototype />
      </Suspense>
    </div>
  );
}
