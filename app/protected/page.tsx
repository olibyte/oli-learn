import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ConsultationsTable } from "@/components/consultations/consultations-table";
import { COLUMNS, toDto } from "@/lib/api/consultations";
import { createClient } from "@/lib/supabase/server";

async function Consultations() {
  const supabase = await createClient();

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

  return <ConsultationsTable consultations={(data ?? []).map(toDto)} />;
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
