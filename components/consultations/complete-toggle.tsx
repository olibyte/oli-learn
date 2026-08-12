"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch, problemMessage } from "@/lib/api/client";
import type { ConsultationDto } from "@/lib/api/consultations";

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

  return (
    <Checkbox
      checked={completed}
      disabled={cancelled || pending}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={
        cancelled
          ? "Cancelled consultations cannot be completed"
          : completed
            ? `Mark consultation with ${consultation.firstName} ${consultation.lastName} as incomplete`
            : `Mark consultation with ${consultation.firstName} ${consultation.lastName} as complete`
      }
    />
  );
}
