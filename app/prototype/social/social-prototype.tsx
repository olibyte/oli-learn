"use client";

/**
 * PROTOTYPE — throwaway. Ticket #22.
 *
 * Gallery: the three 1200×630 cards at half scale, the icon set at true pixel
 * sizes against both browser chromes, and the metadata copy that ships with
 * them. `/prototype/social/capture?variant=X` renders one card alone at true
 * size, which is how the real PNG gets made.
 */

import { useSearchParams } from "next/navigation";

import { VariantSwitcher } from "@/components/prototype/variant-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { CARDS, SocialCard } from "./cards";
import { Monogram, SOCIAL_TOKENS } from "./mark";

const TITLE = "Oli-Learn — consultation booking";
const DESCRIPTION =
  "Students book and manage their own consultations. Administrators see every consultation in the system.";
const ALT = "Oli-Learn: consultation booking for students and administrators.";

export function SocialPrototype() {
  const params = useSearchParams();
  const key = params.get("variant") ?? "A";
  const card = CARDS.find((c) => c.key === key) ?? CARDS[0];

  return (
    <>
      <style>{SOCIAL_TOKENS}</style>

      <div data-social className="min-h-svh bg-background text-foreground">
        <main className="mx-auto max-w-[1240px] space-y-12 px-6 py-10 pb-28">
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prototype · ticket #22 · variant {card.key}
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
              {card.name}
            </p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {card.thesis}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              Theme: <ThemeSwitcher /> — the card follows it, so a dark-mode
              variant is free if we want one.
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Social card — 1200×630, shown at half scale
            </h2>
            <div
              className="overflow-hidden rounded-xl border"
              style={{ width: 600, height: 315 }}
            >
              <div style={{ transform: "scale(0.5)", transformOrigin: "top left" }}>
                <SocialCard variant={card.key} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Thumbnail test — this is roughly how it lands in a Slack unfurl:
            </p>
            <div
              className="overflow-hidden rounded-lg border"
              style={{ width: 360, height: 189 }}
            >
              <div style={{ transform: "scale(0.3)", transformOrigin: "top left" }}>
                <SocialCard variant={card.key} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Icons — true pixel sizes, both browser chromes
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-lg border bg-white p-6">
                <p className="text-sm font-medium text-zinc-900">Light chrome</p>
                <div className="flex items-end gap-5">
                  {[16, 32, 48, 180].map((px) => (
                    <div key={px} className="space-y-1 text-center">
                      <Monogram px={px} />
                      <p className="text-[10px] text-zinc-500">{px}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 rounded-lg border bg-zinc-900 p-6">
                <p className="text-sm font-medium text-zinc-100">Dark chrome</p>
                <div className="flex items-end gap-5">
                  {[16, 32, 48, 180].map((px) => (
                    <div key={px} className="space-y-1 text-center">
                      <Monogram px={px} />
                      <p className="text-[10px] text-zinc-400">{px}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              The tile carries its own blue background, so it does not dissolve
              into either chrome — which is the argument for one icon rather than
              a light/dark pair.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Metadata that ships with it
            </h2>
            <dl className="space-y-3 rounded-lg border p-6 text-sm">
              <div>
                <dt className="font-medium">title</dt>
                <dd className="text-muted-foreground">{TITLE}</dd>
              </div>
              <div>
                <dt className="font-medium">description</dt>
                <dd className="text-muted-foreground">{DESCRIPTION}</dd>
              </div>
              <div>
                <dt className="font-medium">opengraph-image.alt.txt</dt>
                <dd className="text-muted-foreground">{ALT}</dd>
              </div>
              <div>
                <dt className="font-medium">currently</dt>
                <dd className="text-muted-foreground">
                  <code>app/layout.tsx:12</code> still says &ldquo;Mini-LMS —
                  consultation booking&rdquo;.
                </dd>
              </div>
            </dl>
          </section>
        </main>
      </div>

      <VariantSwitcher
        variants={CARDS.map((c) => c.key)}
        current={card.key}
        label={card.name}
      />
    </>
  );
}
