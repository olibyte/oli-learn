import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const LINKEDIN = "https://www.linkedin.com/in/olivercbennett";

/**
 * The way into a working account, for a visitor who has only ever opened the
 * deployed URL and has no repository to run.
 *
 * It used to print the demo credentials outright. It no longer does: the repo
 * and the domain are public, and a published password on a public page is an
 * open invitation to write into the live demo. What survives is the *position* -
 * a visitor's eye lands here, so this is where the way in belongs.
 *
 * It also used to say "Reviewing this? Start here" and close with a
 * `pnpm supabase db reset` command. Both were true and both were addressed to
 * someone holding the repository, on the one page most people reach without
 * one. The command is a fact about this repo and lives in it - README's
 * "Reaching both roles" says the same thing with the local table beside it -
 * and the greeting is gone entirely: "Request a demo" reaches the same person
 * without the page announcing what it is.
 *
 * The border is load-bearing, not decoration: this card is white on `--wash`,
 * and those two separate at only 1.05:1.
 */
export function AccessCard() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="font-display text-base font-semibold">Request a demo</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Get a student or administrator login and explore the app.
      </p>

      <Button asChild className="mt-4 w-full">
        <Link href={LINKEDIN} target="_blank" rel="noreferrer noopener">
          Request access
          <ArrowUpRight className="size-4" />
          <span className="sr-only">(opens LinkedIn in a new tab)</span>
        </Link>
      </Button>
    </div>
  );
}
