import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

/**
 * Renders nothing unless the signed-in user's role claim is `admin`, so the
 * route is not advertised to students. This is discoverability only - the page
 * itself guards independently, and RLS is the actual boundary.
 */
export async function AdminNavLink() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.user_role !== "admin") return null;

  return (
    <Link
      href="/protected/admin"
      className="flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground"
    >
      <ShieldCheck className="size-4" />
      All consultations
    </Link>
  );
}
