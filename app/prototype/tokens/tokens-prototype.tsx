"use client";

/**
 * PROTOTYPE — throwaway. Ticket #18.
 *
 * One sample surface, three token systems, `?variant=A|B|C`. The surface is
 * held identical across variants on purpose: the palette is the independent
 * variable, so structure must not move. Density is copied from the real
 * dashboard (`components/consultations/consultations-table.tsx`) rather than
 * invented — a palette that only works on a sparse page isn't an answer.
 *
 * Nothing here mutates. The buttons are dead.
 */

import { CalendarCheck, CalendarClock, CircleSlash } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { VariantSwitcher } from "@/components/prototype/variant-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CHECKS,
  cssFor,
  globalsCssFor,
  hex,
  ratio,
  VARIANTS,
  type Tokens,
} from "./variants";

const ROWS = [
  {
    when: "14 Aug 2026",
    time: "9:30 am",
    who: "Oliver Bennett",
    reason: "Methods — trigonometry before the SAC on Friday",
    status: "scheduled" as const,
  },
  {
    when: "9 Aug 2026",
    time: "4:00 pm",
    who: "Oliver Bennett",
    reason: "Specialist — complex numbers, second pass",
    status: "completed" as const,
  },
  {
    when: "2 Aug 2026",
    time: "11:00 am",
    who: "Oliver Bennett",
    reason: "Chemistry — rates and equilibrium, exam technique",
    status: "cancelled" as const,
  },
];

const STATUS_STYLE = {
  scheduled: {
    label: "Scheduled",
    className:
      "bg-[hsl(var(--status-scheduled-bg))] text-[hsl(var(--status-scheduled-fg))]",
  },
  completed: {
    label: "Completed",
    className:
      "bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-fg))]",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "bg-[hsl(var(--status-cancelled-bg))] text-[hsl(var(--status-cancelled-fg))]",
  },
};

function StatusPill({ status }: { status: keyof typeof STATUS_STYLE }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof CalendarClock;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Swatches({ tokens }: { tokens: Tokens }) {
  const keys: (keyof Tokens)[] = [
    "background",
    "foreground",
    "card",
    "primary",
    "accent",
    "accentForeground",
    "muted",
    "mutedForeground",
    "destructive",
    "border",
    "ring",
    "statusScheduledBg",
    "statusCompletedBg",
    "statusCancelledBg",
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {keys.map((k) => (
        <div key={k} className="rounded-md border p-2">
          <div
            className="mb-2 h-10 rounded"
            style={{ background: `hsl(${tokens[k]})` }}
          />
          <p className="truncate text-[11px] font-medium">{k}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {hex(tokens[k])}
          </p>
        </div>
      ))}
    </div>
  );
}

function ContrastTable({ tokens, theme }: { tokens: Tokens; theme: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="px-3 pt-3 text-left text-xs text-muted-foreground">
          {theme} — recomputed in the browser from the tokens above
        </caption>
        <tbody>
          {CHECKS.map((c) => {
            const r = ratio(tokens[c.fg], tokens[c.bg]);
            const ok = r >= c.min;
            return (
              <tr key={c.label} className="border-t">
                <td className="px-3 py-1.5 font-medium">{c.label}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums">
                  {r.toFixed(2)}:1
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      ok
                        ? "bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-fg))]"
                        : "bg-destructive text-destructive-foreground"
                    }`}
                  >
                    {ok ? "PASS" : "FAIL"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {c.why}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TokensPrototype() {
  const params = useSearchParams();
  const key = params.get("variant") ?? "A";
  const variant = VARIANTS.find((v) => v.key === key) ?? VARIANTS[0];

  return (
    <>
      <style>{VARIANTS.map(cssFor).join("\n")}</style>

      <div data-proto={variant.key} className="min-h-svh bg-background text-foreground">
        {/* ---- chrome ---------------------------------------------------- */}
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="text-lg font-semibold tracking-tight">
              <span className="text-primary">Oli</span>
              <span className="text-accent-foreground">Learn</span>
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                Admin
              </Button>
              <Button size="sm">Sign in</Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 pb-28 sm:px-6">
          {/* ---- what am I looking at ------------------------------------ */}
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prototype · ticket #18 · variant {variant.key}
            </p>
            <p className="mt-1 text-lg font-semibold">{variant.name}</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {variant.thesis}
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Theme:</span>
              <ThemeSwitcher />
              <span className="text-muted-foreground">
                — check both; the palette must hold in each.
              </span>
            </div>
          </div>

          {/* ---- landing hero -------------------------------------------- */}
          <section className="space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Landing hero
            </h2>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Book time with a tutor,{" "}
              <span className="text-primary">when it actually helps</span>.
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">
              Students book and manage their own consultations. Administrators
              see every consultation in the system.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg">Get started</Button>
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Quality before quantity",
                "Continual support",
                "Learning to understand",
              ].map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* ---- dashboard ----------------------------------------------- */}
          <section className="space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Student dashboard
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile icon={CalendarClock} value="1" label="Upcoming" />
              <StatTile icon={CalendarCheck} value="4" label="Completed" />
              <StatTile icon={CircleSlash} value="1" label="Cancelled" />
            </div>

            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              Your consultations could not be loaded. Please refresh to try
              again.
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12" />
                    <TableHead className="w-44">When</TableHead>
                    <TableHead className="w-40">Subject</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-64 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ROWS.map((r) => {
                    const cancelled = r.status === "cancelled";
                    // The cancelled treatment under test: an explicit muted
                    // foreground instead of the blanket `opacity-55` that put
                    // every element in the row below AA.
                    const dim = cancelled ? "text-muted-foreground" : "";
                    return (
                      <TableRow key={r.when}>
                        <TableCell>
                          <Checkbox checked={r.status === "completed"} />
                        </TableCell>
                        <TableCell className={dim}>
                          <span className="tabular-nums">
                            <span className={cancelled ? "line-through" : "font-medium"}>
                              {r.when}
                            </span>{" "}
                            <span className="text-muted-foreground">{r.time}</span>
                          </span>
                        </TableCell>
                        <TableCell className={dim}>{r.who}</TableCell>
                        <TableCell
                          className={`max-w-0 truncate ${cancelled ? "text-muted-foreground line-through" : "text-muted-foreground"}`}
                        >
                          {r.reason}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <StatusPill status={r.status} />
                            {r.status === "scheduled" && (
                              <>
                                <Button variant="ghost" size="sm">
                                  Reschedule
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="destructive">Cancel consultation</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
          </section>

          {/* ---- evidence ------------------------------------------------ */}
          <section className="space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tokens and contrast
            </h2>
            <div className="space-y-3">
              <p className="text-sm font-medium">Light</p>
              <Swatches tokens={variant.light} />
              <ContrastTable tokens={variant.light} theme="Light" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Dark</p>
              <Swatches tokens={variant.dark} />
              <ContrastTable tokens={variant.dark} theme="Dark" />
            </div>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                globals.css for variant {variant.key}
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
                {globalsCssFor(variant)}
              </pre>
            </details>
          </section>
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
