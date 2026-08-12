// THROWAWAY - prototype for issue #5. Variant C: "Agenda".
// A single chronological spine with a date rail, past and future separated by a
// "now" marker. Booking is an inline composer at the top rather than a dialog or
// a sidebar. Optimised for understanding *when* things are, not how many.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import { Consultation, fmtDate, fmtTime, isPast } from "./types";

const dot: Record<string, string> = {
  scheduled: "bg-blue-500",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground/40",
};

function Entry({ c }: { c: Consultation }) {
  const cancelled = c.status === "cancelled";
  return (
    <div className="relative grid grid-cols-[5.5rem_1fr] gap-4 py-5">
      <div className="text-right">
        <div
          className={`text-sm font-medium tabular-nums ${cancelled ? "text-muted-foreground line-through" : ""}`}
        >
          {fmtDate(c.scheduled_at)}
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {fmtTime(c.scheduled_at)}
        </div>
      </div>

      <div className="relative border-l pl-6">
        <span
          className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-background ${dot[c.status]}`}
        />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className={`text-sm ${cancelled ? "text-muted-foreground line-through" : "font-medium"}`}
            >
              {c.reason}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {c.first_name} {c.last_name}
              {c.status === "completed" && " · completed"}
              {c.status === "cancelled" && " · cancelled"}
            </p>
          </div>
          {!cancelled && (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="icon" variant="ghost" className="size-7">
                {c.status === "completed" ? (
                  <RotateCcw className="size-3.5" />
                ) : (
                  <Check className="size-3.5" />
                )}
              </Button>
              {c.status === "scheduled" && (
                <>
                  <Button size="icon" variant="ghost" className="size-7">
                    <Plus className="size-3.5 rotate-45" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                  >
                    <X className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VariantC({ consultations }: { consultations: Consultation[] }) {
  const sorted = [...consultations].sort(
    (a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  const before = sorted.filter((c) => isPast(c.scheduled_at));
  const after = sorted.filter((c) => !isPast(c.scheduled_at));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your agenda</h1>

      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Plus className="size-4" />
          Book something new
        </div>
        <Textarea
          rows={2}
          placeholder="What would you like to discuss?"
          className="bg-background"
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="grid flex-1 gap-1.5">
            <label htmlFor="c-when" className="text-xs text-muted-foreground">
              When
            </label>
            <Input id="c-when" type="datetime-local" className="bg-background" />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="c-first" className="text-xs text-muted-foreground">
              First
            </label>
            <Input
              id="c-first"
              defaultValue="Sam"
              className="w-28 bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="c-last" className="text-xs text-muted-foreground">
              Last
            </label>
            <Input
              id="c-last"
              defaultValue="Rivera"
              className="w-28 bg-background"
            />
          </div>
          <Button>Book</Button>
        </div>
      </div>

      {consultations.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Your agenda is empty.
        </p>
      ) : (
        <div>
          {before.map((c) => (
            <Entry key={c.id} c={c} />
          ))}

          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-4 py-1">
            <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-destructive">
              now
            </span>
            <div className="h-px bg-destructive/40" />
          </div>

          {after.map((c) => (
            <Entry key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
