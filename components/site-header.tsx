import Link from "next/link";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { Wordmark } from "@/components/oli-learn-wordmark";

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
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          {/* `xl` is the smallest size the mark keeps both inks at, so the
              header is where the brand colour actually reads. No mark beside
              it - it would compete with the Sign in button. */}
          <Link href={homeHref} className="whitespace-nowrap">
            <Wordmark size="xl" />
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
