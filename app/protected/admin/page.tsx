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

  // Defence in depth, and only that. `lib/supabase/proxy.ts` already rewrote a
  // non-admin request to a 404 before this component was reached, and the RPC
  // below is `security invoker`, so RLS would hand a student their own rows and
  // nothing else even if it ran. Reaching this line without the claim means both
  // of those failed; render nothing rather than a table.
  //
  // Being inside the Suspense boundary, this cannot set the status - the shell
  // has already been sent with a 200. That is the proxy's job, and the reason
  // it is the proxy's job. What this buys is the shell itself: hoisting the
  // read into the page body made `/protected/admin` the one route in the app
  // with no prerendered HTML at all.
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || claims?.claims?.user_role !== "admin") notFound();

  const cursor = parseCursor(rawCursor);

  // Keyset pagination, through an RPC rather than a PostgREST filter.
  //
  // The cursor has to reach Postgres as a row comparison, `(scheduled_at, id) <
  // (cursor_at, cursor_id)`, because that is the only form the composite index
  // (scheduled_at desc, id desc) can use as a *bound*. Expressing the same
  // condition as `or=(scheduled_at.lt.X, and(scheduled_at.eq.X, id.lt.Y))` - what
  // this page did until 20260813021500_admin_keyset_rpc.sql - reaches Postgres as
  // a top-level OR, which an index scan cannot be bounded by, so the planner
  // keeps the ordering and demotes the cursor to a Filter that reads and discards
  // every row already paged past. Measured, that read the same buffers as the
  // OFFSET keyset was chosen to beat. PostgREST has no row-comparison operator,
  // so the query lives in the database; see the migration for the plans.
  //
  // The function is `security invoker`, so the select policy still decides what
  // the caller sees - this page is not a privileged read.
  //
  // Columns are named here rather than reused from `COLUMNS` in lib/api: that
  // list is the write API's response shape and deliberately omits `student_id`,
  // which this table displays to disambiguate students who share a name.
  const { data, error } = await supabase
    .rpc("admin_consultations_page", {
      // Omitted rather than null on the first page: every argument defaults, and
      // the function turns an absent cursor into the largest possible tuple.
      cursor_scheduled_at: cursor?.scheduledAt,
      cursor_id: cursor?.id,
      page_size: PAGE_SIZE + 1, // one extra row tells us whether a next page exists
    })
    .select("id, student_id, first_name, last_name, reason, scheduled_at, status")
    // The function already orders, but a set-returning function's output order is
    // not guaranteed to survive a function scan, and this one is load-bearing -
    // the last row becomes the next cursor. Re-stating it sorts at most 26 rows.
    .order("scheduled_at", { ascending: false })
    .order("id", { ascending: false });

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

export default function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Nothing is awaited here on purpose. `searchParams` is passed down as a
  // promise rather than unwrapped, so this shell holds no request-dependent
  // value and Cache Components can prerender it.
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
