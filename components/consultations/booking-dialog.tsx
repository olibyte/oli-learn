"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, problemMessage } from "@/lib/api/client";
import { localInputMin, toIsoFromLocalInput } from "./datetime";

export function BookingDialog({
  defaultFirstName = "",
  defaultLastName = "",
  triggerLabel = "Book consultation",
  variant = "default",
  className,
}: {
  defaultFirstName?: string;
  defaultLastName?: string;
  triggerLabel?: string;
  variant?: "default" | "outline";
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
    const result = await apiFetch("/api/consultations", {
      method: "POST",
      body: JSON.stringify({
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        reason: String(form.get("reason") ?? ""),
        scheduledAt: toIsoFromLocalInput(String(form.get("scheduledAt") ?? "")),
      }),
    });

    setPending(false);

    if (!result.ok) {
      setError(problemMessage(result.problem));
      return;
    }

    setOpen(false);
    // Re-runs the Server Component read without losing client state.
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
        <Button variant={variant} className={className}>
          <CalendarPlus className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Book a consultation</DialogTitle>
            <DialogDescription>
              Tell us who it&apos;s for and what you&apos;d like to discuss.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  required
                  maxLength={100}
                  defaultValue={defaultFirstName}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  required
                  maxLength={100}
                  defaultValue={defaultLastName}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="scheduledAt">Date &amp; time</Label>
              <Input
                id="scheduledAt"
                name="scheduledAt"
                type="datetime-local"
                required
                min={localInputMin()}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                name="reason"
                required
                maxLength={1000}
                rows={3}
                placeholder="What would you like to discuss?"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Booking…" : "Book consultation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
