"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // One destination for both roles, on purpose. An admin is redirected on
      // from here to /protected/admin by `proxy.ts` - branching on the role
      // in this handler would leave a typed URL or an old bookmark unguarded,
      // and would put the rule in a second place. See lib/auth/role-routing.ts.
      router.push("/protected");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          {/* The card is the whole page here, so its title is the page's `h1`
              - see `CardTitle`'s note. "Sign in" rather than "Login" because
              the header and the landing page both already call this control
              "Sign in", and WCAG 3.2.4 asks that the same function carry the
              same name wherever it appears. */}
          <CardTitle asChild className="font-display text-2xl">
            <h1>Sign in</h1>
          </CardTitle>
          <CardDescription>
            Enter your email and password to reach your consultations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                {/* `autoComplete` on both fields is WCAG 1.3.5 Identify
                    Input Purpose (AA) - the criterion axe cannot test, and the
                    one the pass found missing on every field in the app. It is
                    also what lets a password manager fill this form, which is
                    an accessibility affordance long before it is a convenience. */}
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {/* `role="alert"` so a failed sign-in is announced rather than
                  silently appearing, which is what the booking and reschedule
                  dialogs already do. `text-destructive` rather than the
                  starter's `text-red-500` for the same reason the palette
                  exists: only tokens are covered by
                  `lib/design/contrast.test.ts`. */}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in…" : "Sign in"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/sign-up"
                className="underline underline-offset-4"
              >
                Create account
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
