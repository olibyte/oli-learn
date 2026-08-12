import Link from "next/link";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";

/**
 * Shared top bar. `children` is the slot for route-specific nav items - the
 * protected layout puts the admin link there; the landing page passes nothing.
 */
export function SiteHeader({
  homeHref = "/",
  children,
}: {
  homeHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-b-foreground/10 bg-background/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <Link href={homeHref} className="whitespace-nowrap font-semibold">
            Mini-LMS
          </Link>
          {children}
        </div>
        <Suspense
          fallback={<div className="h-8 w-20 animate-pulse rounded bg-muted" />}
        >
          <AuthButton />
        </Suspense>
      </nav>
    </header>
  );
}
