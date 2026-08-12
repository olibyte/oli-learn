"use client";

/**
 * PROTOTYPE — throwaway. Ticket #22.
 *
 * Three social cards at exactly 1200×630 — the size the file ships at, so what
 * is judged is what is captured. They disagree about what the card is *for*:
 * identity, product, or statement.
 */

import { Monogram, Wordmark } from "./mark";

export const CARDS = [
  {
    key: "A",
    name: "Identity",
    thesis:
      "The mark, the name, one line. Says who, not what. Ages best and reads at any thumbnail size.",
  },
  {
    key: "B",
    name: "Product",
    thesis:
      "Type on the left, a fragment of the real dashboard on the right. Says what the thing is before anyone clicks.",
  },
  {
    key: "C",
    name: "Statement",
    thesis:
      "The headline dominates; the wordmark sits small in the corner. Editorial — closest to the poster's voice.",
  },
] as const;

/** 1200×630 exactly. Nothing inside may depend on the viewport. */
export function SocialCard({ variant }: { variant: string }) {
  const frame =
    "relative flex overflow-hidden bg-[hsl(var(--wash))] text-foreground";
  const style = { width: 1200, height: 630 } as const;

  if (variant === "B") {
    return (
      <div data-social className={frame} style={style}>
        <div className="flex w-[56%] flex-col justify-between p-[72px]">
          <Wordmark size="text-[52px]" />
          <div>
            <p className="font-[family-name:var(--font-display)] text-[54px] font-bold leading-[1.05] tracking-tight">
              Book time with a tutor,{" "}
              <span className="text-primary">when it actually helps</span>.
            </p>
            <p className="mt-5 text-[24px] text-muted-foreground">
              Consultation booking for students and administrators.
            </p>
          </div>
          <div className="flex gap-3">
            {["Book", "Reschedule", "Oversee"].map((t) => (
              <span
                key={t}
                className="rounded-full bg-accent px-4 py-1.5 text-[20px] font-semibold text-accent-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* a fragment of the real table, cropped by the frame */}
        <div className="relative w-[44%]">
          <div className="absolute left-0 top-[88px] w-[500px] rounded-l-2xl border border-border bg-card p-6 shadow-2xl">
            <p className="font-[family-name:var(--font-display)] text-[26px] font-bold tracking-tight">
              Your consultations
            </p>
            <p className="mt-1 text-[17px] text-muted-foreground">
              3 total · 1 upcoming
            </p>
            <div className="mt-5 space-y-3">
              {[
                ["14 Aug 2026", "9:30 am AEST", "scheduled"],
                ["9 Aug 2026", "4:00 pm AEST", "completed"],
                ["2 Aug 2026", "11:00 am AEST", "completed"],
              ].map(([d, t, s]) => (
                <div
                  key={d}
                  className="flex items-center justify-between border-b border-border pb-3 last:border-0"
                >
                  <span className="text-[19px] tabular-nums">
                    <span className="font-medium">{d}</span>{" "}
                    <span className="text-muted-foreground">{t}</span>
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[15px] font-medium ${
                      s === "scheduled"
                        ? "bg-[hsl(var(--status-scheduled-bg))] text-[hsl(var(--status-scheduled-fg))]"
                        : "bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-fg))]"
                    }`}
                  >
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "C") {
    return (
      <div
        data-social
        className={`${frame} flex-col justify-between p-[80px]`}
        style={style}
      >
        <p className="font-[family-name:var(--font-display)] text-[86px] font-bold leading-[1.02] tracking-tight">
          Book time with a tutor,
          <br />
          <span className="text-primary">when it actually helps</span>.
        </p>
        <div className="flex items-end justify-between">
          <p className="max-w-[620px] text-[26px] leading-snug text-muted-foreground">
            Students book and manage their own consultations. Administrators see
            every consultation in the system.
          </p>
          <Wordmark size="text-[40px]" />
        </div>
        {/* faint geometric wash, the poster's one borrowed gesture */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full border-[36px] border-primary/10"
        />
      </div>
    );
  }

  return (
    <div
      data-social
      className={`${frame} flex-col items-center justify-center gap-8`}
      style={style}
    >
      <Monogram px={132} className="shadow-lg" />
      <Wordmark size="text-[96px]" />
      <p className="text-[30px] text-muted-foreground">
        Consultation booking for students and administrators.
      </p>
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 size-[480px] rounded-full border-[44px] border-primary/10"
      />
    </div>
  );
}
