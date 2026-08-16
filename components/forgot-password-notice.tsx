import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { CONTACT_URL } from "@/lib/contact";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * What `/auth/forgot-password` says now that it no longer lies.
 *
 * It used to be a form. It called `resetPasswordForEmail` and then swapped to
 * "Check Your Email - Password reset instructions sent" on any non-error
 * response. No such email can arrive: Supabase's built-in SMTP delivers only to
 * members of the project's own organisation, which is the same finding that
 * keeps email confirmation off (issue #32). Custom SMTP needs a domain we own
 * with DNS records, which `oli-learn.vercel.app` is not.
 *
 * Measured against the deployed project on 2026-08-16, because the shape of the
 * failure was worse than "nothing arrives":
 *
 *   POST /auth/v1/recover  unknown address   -> 200 {}
 *   POST /auth/v1/recover  admin@example.com -> 400 email_address_invalid
 *   POST /auth/v1/recover  student@…         -> 400 email_address_invalid
 *
 * Same domain either side of that line, so the discriminator is existence, not
 * deliverability: hosted GoTrue looks the user up *before* it validates the
 * address, so a 400 says the account is real. Two consequences. The two demo
 * accounts a reviewer is given are exactly the ones that render a red
 * `Email address "admin@example.com" is invalid` - the flow is visibly broken on
 * the only credentials anyone has. And the form put a one-click account-existence
 * oracle on the login page. Removing the request removes it from the product;
 * the API still answers, which is the security section's material, not this
 * component's.
 *
 * So this is a card, not a form: nothing to submit, nothing to promise, no
 * request to send. The route and the "Forgot your password?" link both stay,
 * because a locked-out person needs somewhere to land and something to do -
 * and resets really are available here, by hand, from the same contact the
 * landing page already offers. That is an ordinary thing for a small product to
 * do; "this demo cannot send email" would be the app announcing it is a
 * take-home, which is the line issue #47 drew across these screens.
 *
 * If custom SMTP ever lands, the form is one `git revert` away and
 * `/auth/update-password` - still live, still validating - is the other half of
 * it already built.
 */
export function ForgotPasswordNotice({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Reset Your Password
          </CardTitle>
          <CardDescription>
            Password resets are handled by a person, not an email link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Get in touch and we&apos;ll restore your access. Mention the email
            address on the account.
          </p>

          <Button asChild className="mt-6 w-full">
            <Link href={CONTACT_URL} target="_blank" rel="noreferrer noopener">
              Request a reset
              <ArrowUpRight className="size-4" />
              <span className="sr-only">(opens LinkedIn in a new tab)</span>
            </Link>
          </Button>

          <p className="mt-4 text-center text-sm">
            Remembered it?{" "}
            <Link href="/auth/login" className="underline underline-offset-4">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
