import { Wordmark } from "@/components/oli-learn-wordmark";
import { INSTITUTION_TIME_ZONE_NAME } from "@/lib/time";

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col-reverse items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <p className="flex items-center gap-1.5">
          {/* `sm` renders single-ink by design - the amber is only legal as
              large text, and the footer is not it. */}
          <Wordmark size="sm" />
          <span>— consultation booking</span>
        </p>
        {/* Names the zone rather than an abbreviation. "AEST" is wrong from
            October to April, and deriving the current abbreviation would mean
            reading the clock during render - which Cache Components rejects as
            an unstable value, and rightly: it would make this static page
            dynamic to print one word. Each displayed time carries its own
            correct abbreviation.

            The theme control used to sit beside this. It is in the header now:
            a setting you reach for on arrival should not be at the bottom of
            the page, and the auth screens have no footer to put it in. */}
        <span>All times shown in {INSTITUTION_TIME_ZONE_NAME}.</span>
      </div>
    </footer>
  );
}
