// THROWAWAY - prototype for issue #5. Variant A: "Ledger".
// Dense table, status as the leading column, actions in a per-row menu,
// booking hidden behind a dialog. Optimised for scanning many consultations.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarPlus, Check, RotateCcw, X } from "lucide-react";
import { Consultation, fmtDate, fmtTime } from "./types";

const statusStyles: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  completed:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  cancelled: "bg-muted text-muted-foreground border-transparent",
};

function BookingDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarPlus className="size-4" />
          Book consultation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book a consultation</DialogTitle>
          <DialogDescription>
            Tell us who it&apos;s for and what you need help with.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="a-first">First name</Label>
              <Input id="a-first" defaultValue="Sam" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-last">Last name</Label>
              <Input id="a-last" defaultValue="Rivera" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="a-when">Date &amp; time</Label>
            <Input id="a-when" type="datetime-local" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="a-reason">Reason</Label>
            <Textarea
              id="a-reason"
              rows={3}
              placeholder="What would you like to discuss?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full">Book consultation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VariantA({ consultations }: { consultations: Consultation[] }) {
  return (
    <div className="w-full space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Consultations
          </h1>
          <p className="text-sm text-muted-foreground">
            {consultations.length} total ·{" "}
            {consultations.filter((c) => c.status === "scheduled").length}{" "}
            upcoming
          </p>
        </div>
        <BookingDialog />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-44">When</TableHead>
              <TableHead className="w-40">Subject</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consultations.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No consultations yet. Book your first one above.
                </TableCell>
              </TableRow>
            )}
            {consultations.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={statusStyles[c.status]}
                  >
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  <span className="font-medium">{fmtDate(c.scheduled_at)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    {fmtTime(c.scheduled_at)}
                  </span>
                </TableCell>
                <TableCell>
                  {c.first_name} {c.last_name}
                </TableCell>
                <TableCell className="max-w-0 truncate text-muted-foreground">
                  {c.reason}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {c.status !== "cancelled" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        title={
                          c.status === "completed"
                            ? "Mark incomplete"
                            : "Mark complete"
                        }
                      >
                        {c.status === "completed" ? (
                          <RotateCcw className="size-4" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </Button>
                    )}
                    {c.status === "scheduled" && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title="Reschedule"
                        >
                          <CalendarPlus className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          title="Cancel"
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
