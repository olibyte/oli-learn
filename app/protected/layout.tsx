import { Suspense } from "react";

import { AdminNavLink } from "@/components/admin-nav-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader homeHref="/protected">
        <Suspense>
          <AdminNavLink />
        </Suspense>
      </SiteHeader>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
