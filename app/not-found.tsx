import Link from "next/link";

import { Wordmark } from "@/components/oli-learn-wordmark";
import { Button } from "@/components/ui/button";

/**
 * Reached by `notFound()` - which in this app means a signed-in student who
 * typed `/protected/admin`, the deliberate 404 that hides the admin route's
 * existence rather than announcing it with a 403.
 *
 * It exists because Next's built-in 404 has no `<main>` and no `<h1>`: the
 * accessibility pass measured it at two axe violations (`landmark-one-main`,
 * `region` on both of its nodes) on a page a real user of this app can reach.
 * Next's own note on this file says the default UI also ignores an app-level
 * theme and follows the OS instead, so a student in dark mode got a white page.
 *
 * Deliberately no `SiteHeader`: that reads cookies to decide between "Sign in"
 * and "Logout", which would make the 404 dynamic. There is nothing here worth
 * that, and a wrong greeting is worse than none.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      {/* The banner landmark, for the same reason the auth layout has one:
          without it this link is the one element belonging to no landmark. */}
      <header>
        <Link href="/">
          <Wordmark size="2xl" />
        </Link>
      </header>

      <main className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground">
          That page doesn&apos;t exist, or isn&apos;t yours to open.
        </p>
        <Button asChild className="mt-2">
          <Link href="/protected">Go to your consultations</Link>
        </Button>
      </main>
    </div>
  );
}
