"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, problemMessage } from "@/lib/api/client";
import type { ConsultationDto } from "@/lib/api/consultations";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  BOOKING_BOUNDARY_SECONDS,
  localInputMin,
  toIsoFromLocalInput,
  toLocalInput,
} from "./datetime";
import { InstitutionEcho } from "./institution-echo";

export function RescheduleDialog({
  consultation,
  onError,
  className,
}: {
  consultation: ConsultationDto;
  onError: (message: string | null) => void;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Controlled so the institution-time echo tracks it; reset to the
  // consultation's existing time whenever the dialog closes, so reopening it
  // does not resume a half-finished edit.
  const original = toLocalInput(consultation.scheduledAt);
  const [scheduledAt, setScheduledAt] = useState(original);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      setScheduledAt(original);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const result = await apiFetch(`/api/consultations/${consultation.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        scheduledAt: toIsoFromLocalInput(String(form.get("scheduledAt") ?? "")),
      }),
    });

    setPending(false);

    if (!result.ok) {
      setError(problemMessage(result.problem));
      return;
    }

    changeOpen(false);
    onError(null);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {/* Named by the consultation, for the same reason `CompleteToggle` is:
            the visible word "Reschedule" is the same on every one of these,
            and the "Next up" card repeats the trigger for a consultation the
            table or the card list is already showing. The pass measured two
            controls called exactly "Reschedule" and two called exactly
            "Cancel" among the eleven visible on a student's dashboard, at
            both widths - and a keyboard-only run of this ticket rescheduled
            and then cancelled the wrong consultation because of it. The
            visible label is unchanged; only the accessible name grows. */}
        <Button
          size="sm"
          variant="outline"
          className={className}
          // Same reasoning as `CompleteToggle`'s: zone and locale are pinned,
          // so this is deterministic and the attribute only guards ICU drift.
          suppressHydrationWarning
          aria-label={`Reschedule consultation on ${formatDateTime(consultation.scheduledAt)}`}
        >
          <CalendarClock className="size-3.5" />
          Reschedule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Reschedule consultation</DialogTitle>
            <DialogDescription>
              Pick a new date and time. It must be in the future, in 15-minute
              blocks — :00, :15, :30 or :45.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            <Label htmlFor={`when-${consultation.id}`}>New date &amp; time</Label>
            {/* Same `min`/`step` coupling as the booking dialog. The prefilled
                value is the row's own time, so a consultation booked before
                this rule existed starts out as a step mismatch. */}
            <Input
              id={`when-${consultation.id}`}
              name="scheduledAt"
              type="datetime-local"
              required
              min={localInputMin()}
              step={BOOKING_BOUNDARY_SECONDS}
              aria-describedby={`when-${consultation.id}-hint`}
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
            {/* The booking dialog has carried this hint since #35; this one
                did not, and stated the rule only in `DialogDescription`. Radix
                wires that to the *dialog*, so it is read once on open. When an
                off-grid time is refused, the browser moves focus back to this
                input - and that is the moment the rule needs restating, which
                only a hint on the field itself does. Measured: submitting :07
                fires no request, sets no `aria-invalid`, and leaves the native
                bubble as the sole explanation. */}
            <p
              id={`when-${consultation.id}-hint`}
              className="text-xs text-muted-foreground"
            >
              Booked in 15-minute blocks — :00, :15, :30 or :45.
            </p>
            <InstitutionEcho value={scheduledAt} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Reschedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelDialog({
  consultation,
  onError,
  className,
}: {
  consultation: ConsultationDto;
  onError: (message: string | null) => void;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onConfirm() {
    setPending(true);
    const result = await apiFetch(`/api/consultations/${consultation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });
    setPending(false);

    if (!result.ok) {
      onError(problemMessage(result.problem));
      return;
    }

    onError(null);
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn("text-destructive hover:text-destructive", className)}
          suppressHydrationWarning
          aria-label={`Cancel consultation on ${formatDateTime(consultation.scheduledAt)}`}
        >
          <X className="size-3.5" />
          Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this consultation?</AlertDialogTitle>
          {/* Cancelling is terminal in the database, so this genuinely cannot
              be undone - the confirmation is not ceremony. */}
          {/* Institution time, like every other displayed time - this was the
              last call site still asking the runtime for its own defaults. */}
          <AlertDialogDescription suppressHydrationWarning>
            This cannot be undone. The consultation on{" "}
            {formatDateTime(consultation.scheduledAt)} will be cancelled, and
            will stay on your list for your records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel consultation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
