-- The admin view pages through every consultation with keyset (cursor)
-- pagination rather than OFFSET, so page depth costs nothing. The cursor is the
-- tuple (scheduled_at, id) - scheduled_at alone is not unique, and without the
-- id tiebreak rows sharing a timestamp can be skipped or repeated across pages.
--
-- Replaces the single-column index: a leading-column-compatible composite serves
-- every query the old one did, so keeping both would just cost writes.

drop index if exists public.consultations_scheduled_at_idx;

create index consultations_scheduled_at_id_idx
  on public.consultations (scheduled_at desc, id desc);
