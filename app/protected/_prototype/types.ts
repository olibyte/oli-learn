// THROWAWAY - prototype for issue #5.

export type ConsultationStatus = "scheduled" | "completed" | "cancelled";

export type Consultation = {
  id: string;
  first_name: string;
  last_name: string;
  reason: string;
  scheduled_at: string;
  status: ConsultationStatus;
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();
