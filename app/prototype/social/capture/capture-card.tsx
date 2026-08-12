"use client";

/** PROTOTYPE — throwaway. Ticket #22. Bare card for asset capture. */

import { useSearchParams } from "next/navigation";

import { SocialCard } from "../cards";
import { Monogram, SOCIAL_TOKENS } from "../mark";

export function CaptureCard() {
  const variant = useSearchParams().get("variant") ?? "A";

  // `nextjs-portal` is the dev-tools indicator. It is a real element in the DOM,
  // so an element-scoped screenshot bakes it into the asset.
  const reset = `${SOCIAL_TOKENS}\nhtml,body{margin:0;padding:0;overflow:hidden}\nnextjs-portal{display:none!important}`;

  // `?variant=icon-<px>` renders the monogram alone, so the icon files come out
  // of the same pipeline as the social card.
  const icon = variant.startsWith("icon-") ? Number(variant.slice(5)) : null;
  if (icon) {
    return (
      <>
        <style>{reset}</style>
        <div data-social>
          <Monogram px={icon} radius={icon * 0.22} />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{reset}</style>
      <SocialCard variant={variant} />
    </>
  );
}
