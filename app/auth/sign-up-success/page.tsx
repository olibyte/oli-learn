import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Only reached when GoTrue withholds a session at signup, which is exactly the
 * case where a confirmation email really is pending. With confirmations off -
 * how this project runs, see #32 - `sign-up-form.tsx` sends the new account
 * straight to `/protected` instead, because it is already signed in.
 *
 * The screen stays rather than being deleted with the branch: it is what makes
 * turning confirmations back on a config change and nothing else.
 */
export default function Page() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          Thank you for signing up!
        </CardTitle>
        <CardDescription>Check your email to confirm</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          You&apos;ve successfully signed up. Please check your email to confirm
          your account before signing in.
        </p>
      </CardContent>
    </Card>
  );
}
