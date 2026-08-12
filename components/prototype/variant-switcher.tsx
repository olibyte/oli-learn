"use client";

/** PROTOTYPE — throwaway. Floating variant switcher; never ships. */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

export function VariantSwitcher({
  variants,
  current,
  label,
}: {
  variants: string[];
  current: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = useCallback(
    (delta: number) => {
      const i = variants.indexOf(current);
      const next = variants[(i + delta + variants.length) % variants.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [current, pathname, router, searchParams, variants],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (typing) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-zinc-900 px-1.5 py-1.5 text-sm text-white shadow-xl">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full p-1.5 hover:bg-white/15"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 font-mono text-xs tabular-nums">
        {current}
        {label ? ` — ${label}` : ""}
        <span className="ml-2 text-white/50">← →</span>
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full p-1.5 hover:bg-white/15"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
