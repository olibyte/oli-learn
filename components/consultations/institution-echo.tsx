"use client";

import { institutionEcho } from "./datetime";

/**
 * The live echo beneath a `datetime-local` picker (ADR-0004).
 *
 * The picker means the viewer's own clock - converting a naive string to an
 * instant in a named zone has real DST edge cases twice a year, and leaving
 * that to the browser leaves it where it is already solved. The cost is that a
 * student outside the institution's zone picks one time and the system records
 * another, so this says which is which rather than letting them find out after
 * booking.
 *
 * Renders nothing until there is something to echo: an empty or half-typed
 * value is the normal state of a picker mid-edit, not an error.
 */
export function InstitutionEcho({ value }: { value: string }) {
  const echo = institutionEcho(value);
  if (!echo) return null;

  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      Institution time:{" "}
      <span className="font-medium tabular-nums text-foreground">{echo}</span>
    </p>
  );
}
