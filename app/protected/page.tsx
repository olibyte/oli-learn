import { Suspense } from "react";
import { redirect } from "next/navigation";

import { StudentDashboard } from "@/components/consultations/student-dashboard";
import { COLUMNS, toDto } from "@/lib/api/consultations";
import { requestNow } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";

async function Consultations() {
  const supabase = await createClient();

  // No role branch here. An admin never reaches this page - `proxy.ts` redirects
  // them to /protected/admin before it renders, using the rule in
  // `lib/auth/role-routing.ts`. A redirect from inside this Suspense boundary
  // would arrive after the shell had been sent, and splitting role routing
  // across two files is how the repo came to hold two explanations of it.
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const studentId = claims?.claims?.sub;
  if (claimsError || !studentId) redirect("/auth/login");

  // RLS already restricts what this user may read - but an admin's read policy
  // ORs in *every* consultation, so without an explicit owner filter an admin
  // visiting their own dashboard would see the whole system here. This page is
  // "your consultations" for everyone; the admin view is a separate route.
  const { data, error } = await supabase
    .from("consultations")
    .select(COLUMNS)
    .eq("student_id", studentId)
    .order("scheduled_at", { ascending: false });

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        Your consultations could not be loaded. Please refresh to try again.
      </p>
    );
  }

  // `now` is fixed here rather than read inside the client component, so the
  // server render and hydration measure "upcoming" against the same instant.
  // Request-scoped rather than a bare `Date.now()`, so re-rendering this
  // component cannot move it - see `lib/request-time.ts`.
  return (
    <StudentDashboard
      consultations={(data ?? []).map(toDto)}
      now={requestNow()}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="w-full space-y-6" aria-busy="true">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="space-y-px rounded-lg border p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
    </div>
  );
}

export default function ProtectedPage() {
  return (
    <div className="w-full flex-1">
      {/* The read depends on cookies, so it must sit inside a Suspense boundary
          under Cache Components - and per-user data is never cached. */}
      <Suspense fallback={<TableSkeleton />}>
        <Consultations />
      </Suspense>
    </div>
  );
}
