import { formatDate, formatTime, zoneLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * A consultation's time, in the institution's clock and labelled with it -
 * `14 Aug 2026 9:30 am AEST` (ADR-0004).
 *
 * No `"use client"`: this renders identically on the server and in the browser,
 * which is what lets the admin view use it while staying free of client
 * JavaScript, and lets the student table use it inside a client component.
 *
 * `suppressHydrationWarning` stays, with its meaning changed. It used to mark
 * an *intended* server/client divergence, back when the locale was `undefined`
 * and each runtime answered with its own defaults. Now that both the zone and
 * the locale are pinned, Node and Chrome were verified to produce byte-
 * identical output - so this guards against future ICU drift instead. ICU 72
 * already changed the space before am/pm to U+202F once; the attribute means a
 * repeat degrades to a cosmetic difference rather than throwing the tree away
 * and re-rendering it.
 */
export function When({
  at,
  className,
}: {
  at: string;
  className?: string;
}) {
  return (
    // The attribute only reaches one level down, so it sits on the elements
    // that actually hold the formatted text rather than on the wrapper.
    <span className={cn("tabular-nums", className)}>
      <span className="font-medium" suppressHydrationWarning>
        {formatDate(at)}
      </span>{" "}
      <span className="text-muted-foreground" suppressHydrationWarning>
        {formatTime(at)} {zoneLabel(at)}
      </span>
    </span>
  );
}
