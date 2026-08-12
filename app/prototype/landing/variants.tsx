"use client";

/**
 * PROTOTYPE — throwaway. Ticket #23.
 *
 * Three landing pages that disagree about what the page is *for*: a pitch, a
 * split hero that puts the credentials above the fold, or a door that asks
 * which role you are. Same copy, same tokens — different hierarchy.
 *
 * `accent` is a separate control from the layout so the blue-vs-amber question
 * can be judged without confounding it with structure.
 */

import { ArrowRight, CalendarClock, CalendarPlus, Eye, GraduationCap, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COPY, CredentialsCard, Geometry } from "./shared";

const ICONS = [CalendarPlus, CalendarClock, Eye];

export const VARIANTS = [
  {
    key: "A",
    name: "Pitch",
    thesis:
      "Classic marketing stack. Hero on the wash, credentials directly under it, then value cards and a role explainer.",
  },
  {
    key: "B",
    name: "Split",
    thesis:
      "Hero left, credentials card right — both above the fold. The fastest path from landing to signed in.",
  },
  {
    key: "C",
    name: "Door",
    thesis:
      "Barely a pitch. One line, then two role panels: pick who you are, take the credentials, go.",
  },
] as const;

function Heading({
  accent,
  className = "",
}: {
  accent: string;
  className?: string;
}) {
  const accentClass = accent === "amber" ? "text-[hsl(var(--amber))]" : "text-primary";
  return (
    <h1
      className={`font-[family-name:var(--font-display)] font-bold leading-[1.08] tracking-tight ${className}`}
    >
      {COPY.heroLead} <span className={accentClass}>{COPY.heroAccent}</span>.
    </h1>
  );
}

/* ---------------------------------------------------------------- A — Pitch */

export function VariantA({ accent }: { accent: string }) {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden bg-[hsl(var(--wash))]">
        <Geometry className="-right-40 -top-56 size-[520px] border-[44px]" />
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <Heading accent={accent} className="max-w-3xl text-4xl sm:text-5xl md:text-6xl" />
          <p className="mt-6 max-w-prose text-lg text-muted-foreground">
            {COPY.subhead}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <a href="/auth/sign-up">
                Create account <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <a href="/auth/login">Sign in</a>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="-mt-8 max-w-md">
          <CredentialsCard />
        </div>
      </div>

      <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {COPY.values.map((v, i) => {
            const Icon = ICONS[i];
            return (
              <div key={v.pill} className="rounded-xl border bg-card p-5">
                <Icon className="size-5 text-primary" />
                <p className="mt-3 inline-block rounded-full bg-accent px-3 py-1 font-[family-name:var(--font-display)] text-sm font-semibold text-accent-foreground">
                  {v.pill}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">{v.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {COPY.roles.map((r, i) => (
            <div key={r.who} className="flex gap-3">
              {i === 0 ? (
                <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" />
              ) : (
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              )}
              <div>
                <p className="font-[family-name:var(--font-display)] font-semibold">
                  {r.who}
                </p>
                <p className="text-sm text-muted-foreground">{r.steps}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ---------------------------------------------------------------- B — Split */

export function VariantB({ accent }: { accent: string }) {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden bg-[hsl(var(--wash))]">
        <Geometry className="-left-48 -top-40 size-[460px] border-[40px]" />
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <Heading accent={accent} className="text-4xl sm:text-5xl" />
            <p className="mt-5 max-w-prose text-lg text-muted-foreground">
              {COPY.subhead}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <a href="/auth/sign-up">
                  Create account <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <a href="/auth/login">Sign in</a>
              </Button>
            </div>
          </div>
          <CredentialsCard compact />
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {COPY.values.map((v) => (
            <span
              key={v.pill}
              className="rounded-full bg-accent px-4 py-1.5 font-[family-name:var(--font-display)] text-sm font-semibold text-accent-foreground"
            >
              {v.pill}
            </span>
          ))}
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {COPY.values.map((v, i) => {
            const Icon = ICONS[i];
            return (
              <div key={v.pill} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">{v.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-xl border bg-card p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {COPY.roles.map((r, i) => (
              <div key={r.who} className="flex gap-3">
                {i === 0 ? (
                  <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" />
                ) : (
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                )}
                <div>
                  <p className="font-[family-name:var(--font-display)] font-semibold">
                    {r.who}
                  </p>
                  <p className="text-sm text-muted-foreground">{r.steps}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

/* ----------------------------------------------------------------- C — Door */

export function VariantC({ accent }: { accent: string }) {
  const accentClass = accent === "amber" ? "text-[hsl(var(--amber))]" : "text-primary";
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden bg-[hsl(var(--wash))]">
        <Geometry className="-right-32 -bottom-56 size-[480px] border-[42px]" />
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <Heading accent={accent} className="max-w-2xl text-3xl sm:text-4xl" />
          <p className="mt-4 max-w-prose text-muted-foreground">{COPY.subhead}</p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {COPY.roles.map((r, i) => (
              <div
                key={r.who}
                className="flex flex-col rounded-xl border bg-card p-5"
              >
                <div className="flex items-center gap-2">
                  {i === 0 ? (
                    <GraduationCap className="size-5 text-primary" />
                  ) : (
                    <ShieldCheck className="size-5 text-primary" />
                  )}
                  <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
                    {r.who}
                  </p>
                </div>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">
                  {r.steps}
                </p>
                <div className="mt-4 rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Demo account
                  </p>
                  <p className="truncate font-mono text-sm">
                    {i === 0 ? "student@example.com" : "admin@example.com"}
                  </p>
                </div>
                <Button className="mt-3 w-full" asChild variant={i === 0 ? "default" : "outline"}>
                  <a href="/auth/login">
                    Sign in as {r.who.toLowerCase().slice(0, -1)}
                  </a>
                </Button>
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Password for both:{" "}
            <span className="font-mono text-foreground">demo-password-123</span>{" "}
            — or{" "}
            <a href="/auth/sign-up" className={`underline ${accentClass}`}>
              create your own account
            </a>
            .
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {COPY.values.map((v, i) => {
            const Icon = ICONS[i];
            return (
              <div key={v.pill}>
                <Icon className="size-5 text-primary" />
                <p className="mt-2 font-[family-name:var(--font-display)] font-semibold">
                  {v.pill}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{v.body}</p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
