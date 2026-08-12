// THROWAWAY - prototype for issue #5. Variant B: "Split desk".
// Two columns. The booking form is permanently visible on the left rather than
// hidden in a dialog; the right column groups consultations by lifecycle.
// Optimised for booking being the thing you came to do.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Check, RotateCcw, X } from "lucide-react";
import { Consultation, fmtDate, fmtTime } from "./types";

function Row({ c }: { c: Consultation }) {
  const dimmed = c.status === "cancelled";
  return (
    <Card className={dimmed ? "opacity-55" : undefined}>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium tabular-nums ${dimmed ? "line-through" : ""}`}
            >
              {fmtDate(c.scheduled_at)} · {fmtTime(c.scheduled_at)}
            </span>
            {c.status === "completed" && (
              <Badge variant="secondary" className="gap-1">
                <Check className="size-3" /> Done
              </Badge>
            )}
            {c.status === "cancelled" && (
              <Badge variant="outline">Cancelled</Badge>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{c.reason}</p>
          <p className="text-xs text-muted-foreground">
            for {c.first_name} {c.last_name}
          </p>
        </div>
        {c.status !== "cancelled" && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="outline">
              {c.status === "completed" ? (
                <>
                  <RotateCcw className="size-3.5" /> Reopen
                </>
              ) : (
                <>
                  <Check className="size-3.5" /> Complete
                </>
              )}
            </Button>
            {c.status === "scheduled" && (
              <>
                <Button size="sm" variant="outline">
                  Move
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive">
                  <X className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: Consultation[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {items.length}
      </h3>
      <div className="space-y-2">
        {items.map((c) => (
          <Row key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

export function VariantB({ consultations }: { consultations: Consultation[] }) {
  const upcoming = consultations.filter((c) => c.status === "scheduled");
  const past = consultations.filter((c) => c.status === "completed");
  const cancelled = consultations.filter((c) => c.status === "cancelled");

  return (
    <div className="grid w-full gap-8 lg:grid-cols-[22rem_1fr]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Book a consultation</h2>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="b-first" className="text-xs">
                  First name
                </Label>
                <Input id="b-first" defaultValue="Sam" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-last" className="text-xs">
                  Last name
                </Label>
                <Input id="b-last" defaultValue="Rivera" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="b-when" className="text-xs">
                Date &amp; time
              </Label>
              <Input id="b-when" type="datetime-local" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="b-reason" className="text-xs">
                Reason
              </Label>
              <Textarea
                id="b-reason"
                rows={4}
                placeholder="What would you like to discuss?"
              />
            </div>
            <Button className="w-full">Book consultation</Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your consultations
          </h1>
          <p className="text-sm text-muted-foreground">
            {upcoming.length} upcoming · {past.length} completed
          </p>
        </div>
        {consultations.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Nothing booked yet. Use the form to book your first consultation.
            </CardContent>
          </Card>
        ) : (
          <>
            <Section title="Upcoming" items={upcoming} />
            <Section title="Completed" items={past} />
            <Section title="Cancelled" items={cancelled} />
          </>
        )}
      </div>
    </div>
  );
}
