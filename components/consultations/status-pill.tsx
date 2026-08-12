import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type Status = Database["public"]["Enums"]["consultation_status"];

/**
 * Scheduled blue, completed green, cancelled slate - each a background and
 * foreground pair from `globals.css`, every one of which clears AA in both
 * themes (`lib/design/contrast.test.ts`).
 *
 * Cancelled is deliberately the quietest of the three: the row is still there
 * for the record, and nothing about it is actionable.
 */
const STYLES: Record<Status, string> = {
  scheduled: "bg-status-scheduled text-status-scheduled-foreground",
  completed: "bg-status-completed text-status-completed-foreground",
  cancelled: "bg-status-cancelled text-status-cancelled-foreground",
};

const LABELS: Record<Status, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusPill({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
