"use client";

/**
 * PROTOTYPE — throwaway. Ticket #21.
 *
 * Each lockup is shown in every place it actually has to work: the header, the
 * footer, an auth card, the social-image crop, and at favicon sizes down to
 * 16px. A lockup that only works at hero scale is not an answer.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { VariantSwitcher } from "@/components/prototype/variant-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { GLYPHS, LOCKUPS, Lockup, Mark, Monogram, type GlyphKey } from "./lockups";

const TOKENS = `
[data-wm] {
  --background: 0 0% 100%; --foreground: 213 60% 14%; --wash: 213 100% 98%;
  --card: 0 0% 100%; --primary: 213 88% 43%; --primary-foreground: 0 0% 100%;
  --muted: 213 45% 95%; --muted-foreground: 213 22% 40%;
  --accent: 38 95% 90%; --accent-foreground: 27 85% 25%;
  --border: 213 32% 82%; --amber: 33 95% 40%;
}
.dark [data-wm] {
  --background: 213 50% 10%; --foreground: 210 40% 96%; --wash: 213 55% 8%;
  --card: 213 45% 13%; --primary: 211 92% 62%; --primary-foreground: 213 60% 10%;
  --muted: 213 35% 18%; --muted-foreground: 213 22% 72%;
  --accent: 30 55% 22%; --accent-foreground: 38 95% 76%;
  --border: 213 30% 24%; --amber: 38 95% 68%;
}
`;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {hint && <p className="max-w-prose text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

export function WordmarkPrototype() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const key = params.get("variant") ?? "A";
  const lockup = LOCKUPS.find((l) => l.key === key) ?? LOCKUPS[0];
  const glyph = (params.get("glyph") ?? "cap") as GlyphKey;

  const setGlyph = (g: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("glyph", g);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <>
      <style>{TOKENS}</style>

      <div data-wm className="min-h-svh bg-background text-foreground"
        style={{ fontFamily: "var(--font-body)" }}>
        {/* the real header, at real size ------------------------------- */}
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
            <Lockup variant={lockup.key} glyph={glyph} size="text-xl" />
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Admin</span>
              <span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
                Sign in
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 pb-28 sm:px-6">
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prototype · ticket #21 · variant {lockup.key}
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
              {lockup.name}
            </p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {lockup.thesis}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Glyph:</span>
              {Object.entries(GLYPHS).map(([k, { label, Icon }]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setGlyph(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    glyph === k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
              <span className="ml-2 text-muted-foreground">Theme:</span>
              <ThemeSwitcher />
            </div>
          </div>

          <Section
            title="At size"
            hint="The lockup from footer scale to hero scale. Watch the optical balance between the two halves as it grows."
          >
            <div className="flex flex-wrap items-baseline gap-x-10 gap-y-6 rounded-lg border p-6">
              {["text-sm", "text-base", "text-xl", "text-3xl", "text-5xl"].map((s) => (
                <Lockup key={s} variant={lockup.key} glyph={glyph} size={s} />
              ))}
            </div>
          </Section>

          <Section
            title="Favicon — does it survive 16px?"
            hint="Browser tabs render at 16px. The glyph tile and the monogram are the two candidates; anything that turns to mush here is not the answer, whatever it looks like at 48."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-lg border p-6">
                <p className="text-sm font-medium">Glyph tile</p>
                <div className="flex items-end gap-4">
                  {[48, 32, 24, 16].map((px) => (
                    <div key={px} className="space-y-1 text-center">
                      <Mark glyph={glyph} px={px} radius={px <= 24 ? "rounded-[4px]" : "rounded-lg"} />
                      <p className="text-[10px] text-muted-foreground">{px}px</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 rounded-lg border p-6">
                <p className="text-sm font-medium">Monogram</p>
                <div className="flex items-end gap-4">
                  {[48, 32, 24, 16].map((px) => (
                    <div key={px} className="space-y-1 text-center">
                      <Monogram px={px} radius={px <= 24 ? "rounded-[4px]" : "rounded-lg"} />
                      <p className="text-[10px] text-muted-foreground">{px}px</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Social image crop"
            hint="1200×630, shown at half size. This is the first thing a reviewer sees when the link is pasted anywhere."
          >
            <div
              className="flex flex-col justify-between rounded-xl bg-[hsl(var(--wash))] p-10"
              style={{ width: 600, height: 315, maxWidth: "100%" }}
            >
              <Lockup variant={lockup.key} glyph={glyph} size="text-4xl" />
              <div>
                <p className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-tight">
                  Book time with a tutor,{" "}
                  <span className="text-primary">when it actually helps</span>.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Consultation booking for students and administrators.
                </p>
              </div>
            </div>
          </Section>

          <Section
            title="Auth card"
            hint="The five auth pages centre a card on an empty page — the lockup is the only branding there."
          >
            <div className="flex justify-center rounded-lg bg-[hsl(var(--wash))] p-10">
              <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex justify-center">
                  <Lockup variant={lockup.key} glyph={glyph} size="text-2xl" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Sign in to manage your consultations.
                </p>
                <div className="h-9 rounded-md border bg-background" />
                <div className="h-9 rounded-md border bg-background" />
                <div className="h-9 rounded-md bg-primary" />
              </div>
            </div>
          </Section>

          <Section
            title="Footer"
            hint="Small, muted, next to a theme switcher."
          >
            <div className="flex items-center justify-between rounded-lg border px-6 py-4 text-xs text-muted-foreground">
              <Lockup variant={lockup.key} glyph={glyph} size="text-sm" />
              <span>Consultation booking</span>
            </div>
          </Section>

          <Section
            title="Header with the mark beside the wordmark"
            hint="Variant C always carries the mark. For A and B the question is whether the mark earns its place in the header, or belongs only in the favicon."
          >
            <div className="flex items-center justify-between rounded-lg border px-6 py-3">
              <Lockup variant={lockup.key} glyph={glyph} size="text-xl" withMark />
              <span className="text-sm text-muted-foreground">with mark</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-6 py-3">
              <Lockup variant={lockup.key} glyph={glyph} size="text-xl" />
              <span className="text-sm text-muted-foreground">without</span>
            </div>
          </Section>
        </main>
      </div>

      <VariantSwitcher
        variants={LOCKUPS.map((l) => l.key)}
        current={lockup.key}
        label={lockup.name}
      />
    </>
  );
}
