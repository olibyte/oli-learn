import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <p className="text-sm text-muted-foreground">
      {params?.error
        ? `Code error: ${params.error}`
        : "An unspecified error occurred."}
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
          Sorry, something went wrong.
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <ErrorContent searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
