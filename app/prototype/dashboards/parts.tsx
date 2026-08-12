"use client";

/** PROTOTYPE — throwaway. Ticket #24. Pieces the three variants share. */

import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDate, fmtTime, zoneLabel, type Row } from "./data";

const DISPLAY = "font-[family-name:var(--font-display)]";

export function StatusPill({ status }: { status: Row["status"] }) {
  const map = {
    scheduled: ["bg-[hsl(var(--status-scheduled-bg))] text-[hsl(var(--status-scheduled-fg))]", "Scheduled"],
    completed: ["bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-fg))]", "Completed"],
    cancelled: ["bg-[hsl(var(--status-cancelled-bg))] text-[hsl(var(--status-cancelled-fg))]", "Cancelled"],
  } as const;
  const [cls, label] = map[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export function When({ iso, className = "" }: { iso: string; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="font-medium">{fmtDate(iso)}</span>{" "}
      <span className="text-muted-foreground">
        {fmtTime(iso)} {zoneLabel(iso)}
      </span>
    </span>
  );
}

export function Tile({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: typeof CalendarPlus;
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    // Deliberately not a button and not a link: there is no filtered view to
    // navigate to, and a tile that looks clickable promises one.
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`${DISPLAY} mt-2 text-3xl font-bold tabular-nums`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeading({
  title,
  instruction,
  action,
}: {
  title: string;
  instruction: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className={`${DISPLAY} text-3xl font-semibold tracking-tight`}>
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{instruction}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-4 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent">
        <CalendarPlus className="size-6 text-accent-foreground" />
      </span>
      <div>
        <p className={`${DISPLAY} text-lg font-semibold`}>No consultations yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Book one and it appears here. You can reschedule or cancel it later —
          nothing you book is set in stone.
        </p>
      </div>
      <Button>
        <CalendarPlus className="size-4" /> Book your first consultation
      </Button>
    </div>
  );
}

/** The desktop table. Cancelled rows are muted explicitly, never by opacity. */
export function ConsultationsTable({
  rows,
  admin,
}: {
  rows: Row[];
  admin?: boolean;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            {!admin && <th className="w-12 px-4 py-2.5" />}
            <th className={`${DISPLAY} w-56 px-4 py-2.5 font-semibold`}>When</th>
            <th className={`${DISPLAY} w-44 px-4 py-2.5 font-semibold`}>
              {admin ? "Student" : "Subject"}
            </th>
            <th className={`${DISPLAY} px-4 py-2.5 font-semibold`}>Reason</th>
            <th className={`${DISPLAY} w-56 px-4 py-2.5 text-right font-semibold`}>
              {admin ? "Status" : "Actions"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cancelled = r.status === "cancelled";
            const dim = cancelled ? "text-muted-foreground line-through" : "";
            return (
              <tr key={r.id} className="border-b last:border-0">
                {!admin && (
                  <td className="px-4 py-2.5">
                    <Checkbox checked={r.status === "completed"} />
                  </td>
                )}
                <td className={`px-4 py-2.5 ${dim}`}>
                  <When iso={r.scheduledAt} />
                </td>
                <td className={`px-4 py-2.5 ${dim}`}>
                  {admin ? r.student : `${r.firstName} ${r.lastName}`}
                </td>
                <td className={`max-w-0 truncate px-4 py-2.5 text-muted-foreground ${cancelled ? "line-through" : ""}`}>
                  {r.reason}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <StatusPill status={r.status} />
                    {!admin && r.status === "scheduled" && (
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Below `md` the same rows are cards — the precedent set by the last pass. */
export function ConsultationsCards({ rows, admin }: { rows: Row[]; admin?: boolean }) {
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((r) => {
        const cancelled = r.status === "cancelled";
        return (
          <li key={r.id} className="rounded-xl border p-4">
            <div className="flex items-start gap-3">
              {!admin && (
                <Checkbox checked={r.status === "completed"} className="mt-0.5" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <When
                    iso={r.scheduledAt}
                    className={cancelled ? "text-muted-foreground line-through" : ""}
                  />
                  <StatusPill status={r.status} />
                </div>
                <p className={`text-sm font-medium ${cancelled ? "text-muted-foreground line-through" : ""}`}>
                  {admin ? r.student : `${r.firstName} ${r.lastName}`}
                </p>
                <p className={`break-words text-sm text-muted-foreground ${cancelled ? "line-through" : ""}`}>
                  {r.reason}
                </p>
              </div>
            </div>
            {!admin && r.status === "scheduled" && (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Reschedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-destructive hover:text-destructive"
                >
                  Cancel
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
