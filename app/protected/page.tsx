// THROWAWAY HOST - prototype for issue #5.
// Three variants of the student dashboard, switchable via ?variant=A|B|C.
// Real auth, real RLS-scoped data; mutations are stubbed. Once a variant wins,
// fold it in properly and delete _prototype/ plus components/prototype-switcher.

import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import type { Consultation } from "./_prototype/types";
import { VariantA } from "./_prototype/variant-a";
import { VariantB } from "./_prototype/variant-b";
import { VariantC } from "./_prototype/variant-c";

const VARIANTS = [
  { key: "A", name: "Ledger — dense table" },
  { key: "B", name: "Split desk — persistent form" },
  { key: "C", name: "Agenda — timeline" },
];

async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant = "A" } = await searchParams;

  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims?.claims) {
    redirect("/auth/login");
  }

  // RLS scopes this to the signed-in student automatically - no where clause.
  const { data } = await supabase
    .from("consultations")
    .select("id, first_name, last_name, reason, scheduled_at, status")
    .order("scheduled_at", { ascending: false });

  const consultations = (data ?? []) as Consultation[];

  if (variant === "B") return <VariantB consultations={consultations} />;
  if (variant === "C") return <VariantC consultations={consultations} />;
  return <VariantA consultations={consultations} />;
}

export default function ProtectedPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  return (
    <div className="w-full flex-1 pb-24">
      <Suspense
        fallback={
          <p className="py-20 text-center text-sm text-muted-foreground">
            Loading your consultations…
          </p>
        }
      >
        <Dashboard searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <PrototypeSwitcher variants={VARIANTS} />
      </Suspense>
    </div>
  );
}
