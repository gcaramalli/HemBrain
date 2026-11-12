-- A kid who is off preschool for a while (holiday, trip): no drop-offs or pick-ups are expected,
-- planned or reminded before this date (the first day back). Null = normal routine.
alter table public.members add column care_paused_until date;
