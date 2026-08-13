import Link from "next/link";

import { Wordmark } from "@/components/oli-learn-wordmark";
import { ThemeSwitcher } from "@/components/theme-switcher";

/**
 * Shared chrome for every auth screen.
 *
 * The spec expects these pages to inherit the tokens and the wordmark without
 * laying out how (docs/design/oli-learn.md §4 covers `/` only), and the
 * wordmark was judged against the auth card as one of the places it has to
 * work (#21). Without this they were the one part of the app with no brand on
 * them at all: a bare card floating on white.
 *
 * The centring wrapper used to be copy-pasted into all six pages. It lives
 * here now, so each page is just its form.
 *
 * No header or footer: a half-authenticated bar offering "Sign in" to someone
 * already signing in is noise, and these pages show no times, so the footer's
 * timezone note has nothing to say. The wordmark links home, which is the only
 * navigation the screens actually need.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6 md:p-10">
      {/* Top right, like every other screen. Positioned rather than placed in a
          bar: these pages deliberately have no header, and one control does not
          justify introducing one. */}
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeSwitcher />
      </div>
      <Link href="/" className="shrink-0">
        {/* `2xl` keeps both inks - this is the one place in the flow the brand
            is stated rather than assumed. */}
        <Wordmark size="2xl" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
