"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";

import { StatusPill } from "@/components/consultations/status-pill";
import { When } from "@/components/consultations/when";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ConsultationDto } from "@/lib/api/consultations";
import {
  countConsultations,
  nextUpConsultation,
} from "@/lib/consultations/summary";
import { BookingDialog } from "./booking-dialog";
import { CompleteToggle } from "./complete-toggle";
import { CancelDialog, RescheduleDialog } from "./row-actions";

/**
 * A cancelled row is muted and struck through - never `opacity-55`, which is
 * what put every element in the row below AA. `--muted-foreground` on a card
 * is an explicit 6.10:1 light / 8.01:1 dark.
 */
const CANCELLED_ROW = "text-muted-foreground line-through";

function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Your consultations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Book a time, reschedule it, or mark it complete once it has happened.
        </p>
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-4 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent">
        <CalendarPlus aria-hidden className="size-6 text-accent-foreground" />
      </span>
      <div>
        <p className="font-display text-lg font-semibold">
          No consultations yet
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Book one and it appears here. You can reschedule or cancel it later —
          nothing you book is set in stone.
        </p>
      </div>
      <BookingDialog triggerLabel="Book your first consultation" />
    </div>
  );
}

/**
 * Answers "when am I next in?" before "how many have I had?", and costs less
 * vertical space than a row of tiles while carrying more.
 */
function NextUpCard({
  consultation,
  onError,
}: {
  consultation: ConsultationDto;
  onError: (message: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-wash p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Next up
        </p>
        <p className="mt-1 font-display text-xl font-semibold tracking-tight">
          <When at={consultation.scheduledAt} />
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {consultation.reason}
        </p>
      </div>
      <div className="flex gap-2">
        <RescheduleDialog consultation={consultation} onError={onError} />
        <CancelDialog consultation={consultation} onError={onError} />
      </div>
    </div>
  );
}

/**
 * The three counts, deliberately not tiles and deliberately not interactive:
 * there is no filtered view to navigate to, and a tile that looks clickable
 * promises one that does not exist.
 */
function Counts({
  upcoming,
  completed,
  cancelled,
}: {
  upcoming: number;
  completed: number;
  cancelled: number;
}) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
      <span>
        <span className="font-medium tabular-nums text-foreground">
          {upcoming}
        </span>{" "}
        upcoming
      </span>
      <span>
        <span className="tabular-nums">{completed}</span> completed
      </span>
      <span>
        <span className="tabular-nums">{cancelled}</span> cancelled
      </span>
    </div>
  );
}

/**
 * A still-scheduled consultation whose time has passed is in none of the three
 * counts. A fourth number would be a wall of numbers nobody can act on; this
 * sentence tells the student what to do about it instead.
 */
function PassedNudge({ count }: { count: number }) {
  const plural = count > 1;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <StatusPill status="scheduled" />
      <span>
        <span className="tabular-nums">{count}</span> scheduled consultation
        {plural ? "s have" : " has"} already passed — mark{" "}
        {plural ? "them" : "it"} complete, or cancel.
      </span>
    </p>
  );
}

export function StudentDashboard({
  consultations,
  now,
}: {
  consultations: ConsultationDto[];
  /**
   * The instant the counts are measured against, taken on the server so the
   * server render and hydration cannot disagree about which side of "now" a
   * consultation falls on. `router.refresh()` after a mutation brings a fresh
   * one back with the fresh rows.
   */
  now: number;
}) {
  const [error, setError] = useState<string | null>(null);

  if (consultations.length === 0) {
    return (
      <div className="w-full space-y-6">
        <Heading />
        <EmptyState />
      </div>
    );
  }

  // Names are a snapshot of the subject and the account carries none, so the
  // most recent booking is the best available prefill.
  const latest = consultations[0];
  const counts = countConsultations(consultations, now);
  const next = nextUpConsultation(consultations, now);

  return (
    <div className="w-full space-y-6">
      <Heading>
        <BookingDialog
          defaultFirstName={latest?.firstName}
          defaultLastName={latest?.lastName}
          className="w-full sm:w-auto"
        />
      </Heading>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="space-y-3">
        {next && <NextUpCard consultation={next} onError={setError} />}
        <Counts {...counts} />
      </div>

      {counts.past > 0 && <PassedNudge count={counts.past} />}

      {/* Below `md` the same rows render as cards. A five-column table cannot
          hold a free-text reason and two actions at 375px, and the horizontal
          scroll it needs instead hides exactly the column worth reading. Only
          one branch is ever visible, so the duplicated triggers cannot both be
          reached - and `display: none` keeps the hidden one out of the
          accessibility tree. */}
      <ul className="space-y-3 md:hidden">
        {consultations.map((c) => {
          const cancelled = c.status === "cancelled";
          return (
            <li key={c.id} className="rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <CompleteToggle consultation={c} onError={setError} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <When
                      at={c.scheduledAt}
                      className={cancelled ? CANCELLED_ROW : ""}
                    />
                    <StatusPill status={c.status} />
                  </div>
                  {/* No name line, for the same reason the table has no Subject
                      column - it is the reader's own name on every card. */}
                  {/* Wraps rather than truncates: on a card there is room, and
                      the reason is the point of the row. */}
                  <p
                    className={`break-words text-sm text-muted-foreground ${cancelled ? "line-through" : ""}`}
                  >
                    {c.reason}
                  </p>
                </div>
              </div>

              {c.status === "scheduled" && (
                <div className="mt-4 flex gap-2">
                  <RescheduleDialog
                    consultation={c}
                    onError={setError}
                    className="flex-1"
                  />
                  <CancelDialog
                    consultation={c}
                    onError={setError}
                    className="flex-1"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <span className="sr-only">Complete</span>
              </TableHead>
              <TableHead className="w-56 font-display font-semibold">
                When
              </TableHead>
              {/* No Subject column.

                  The field is not dropped - it is captured on the form the brief
                  specifies, stored on the consultation, returned by the API, and
                  shown to an Admin, where it is labelled "Student" and tells two
                  students apart. It is not shown *here* because CONTEXT.md
                  defines the Subject as the owning Student: on your own
                  dashboard the column is your own name, on every row, and a
                  column that repeats what the reader already knows costs 176px
                  to say nothing. Renaming it does not help - the label was never
                  the problem.

                  That 176px goes to Reason, which is the point of the row and
                  was the column being squeezed. */}
              <TableHead className="font-display font-semibold">
                Reason
              </TableHead>
              <TableHead className="w-56 text-right font-display font-semibold">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consultations.map((c) => {
              const cancelled = c.status === "cancelled";
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <CompleteToggle consultation={c} onError={setError} />
                  </TableCell>
                  <TableCell>
                    <When
                      at={c.scheduledAt}
                      className={cancelled ? CANCELLED_ROW : ""}
                    />
                  </TableCell>
                  {/* `max-w-0` is what makes this the flexible column: it drops
                      the cell's intrinsic width to nothing, so the table hands
                      it whatever the fixed columns leave and `truncate` has a
                      width to work against. `title` keeps the full text
                      reachable when it does not fit. */}
                  <TableCell
                    className={`max-w-0 truncate text-muted-foreground ${cancelled ? "line-through" : ""}`}
                    title={c.reason}
                  >
                    {c.reason}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <StatusPill status={c.status} />
                      {c.status === "scheduled" && (
                        <>
                          <RescheduleDialog
                            consultation={c}
                            onError={setError}
                          />
                          <CancelDialog consultation={c} onError={setError} />
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
    </div>
  );
}
