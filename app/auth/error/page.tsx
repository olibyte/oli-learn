import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Reached from one place: `app/auth/confirm/route.ts`, when an emailed link
 * fails to verify. So the screen can say what actually happened rather than
 * apologise in general.
 *
 * `error` is a GoTrue message ("Email link is invalid or has expired") or the
 * route's own "No token hash or type". It used to render as
 * `Code error: <message>`, which is a developer's sentence on a page only an
 * end user ever sees - and the screen offered no way onward, so a bad link was
 * the end of the visit (#47).
 */
async function ErrorDetail({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  if (!params?.error) return null;

  return (
    <p className="text-sm text-muted-foreground">
      The server said: {params.error}.
    </p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          That link didn&apos;t work
        </CardTitle>
        <CardDescription>
          It may have expired, or already been used.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense>
          <ErrorDetail searchParams={searchParams} />
        </Suspense>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
