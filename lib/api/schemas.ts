import { z } from "zod";

import {
  BOOKING_BOUNDARY_MESSAGE,
  isOnBookingBoundary,
} from "@/lib/consultations/booking-boundary";
import type { FieldError } from "./problem";

// Bounds mirror the database check constraints exactly (1-100, 1-100, 1-1000).
// The constraints remain the authority; rejecting here is a courtesy that yields
// a better message than a 23514.
const name = z.string().trim().min(1, "Required").max(100, "Must be 100 characters or fewer");

// Both temporal rules, and both restate what `enforce_consultation_rules()`
// enforces. The trigger remains the authority - it is the only one a devtools
// console cannot go around - and rejecting here buys a named field and a
// sentence instead of a 23514. `CreateConsultation` and `PatchConsultation`
// share this, so booking and rescheduling cannot drift apart.
const isoFuture = z.iso
  .datetime({ offset: true })
  .refine((v) => new Date(v).getTime() > Date.now(), {
    message: "Must be in the future",
  })
  .refine(isOnBookingBoundary, { message: BOOKING_BOUNDARY_MESSAGE });

export const CreateConsultation = z.strictObject({
  firstName: name,
  lastName: name,
  reason: z
    .string()
    .trim()
    .min(1, "Required")
    .max(1000, "Must be 1000 characters or fewer"),
  scheduledAt: isoFuture,
});

// A union of two strict objects, so sending both at once is rejected rather than
// silently applying one. The body describes the desired state rather than naming
// an action - PATCH semantics, not RPC.
export const PatchConsultation = z.union([
  z.strictObject({ status: z.enum(["scheduled", "completed", "cancelled"]) }),
  z.strictObject({ scheduledAt: isoFuture }),
]);

export type CreateConsultationInput = z.infer<typeof CreateConsultation>;
export type PatchConsultationInput = z.infer<typeof PatchConsultation>;

/** Flattens a ZodError into the RFC 9457 `errors` extension member. */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}
