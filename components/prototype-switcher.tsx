"use client";

// THROWAWAY - prototype scaffolding for issue #5. Delete along with
// app/protected/_prototype once a variant has won.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
}: {
  variants: { key: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = searchParams.get("variant") ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-neutral-900 px-1.5 py-1.5 text-white shadow-xl dark:border-black/20 dark:bg-white dark:text-neutral-900">
        <button
          onClick={() => go(-1)}
          aria-label="Previous variant"
          className="rounded-full p-1.5 transition hover:bg-white/15 dark:hover:bg-black/10"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 text-xs font-medium tabular-nums whitespace-nowrap">
          {variants[index].key} — {variants[index].name}
        </span>
        <button
          onClick={() => go(1)}
          aria-label="Next variant"
          className="rounded-full p-1.5 transition hover:bg-white/15 dark:hover:bg-black/10"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        prototype · ← → to switch
      </p>
    </div>
  );
}
