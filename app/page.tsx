import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Book a consultation
        </h1>
        <p className="mt-4 max-w-prose text-base text-muted-foreground sm:mt-6 sm:text-lg">
          Students book and manage their own consultations — scheduling a time,
          rescheduling it, marking it complete, or cancelling it. Administrators
          see every consultation in the system.
        </p>
        <Button asChild size="lg" className="mt-8 w-full sm:mt-10 sm:w-auto">
          <Link href="/protected">Get started</Link>
        </Button>
      </main>

      <SiteFooter />
    </div>
  );
}
