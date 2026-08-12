"use client";

/** PROTOTYPE — throwaway. Ticket #24. */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { VariantSwitcher } from "@/components/prototype/variant-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Wordmark } from "./mark";
import { SOCIAL_TOKENS } from "./mark";
import { Dashboard } from "./variants";
import { VARIANTS } from "./variants";

export function DashboardsPrototype() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const key = params.get("variant") ?? "A";
  const variant = VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];
  const role = params.get("role") ?? "student";
  const empty = params.get("empty") === "1";

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set(k, v);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const chip = (k: string, v: string, label: string, active: boolean) => (
    <button
      key={`${k}-${v}`}
      type="button"
      onClick={() => set(k, v)}
      className={`rounded-full border px-2.5 py-0.5 text-xs ${
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <style>{SOCIAL_TOKENS.replaceAll("[data-social]", "[data-dash]")}</style>

      <div data-dash className="flex min-h-svh flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
            <div className="flex items-center gap-5">
              <Wordmark size="text-xl" />
              {role === "admin" && (
                <span className="font-medium text-primary">Admin</span>
              )}
            </div>
            <span className="text-muted-foreground">
              {role === "admin" ? "admin@example.com" : "student@example.com"}
            </span>
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
            <span className="font-semibold">
              #24 · {variant.key} — {variant.name}
            </span>
            <span className="text-muted-foreground">{variant.thesis}</span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {chip("role", "student", "student", role === "student")}
              {chip("role", "admin", "admin", role === "admin")}
              {chip("empty", empty ? "0" : "1", "empty state", empty)}
              <ThemeSwitcher />
            </span>
          </div>
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          <Dashboard variant={variant.key} role={role} empty={empty} />
        </main>
      </div>

      <VariantSwitcher
        variants={VARIANTS.map((v) => v.key)}
        current={variant.key}
        label={variant.name}
      />
    </>
  );
}
