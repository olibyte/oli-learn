"use client";

/** PROTOTYPE — throwaway. Ticket #23. Three landing pages, one switcher. */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { VariantSwitcher } from "@/components/prototype/variant-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SOCIAL_TOKENS } from "./mark";
import { Footer, Header } from "./shared";
import { VARIANTS, VariantA, VariantB, VariantC } from "./variants";

export function LandingPrototype() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const key = params.get("variant") ?? "A";
  const variant = VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
  const accent = params.get("accent") ?? "blue";
  // `?bare=1` drops the prototype banner so reference screenshots are clean.
  const bare = params.get("bare") === "1";

  const setAccent = (a: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("accent", a);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <>
      <style>{`${SOCIAL_TOKENS.replaceAll("[data-social]", "[data-landing]")}\n${bare ? "nextjs-portal{display:none!important}" : ""}`}</style>

      <div
        data-landing
        className="flex min-h-svh flex-col bg-background text-foreground"
      >
        <Header />

        {!bare && (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
          <div className="rounded-lg border border-dashed p-3 text-sm">
            <span className="font-semibold">
              Prototype · #23 · {variant.key} — {variant.name}
            </span>
            <span className="ml-2 text-muted-foreground">{variant.thesis}</span>
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Hero accent:</span>
              {["blue", "amber"].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAccent(a)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    accent === a
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {a}
                </button>
              ))}
              <span className="ml-2 text-muted-foreground">Theme:</span>
              <ThemeSwitcher />
            </span>
          </div>
        </div>
        )}

        {variant.key === "B" ? (
          <VariantB accent={accent} />
        ) : variant.key === "C" ? (
          <VariantC accent={accent} />
        ) : (
          <VariantA accent={accent} />
        )}

        <Footer />
      </div>

      <VariantSwitcher
        variants={VARIANTS.map((v) => v.key)}
        current={variant.key}
        label={variant.name}
      />
    </>
  );
}
