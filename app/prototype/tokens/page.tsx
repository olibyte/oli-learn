/**
 * PROTOTYPE — throwaway route for ticket #18. Delete once the palette is chosen.
 * Three colour-token systems on one sample surface: /prototype/tokens?variant=A
 */

import { Suspense } from "react";

import { TokensPrototype } from "./tokens-prototype";

export default function TokensPrototypePage() {
  // `useSearchParams` reads request data, so it must sit under a Suspense
  // boundary with cacheComponents on.
  return (
    <Suspense fallback={<div className="p-8 text-sm">Loading variants…</div>}>
      <TokensPrototype />
    </Suspense>
  );
}
