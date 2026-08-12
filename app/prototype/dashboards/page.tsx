/**
 * PROTOTYPE — throwaway route for ticket #24. Delete once the layout is chosen.
 * /prototype/dashboards?variant=A|B|C&role=student|admin&empty=1
 */

import { Geist, Outfit } from "next/font/google";
import { Suspense } from "react";

import { DashboardsPrototype } from "./dashboards-prototype";

const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });

export default function DashboardsPrototypePage() {
  return (
    <div
      className={`${geist.variable} ${outfit.variable}`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      <Suspense fallback={<div className="p-8 text-sm">Loading…</div>}>
        <DashboardsPrototype />
      </Suspense>
    </div>
  );
}
