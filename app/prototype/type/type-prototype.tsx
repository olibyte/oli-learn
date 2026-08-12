"use client";

/**
 * PROTOTYPE — throwaway. Ticket #19.
 *
 * Four display faces on one surface, `?variant=A|B|C|D`. Structure and palette
 * are held identical (A′ tokens from ticket #18) so the typeface is the only
 * thing moving. Strings are the app's real ones — hero, dashboard headings,
 * stat tiles, table headers, dates and times — because a specimen sheet flatters
 * every face and a dashboard flatters none.
 *
 * Body copy stays Geist throughout: the decision is headings-only.
 */

import { useSearchParams } from "next/navigation";

import { VariantSwitcher } from "@/components/prototype/variant-switcher";
import { CANDIDATES } from "./fonts";

const TOKENS = `
[data-type-proto] {
  --background: 0 0% 100%; --foreground: 213 60% 14%; --wash: 213 100% 98%;
  --card: 0 0% 100%; --primary: 213 88% 43%; --primary-foreground: 0 0% 100%;
  --muted: 213 45% 95%; --muted-foreground: 213 22% 40%;
  --accent: 38 95% 90%; --accent-foreground: 27 85% 25%;
  --border: 213 32% 82%; --amber-large: 33 95% 40%;
  --status-scheduled-bg: 213 92% 92%; --status-scheduled-fg: 213 88% 30%;
  --status-completed-bg: 160 60% 90%; --status-completed-fg: 162 88% 22%;
}
.dark [data-type-proto] {
  --background: 213 50% 10%; --foreground: 210 40% 96%; --wash: 213 55% 8%;
  --card: 213 45% 13%; --primary: 211 92% 62%; --primary-foreground: 213 60% 10%;
  --muted: 213 35% 18%; --muted-foreground: 213 22% 72%;
  --accent: 30 55% 22%; --accent-foreground: 38 95% 76%;
  --border: 213 30% 24%; --amber-large: 38 95% 68%;
  --status-scheduled-bg: 213 60% 22%; --status-scheduled-fg: 211 92% 80%;
  --status-completed-bg: 162 45% 18%; --status-completed-fg: 158 70% 72%;
}
`;

function Wordmark({ className, size }: { className: string; size: string }) {
  return (
    <span className={`${className} ${size} font-bold tracking-tight`}>
      <span className="text-primary">Oli</span>
      <span className="text-[hsl(var(--amber-large))]">Learn</span>
    </span>
  );
}

export function TypePrototype() {
  const params = useSearchParams();
  const key = params.get("variant") ?? "A";
  const face = CANDIDATES.find((c) => c.key === key) ?? CANDIDATES[0];
  const D = face.className; // display face

  return (
    <>
      <style>{TOKENS}</style>

      <div
        data-type-proto
        className="min-h-svh bg-background text-foreground"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {/* header ------------------------------------------------------- */}
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
            <Wordmark className={D} size="text-xl" />
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Admin</span>
              <span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
                Sign in
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-14 px-4 py-10 pb-28 sm:px-6">
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prototype · ticket #19 · variant {face.key}
            </p>
            <p className={`${D} mt-1 text-2xl font-semibold`}>{face.name}</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {face.note}
            </p>
            <p className="mt-2 text-sm">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  face.variableFont
                    ? "bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-fg))]"
                    : "bg-accent text-accent-foreground"
                }`}
              >
                {face.files}
              </span>
            </p>
          </div>

          {/* hero on the wash ------------------------------------------- */}
          <section className="rounded-xl bg-[hsl(var(--wash))] p-8 sm:p-12">
            <h1
              className={`${D} max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl`}
            >
              Book time with a tutor,{" "}
              <span className="text-primary">when it actually helps</span>.
            </h1>
            <p className="mt-5 max-w-prose text-lg text-muted-foreground">
              Students book and manage their own consultations. Administrators
              see every consultation in the system. This paragraph stays in
              Geist — the display face is for headings only.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {["Quality before quantity", "Continual support"].map((p) => (
                <span
                  key={p}
                  className={`${D} rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground`}
                >
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* scale ------------------------------------------------------ */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Heading scale
            </h2>
            {[
              ["text-5xl", "Book a consultation"],
              ["text-3xl", "Your consultations"],
              ["text-2xl", "All consultations"],
              ["text-xl", "No consultations yet"],
              ["text-base", "Reschedule this consultation"],
            ].map(([size, text]) => (
              <div key={size} className="flex items-baseline gap-4 border-b pb-3">
                <code className="w-20 shrink-0 text-xs text-muted-foreground">
                  {size}
                </code>
                <span className={`${D} ${size} font-semibold tracking-tight`}>
                  {text}
                </span>
              </div>
            ))}
          </section>

          {/* weights ---------------------------------------------------- */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Weights — which one is the heading weight?
            </h2>
            {[
              ["font-medium", "500 Medium"],
              ["font-semibold", "600 Semibold"],
              ["font-bold", "700 Bold"],
            ].map(([w, label]) => (
              <div key={w} className="flex items-baseline gap-4">
                <code className="w-28 shrink-0 text-xs text-muted-foreground">
                  {label}
                </code>
                <span className={`${D} ${w} text-3xl tracking-tight`}>
                  Your consultations
                </span>
              </div>
            ))}
          </section>

          {/* numerals in situ ------------------------------------------- */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Numerals — stat tiles and the table
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Upcoming"],
                ["14", "Completed"],
                ["3", "Cancelled"],
              ].map(([n, label]) => (
                <div key={label} className="rounded-lg border bg-card p-4">
                  <p
                    className={`${D} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}
                  >
                    {label}
                  </p>
                  <p className={`${D} mt-2 text-4xl font-bold tabular-nums`}>
                    {n}
                  </p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {["When", "Subject", "Reason", "Status"].map((h) => (
                      <th
                        key={h}
                        className={`${D} px-4 py-2.5 text-left font-semibold`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["14 Aug 2026", "9:30 am", "Methods — trigonometry before Friday's SAC", "scheduled"],
                    ["9 Aug 2026", "4:00 pm", "Specialist — complex numbers, second pass", "completed"],
                    ["31 Jul 2026", "11:15 am", "Chemistry — rates and equilibrium", "completed"],
                  ].map(([d, t, r, s]) => (
                    <tr key={d} className="border-b last:border-0">
                      <td className="px-4 py-2.5 tabular-nums">
                        <span className="font-medium">{d}</span>{" "}
                        <span className="text-muted-foreground">{t}</span>
                      </td>
                      <td className="px-4 py-2.5">Oliver Bennett</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            s === "scheduled"
                              ? "bg-[hsl(var(--status-scheduled-bg))] text-[hsl(var(--status-scheduled-fg))]"
                              : "bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-fg))]"
                          }`}
                        >
                          {s}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* wordmark sizes --------------------------------------------- */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Wordmark — header, favicon-adjacent, and hero scale
            </h2>
            <div className="flex flex-wrap items-baseline gap-8 rounded-lg border p-6">
              <Wordmark className={D} size="text-base" />
              <Wordmark className={D} size="text-xl" />
              <Wordmark className={D} size="text-3xl" />
              <Wordmark className={D} size="text-5xl" />
            </div>
            <p className="text-sm text-muted-foreground">
              Amber here is <code>33 95% 40%</code> — the large-text step
              verified in ticket #18 (3.66:1 on white). Ticket #21 decides the
              lockup itself; this is only about whether the letterforms hold.
            </p>
          </section>
        </main>
      </div>

      <VariantSwitcher
        variants={CANDIDATES.map((c) => c.key)}
        current={face.key}
        label={face.name}
      />
    </>
  );
}
