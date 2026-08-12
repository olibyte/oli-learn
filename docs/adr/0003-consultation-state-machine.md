# A consultation has one status, and cancelling is a transition rather than a delete

A consultation is `scheduled`, `completed`, or `cancelled` — a single column with a check constraint. Completing and un-completing move between `scheduled` and `completed`; cancelling moves to `cancelled`; rescheduling changes the date and time while the status stays `scheduled`.

## Considered Options

- **Separate `status` and a nullable `completed_at`.** Rejected: it permits a row that is simultaneously cancelled and complete, an illegal state that then has to be defended in application code forever.
- **An append-only transition history table.** Rejected as audit-log ambition the brief never asked for.
- **`DELETE` for cancellation.** Rejected, and this one matters: the admin view is specified as "all consultations across the entire system," which necessarily includes cancelled ones. Hard-deleting destroys exactly the rows the admin deliverable is meant to show.

## Consequences

- A single enumerated column makes the illegal combinations unrepresentable at the database level rather than by convention.
- Because cancellation is a transition, the student's own list needs a deliberate answer about whether cancelled consultations stay visible to them, rather than the question being settled by the row's absence.
