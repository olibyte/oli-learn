import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button } from "./ui/button";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  // getClaims() verifies locally against the project's ES256 signing keys.
  // getUser() would round-trip to the auth server for the same answer.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      {/* The email is identity confirmation, not navigation - it is the first
          thing to go when there is no room for it. */}
      <span className="hidden max-w-[24ch] truncate text-muted-foreground sm:inline">
        {user.email}
      </span>
      <LogoutButton />
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">Sign in</Link>
      </Button>
      {/* "Create account", not "Sign up": the landing page's primary CTA and
          this button go to the same route, and one function with two names is
          a WCAG 3.2.4 failure. The pass found four labels for these two
          routes; this is the last of them. */}
      <Button asChild size="sm">
        <Link href="/auth/sign-up">Create account</Link>
      </Button>
    </div>
  );
}
