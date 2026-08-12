/**
 * PROTOTYPE — throwaway. Ticket #22.
 *
 * One card, alone, at true size and nothing else on the page. Set the viewport
 * to 1200×630 and screenshot: what comes out is the shippable asset.
 * /prototype/social/capture?variant=A
 */

import { Geist, Outfit } from "next/font/google";
import { Suspense } from "react";

import { CaptureCard } from "./capture-card";

const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });

export default function CapturePage() {
  return (
    <div
      className={`${geist.variable} ${outfit.variable}`}
      style={{ fontFamily: "var(--font-body)", width: 1200, height: 630 }}
    >
      <Suspense fallback={null}>
        <CaptureCard />
      </Suspense>
    </div>
  );
}
