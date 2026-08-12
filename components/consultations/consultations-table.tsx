"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ConsultationDto } from "@/lib/api/consultations";
import { BookingDialog } from "./booking-dialog";
import { CompleteToggle } from "./complete-toggle";
import { CancelDialog, RescheduleDialog } from "./row-actions";

/**
 * Times render in the viewer's zone and locale, which is a deliberate product
 * decision - but this is a client component, so it renders twice: once in Node
 * during SSR and again in the browser at hydration. `undefined` as the locale
 * means "ask the runtime", and the two runtimes answer differently (Node gave
 * `7:57 am` where Chrome gave `7:57`), which React reports as a hydration
 * mismatch and repairs by throwing the tree away and re-rendering.
 *
 * `suppressHydrationWarning` is the right tool rather than a workaround: the
 * mismatch is intended. The server's copy is a placeholder and the browser's is
 * authoritative, which is exactly the case this attribute exists for. Pinning a
 * locale server-side would remove the warning by breaking the feature.
 */
function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <span className="tabular-nums">
      <span className="font-medium" suppressHydrationWarning>
        {d.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </span>{" "}
      <span className="text-muted-foreground" suppressHydrationWarning>
        {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
    </span>
  );
}

function StatusBadge({ status }: { status: ConsultationDto["status"] }) {
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  if (status === "completed")
    return <Badge variant="secondary">Completed</Badge>;
  return null;
}

export function ConsultationsTable({
  consultations,
}: {
  consultations: ConsultationDto[];
}) {
  const [error, setError] = useState<string | null>(null);

  // Names are a snapshot of the subject, and the account carries none - so the
  // most recent booking is the best available prefill.
  const latest = consultations[0];

  const upcoming = consultations.filter((c) => c.status === "scheduled").length;

  if (consultations.length === 0) {
    return (
      <div className="w-full space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Your consultations
        </h1>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-4 py-12 text-center sm:py-16">
          <CalendarPlus className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No consultations yet</p>
            <p className="text-sm text-muted-foreground">
              Book one and it will show up here.
            </p>
          </div>
          <BookingDialog
            triggerLabel="Book your first consultation"
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your consultations
          </h1>
          <p className="text-sm text-muted-foreground">
            {consultations.length} total · {upcoming} upcoming
          </p>
        </div>
        <BookingDialog
          defaultFirstName={latest?.firstName}
          defaultLastName={latest?.lastName}
          className="w-full sm:w-auto"
        />
      </div>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

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
            <li key={c.id} className={`rounded-lg border p-4 ${cancelled ? "opacity-55" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <CompleteToggle consultation={c} onError={setError} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cancelled ? "line-through" : ""}>
                      <When iso={c.scheduledAt} />
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p
                    className={`text-sm font-medium ${cancelled ? "line-through" : ""}`}
                  >
                    {c.firstName} {c.lastName}
                  </p>
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

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <span className="sr-only">Complete</span>
              </TableHead>
              <TableHead className="w-48">When</TableHead>
              <TableHead className="w-44">Subject</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-56 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consultations.map((c) => {
              const cancelled = c.status === "cancelled";
              return (
                <TableRow key={c.id} className={cancelled ? "opacity-55" : ""}>
                  <TableCell>
                    <CompleteToggle consultation={c} onError={setError} />
                  </TableCell>
                  <TableCell className={cancelled ? "line-through" : ""}>
                    <When iso={c.scheduledAt} />
                  </TableCell>
                  <TableCell className={cancelled ? "line-through" : ""}>
                    {c.firstName} {c.lastName}
                  </TableCell>
                  <TableCell
                    className={`max-w-0 truncate text-muted-foreground ${cancelled ? "line-through" : ""}`}
                    title={c.reason}
                  >
                    {c.reason}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <StatusBadge status={c.status} />
                      {c.status === "scheduled" && (
                        <>
                          <RescheduleDialog consultation={c} onError={setError} />
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
