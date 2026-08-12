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

function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <span className="tabular-nums">
      <span className="font-medium">
        {d.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </span>{" "}
      <span className="text-muted-foreground">
        {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
    </span>
  );
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
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <CalendarPlus className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No consultations yet</p>
            <p className="text-sm text-muted-foreground">
              Book one and it will show up here.
            </p>
          </div>
          <BookingDialog triggerLabel="Book your first consultation" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
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

      <div className="overflow-x-auto rounded-lg border">
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
                      {cancelled && <Badge variant="outline">Cancelled</Badge>}
                      {c.status === "completed" && (
                        <Badge variant="secondary">Completed</Badge>
                      )}
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
