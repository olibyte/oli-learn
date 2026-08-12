import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Eye,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";

import { CredentialsCard } from "@/components/landing/credentials-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

const VALUES = [
  {
    icon: CalendarPlus,
    pill: "Book in minutes",
    body: "Pick a time, say why you need it, done. No email threads, no waiting for a reply.",
  },
  {
    icon: CalendarClock,
    pill: "Change your mind",
    body: "Reschedule or cancel from the same list. Nothing is deleted — a cancelled consultation stays visible.",
  },
  {
    icon: Eye,
    pill: "Oversight built in",
    body: "Administrators see every consultation across the system, read-only, without touching a student's booking.",
  },
] as const;

const ROLES = [
  {
    icon: GraduationCap,
    who: "Students",
    steps:
      "Sign in, book a consultation, and mark it complete once it has happened.",
  },
  {
    icon: ShieldCheck,
    who: "Administrators",
    steps:
      "Sign in and see every consultation in the system, across every student.",
  },
] as const;

/**
 * The landing page (docs/design/oli-learn.md §4).
 *
 * Hero left, demo credentials right, both above the fold. The conventional
 * full-height hero was tried and rejected on evidence: it pushes the
 * credentials card below the fold at 900px, and reaching those credentials
 * quickly is the whole job of this page for the person assessing it.
 *
 * Blue carries the hero accent. Amber is held back to the wordmark and the
 * value pills - at headline size the AA-legal amber step reads rust rather
 * than gold, which is what rules it out here.
 */
export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-wash">
          {/* The poster's one borrowed gesture: exactly one faint ring,
              bleeding off the hero's edge. The content below is `relative` so
              the ring can never paint in front of it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-48 -top-40 size-[460px] rounded-full border-[40px] border-primary/10"
          />

          <div className="relative mx-auto grid w-full max-w-5xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
                Book time with a tutor,{" "}
                <span className="text-primary">when it actually helps</span>.
              </h1>
              <p className="mt-5 max-w-prose text-lg text-muted-foreground">
                Students book and manage their own consultations. Administrators
                see every consultation in the system.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="w-full sm:w-auto">
                  <Link href="/auth/sign-up">
                    Create account <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="w-full sm:w-auto"
                >
                  <Link href="/auth/login">Sign in</Link>
                </Button>
              </div>
            </div>

            <CredentialsCard />
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          {/* Pills wrap rather than scroll at 375px. */}
          <ul className="flex flex-wrap gap-2">
            {VALUES.map((value) => (
              <li
                key={value.pill}
                className="rounded-full bg-accent px-4 py-1.5 font-display text-sm font-semibold text-accent-foreground"
              >
                {value.pill}
              </li>
            ))}
          </ul>

          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {VALUES.map(({ icon: Icon, pill, body }) => (
              <div key={pill} className="flex gap-3">
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-xl border bg-card p-6">
            <div className="grid gap-6 sm:grid-cols-2">
              {ROLES.map(({ icon: Icon, who, steps }) => (
                <div key={who} className="flex gap-3">
                  <Icon
                    aria-hidden
                    className="mt-0.5 size-5 shrink-0 text-primary"
                  />
                  <div>
                    <p className="font-display font-semibold">{who}</p>
                    <p className="text-sm text-muted-foreground">{steps}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
