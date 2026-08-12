"use client";

/**
 * PROTOTYPE — throwaway. Ticket #24.
 *
 * Three ways to top a dashboard: tiles, an inline summary, or a "next up" card.
 * The table beneath is identical in all three — it is the header that is in
 * question, not the list.
 *
 * `?role=student|admin` switches which dashboard is shown, because the admin
 * side is where the arithmetic gets awkward: that view is keyset-paginated, so
 * a page of 25 rows cannot honestly total the system.
 */

import { CalendarCheck, CalendarClock, CalendarPlus, CircleSlash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ADMIN_ROWS, counts, nextUp, STUDENT_ROWS } from "./data";
import {
  ConsultationsCards,
  ConsultationsTable,
  EmptyState,
  PageHeading,
  StatusPill,
  Tile,
  When,
} from "./parts";

export const VARIANTS = [
  {
    key: "A",
    name: "Tiles",
    thesis: "Three stat tiles above the list. Most conventional; most vertical space.",
  },
  {
    key: "B",
    name: "Inline summary",
    thesis:
      "No tiles. One line of counts beside the heading — densest, and the list starts immediately.",
  },
  {
    key: "C",
    name: "Next up",
    thesis:
      "Leads with the next consultation as a card, counts demoted to a thin row. Answers 'when am I next in?' before 'how many?'.",
  },
] as const;

const BookButton = () => (
  <Button className="w-full sm:w-auto">
    <CalendarPlus className="size-4" /> Book a consultation
  </Button>
);

/**
 * DECIDED (#24): the admin view gets no tiles and no totals. It is keyset-paginated
 * at 25 rows, so every total it could show would need a count query it does not
 * make - and an exact count over an RLS-filtered table is a full scan. It says what
 * it is instead.
 */
function AdminPageNote() {
  return (
    <p className="text-sm text-muted-foreground">
      Newest first, 25 per page. Cancelled consultations stay listed.
    </p>
  );
}

export function Dashboard({
  variant,
  role,
  empty,
}: {
  variant: string;
  role: string;
  empty?: boolean;
}) {
  const admin = role === "admin";
  const rows = admin ? ADMIN_ROWS : STUDENT_ROWS;
  const c = counts(rows);
  const next = nextUp(rows);

  const heading = admin ? (
    <PageHeading
      title="All consultations"
      instruction="Every consultation in the system, across every student. Read-only."
    />
  ) : (
    <PageHeading
      title="Your consultations"
      instruction="Book a time, reschedule it, or mark it complete once it has happened."
      action={<BookButton />}
    />
  );

  if (empty && !admin) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState />
      </div>
    );
  }

  if (admin) {
    return (
      <div className="space-y-6">
        {heading}
        <AdminPageNote />
        <ConsultationsCards rows={rows} admin />
        <ConsultationsTable rows={rows} admin />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled>
            Newer
          </Button>
          <Button variant="outline" size="sm">
            Older
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}

      {variant === "A" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              icon={CalendarClock}
              value={c.upcoming}
              label="Upcoming"
              hint="Scheduled, still in the future"
            />
            <Tile icon={CalendarCheck} value={c.completed} label="Completed" />
            <Tile icon={CircleSlash} value={c.cancelled} label="Cancelled" />
          </div>
        </div>
      )}

      {variant === "B" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">
              {c.total}
            </span>{" "}
            total ·{" "}
            <span className="font-medium text-foreground tabular-nums">
              {c.upcoming}
            </span>{" "}
            upcoming ·{" "}
            <span className="tabular-nums">{c.completed}</span> completed ·{" "}
            <span className="tabular-nums">{c.cancelled}</span> cancelled
          </p>
        </div>
      )}

      {variant === "C" && (
        <div className="space-y-3">
          {next ? (
            <div className="flex flex-col gap-4 rounded-xl border bg-[hsl(var(--wash))] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Next up
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                  <When iso={next.scheduledAt} />
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {next.reason}
                </p>
              </div>
              <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Reschedule
                  </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {c.upcoming}
              </span>{" "}
              upcoming
            </span>
            <span>
              <span className="tabular-nums">{c.completed}</span> completed
            </span>
            <span>
              <span className="tabular-nums">{c.cancelled}</span> cancelled
            </span>
          </div>
        </div>
      )}

      {c.past > 0 && (
        <p className="text-sm text-muted-foreground">
          <StatusPill status="scheduled" />{" "}
          <span className="ml-1">
            {c.past} scheduled consultation{c.past > 1 ? "s have" : " has"} already
            passed — mark {c.past > 1 ? "them" : "it"} complete, or cancel.
          </span>
        </p>
      )}

      <ConsultationsCards rows={rows} />
      <ConsultationsTable rows={rows} />
    </div>
  );
}
