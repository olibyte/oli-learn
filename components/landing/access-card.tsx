import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const LINKEDIN = "https://www.linkedin.com/in/olivercbennett";

/**
 * The highest-value element on the page for the person actually assessing it,
 * which is why it sits beside the hero rather than below the fold.
 *
 * It used to print the demo credentials outright. It no longer does: the repo
 * and the domain are public, and a published password on a public page is an
 * open invitation to write into the live demo. What survives is the *position* -
 * a reviewer's eye lands here, so this is where the two ways in belong.
 *
 * Local first, deliberately. It needs nothing from anyone, works offline, and
 * gives both roles; the request path exists for a reviewer who only ever opens
 * the deployed URL.
 *
 * The border is load-bearing, not decoration: this card is white on `--wash`,
 * and those two separate at only 1.05:1.
 */
export function AccessCard() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="font-display text-base font-semibold">
        Reviewing this? Start here
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Two demo accounts exist, one for each role. They are handed over on
        request rather than published, so the live data stays as it was left.
      </p>

      <Button asChild className="mt-4 w-full">
        <Link href={LINKEDIN} target="_blank" rel="noreferrer noopener">
          Request access
          <ArrowUpRight className="size-4" />
          <span className="sr-only">(opens LinkedIn in a new tab)</span>
        </Link>
      </Button>

      <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
        Running it yourself needs no one:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          pnpm supabase db reset
        </code>{" "}
        seeds both roles into your local stack.
      </p>
    </div>
  );
}
