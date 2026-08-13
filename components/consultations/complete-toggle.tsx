"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch, problemMessage } from "@/lib/api/client";
import type { ConsultationDto } from "@/lib/api/consultations";
import { formatDateTime } from "@/lib/time";

/**
 * A checkbox rather than a button or an icon: marking a consultation complete is
 * a reversible binary state, and a checkbox is the control that says so - and is
 * keyboard- and screen-reader-accessible without extra work.
 */
export function CompleteToggle({
  consultation,
  onError,
}: {
  consultation: ConsultationDto;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const completed = consultation.status === "completed";
  const cancelled = consultation.status === "cancelled";

  async function onCheckedChange(next: boolean) {
    setPending(true);
    const result = await apiFetch(`/api/consultations/${consultation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next ? "completed" : "scheduled" }),
    });
    setPending(false);

    if (!result.ok) {
      onError(problemMessage(result.problem));
      return;
    }

    onError(null);
    router.refresh();
  }

  // Named by its time, not by the subject's name. On a student's own dashboard
  // the subject is the student, so naming the checkbox after it gave every row
  // in the list the same accessible name - the one thing a label on a repeated
  // control must not do. The time is what distinguishes one row from another,
  // and it is what the row is sorted by.
  const when = formatDateTime(consultation.scheduledAt);

  return (
    <Checkbox
      checked={completed}
      disabled={cancelled || pending}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      // Same reasoning as `<When>`: zone and locale are pinned, so this is
      // deterministic, and the attribute only guards against future ICU drift.
      suppressHydrationWarning
      aria-label={
        cancelled
          ? `Consultation on ${when} was cancelled and cannot be completed`
          : completed
            ? `Mark consultation on ${when} as incomplete`
            : `Mark consultation on ${when} as complete`
      }
    />
  );
}
