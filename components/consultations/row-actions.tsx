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
import { cn } from "@/lib/utils";
import { localInputMin, toIsoFromLocalInput, toLocalInput } from "./datetime";

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

    setOpen(false);
    onError(null);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={className}>
          <CalendarClock className="size-3.5" />
          Reschedule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Reschedule consultation</DialogTitle>
            <DialogDescription>
              Pick a new date and time. It must be in the future.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            <Label htmlFor={`when-${consultation.id}`}>New date &amp; time</Label>
            <Input
              id={`when-${consultation.id}`}
              name="scheduledAt"
              type="datetime-local"
              required
              min={localInputMin()}
              defaultValue={toLocalInput(consultation.scheduledAt)}
            />
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
          <AlertDialogDescription>
            This cannot be undone. The consultation on{" "}
            {new Date(consultation.scheduledAt).toLocaleString()} will be
            cancelled, and will stay on your list for your records.
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
