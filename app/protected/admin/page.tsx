import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { StatusPill } from "@/components/consultations/status-pill";
import { When } from "@/components/consultations/when";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

// This segment is allowed to block. The role guard below has to run before
// anything is sent, and under Cache Components a prerendered shell would commit
// a 200 before `notFound()` could change it.
export const instant = false;

const PAGE_SIZE = 25;

type SearchParams = Promise<{ cursor?: string }>;

/** Cursor is `<iso>|<uuid>` - the (scheduled_at, id) tuple of the last row seen. */
function parseCursor(raw?: string) {
  if (!raw) return null;
  const sep = raw.lastIndexOf("|");
  if (sep < 0) return null;
  const scheduledAt = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!scheduledAt || !id || Number.isNaN(Date.parse(scheduledAt))) return null;
  return { scheduledAt, id };
}

/** Cancelled rows are muted and struck through, never dimmed with opacity. */
const CANCELLED_ROW = "text-muted-foreground line-through";

async function AdminConsultations({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { cursor: rawCursor } = await searchParams;
  const supabase = await createClient();

  const cursor = parseCursor(rawCursor);

  // Keyset pagination, not OFFSET: page depth stays O(1) because the composite
  // index (scheduled_at desc, id desc) is walked directly to the cursor. OFFSET
  // would re-scan every skipped row.
  let query = supabase
    .from("consultations")
    .select("id, student_id, first_name, last_name, reason, scheduled_at, status")
    .order("scheduled_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1); // one extra row tells us whether a next page exists

  if (cursor) {
    query = query.or(
      `scheduled_at.lt.${cursor.scheduledAt},and(scheduled_at.eq.${cursor.scheduledAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        Consultations could not be loaded. Please refresh to try again.
      </p>
    );
  }

  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const hasNext = (data ?? []).length > PAGE_SIZE;
  const last = rows[rows.length - 1];
  const nextCursor = last ? `${last.scheduled_at}|${last.id}` : null;

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          All consultations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every consultation in the system, across every student. Read-only.
        </p>
      </div>

      {/* This view gets no tiles and no totals. It is keyset-paginated at 25
          rows, so a page knows nothing about the system's totals - any figure
          here would need either `count: "exact"` on the same query, which is a
          full scan over an RLS-filtered table, or a second aggregate query it
          does not make. It says what it is instead. */}
      <p className="text-sm text-muted-foreground">
        Newest first, 25 per page. Cancelled consultations stay listed.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground sm:py-16">
          No consultations found.
        </div>
      ) : (
        <>
          {/* Cards below `md`, matching the student dashboard. This view is
              read-only, so a card is just the four fields stacked. */}
          <ul className="space-y-3 md:hidden">
            {rows.map((c) => {
              const cancelled = c.status === "cancelled";
              return (
                <li key={c.id} className="space-y-1 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <When
                      at={c.scheduled_at}
                      className={cancelled ? CANCELLED_ROW : ""}
                    />
                    <StatusPill status={c.status} />
                  </div>
                  <p
                    className={`text-sm font-medium ${cancelled ? CANCELLED_ROW : ""}`}
                  >
                    {c.first_name} {c.last_name}{" "}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {c.student_id.slice(0, 8)}
                    </span>
                  </p>
                  <p
                    className={`break-words text-sm text-muted-foreground ${cancelled ? "line-through" : ""}`}
                  >
                    {c.reason}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-56 font-display font-semibold">
                    When
                  </TableHead>
                  <TableHead className="w-56 font-display font-semibold">
                    Student
                  </TableHead>
                  <TableHead className="font-display font-semibold">
                    Reason
                  </TableHead>
                  <TableHead className="w-28 text-right font-display font-semibold">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const cancelled = c.status === "cancelled";
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <When
                          at={c.scheduled_at}
                          className={cancelled ? CANCELLED_ROW : ""}
                        />
                      </TableCell>
                      <TableCell className={cancelled ? CANCELLED_ROW : ""}>
                        <div>
                          {c.first_name} {c.last_name}
                        </div>
                        {/* Disambiguates two students with the same name.
                            Emails live in auth.users, which the Data API does
                            not expose - see the ticket for why that is
                            deliberate. */}
                        <div className="font-mono text-xs text-muted-foreground">
                          {c.student_id.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell
                        className={`max-w-0 truncate text-muted-foreground ${cancelled ? "line-through" : ""}`}
                        title={c.reason}
                      >
                        {c.reason}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusPill status={c.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {(cursor || hasNext) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {rows.length} consultation{rows.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            {cursor && (
              <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                <Link href="/protected/admin">Back to start</Link>
              </Button>
            )}
            {hasNext && nextCursor && (
              <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                <Link
                  href={`/protected/admin?cursor=${encodeURIComponent(nextCursor)}`}
                >
                  Next page
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // The role guard runs HERE, before anything streams.
  //
  // Under Cache Components the shell is prerendered and sent first, so a
  // `notFound()` thrown inside the Suspense boundary below would arrive after
  // the 200 status was already committed: a student would see the not-found UI
  // but the response would still be 200. `export const instant = false` above
  // lets this segment block, so the guard runs before anything is sent - the
  // right trade for an admin-only route, where a correct status code beats a
  // prerendered shell.
  //
  // A student gets 404 rather than 403, so the route's existence is never
  // confirmed to someone who may not use it - matching the API's stance on rows
  // you cannot see. RLS remains the real boundary; this only decides rendering.
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || claims?.claims?.user_role !== "admin") notFound();

  return (
    <div className="w-full flex-1">
      <Suspense
        fallback={
          <div className="w-full space-y-6" aria-busy="true">
            <div className="h-8 w-64 animate-pulse rounded bg-muted" />
            <div className="h-64 animate-pulse rounded-lg bg-muted/60" />
          </div>
        }
      >
        <AdminConsultations searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
