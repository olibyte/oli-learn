import type { Database } from "@/lib/database.types";

/** The columns every consultation response exposes. Never `select("*")`. */
export const COLUMNS =
  "id, first_name, last_name, reason, scheduled_at, status, created_at, updated_at" as const;

type Row = Pick<
  Database["public"]["Tables"]["consultations"]["Row"],
  | "id"
  | "first_name"
  | "last_name"
  | "reason"
  | "scheduled_at"
  | "status"
  | "created_at"
  | "updated_at"
>;

export type ConsultationDto = {
  id: string;
  firstName: string;
  lastName: string;
  reason: string;
  scheduledAt: string;
  status: Database["public"]["Enums"]["consultation_status"];
  createdAt: string;
  updatedAt: string;
};

/**
 * snake_case columns to camelCase at the API boundary. Note `student_id` is
 * deliberately not exposed: a student only ever sees their own rows, so it
 * carries no information, and the admin view reads through its own query.
 */
export const toDto = (row: Row): ConsultationDto => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  reason: row.reason,
  scheduledAt: row.scheduled_at,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
