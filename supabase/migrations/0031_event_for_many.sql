-- An event can be about several people ("dinner: Jenny and Guillaume").
-- `for_member_ids` is the list; `for_member_id` stays as its first entry so
-- drop-offs / pick-ups, notifications and older writers keep working. A trigger
-- keeps the two in step whichever one a writer sets.

alter table public.events add column for_member_ids uuid[] not null default '{}';
-- Backfill quietly: not a change anyone made, so nothing for the partner notifications.
alter table public.events disable trigger events_activity;
update public.events set for_member_ids = array[for_member_id] where for_member_id is not null;
alter table public.events enable trigger events_activity;

create or replace function private.events_for_many()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.for_member_ids is not distinct from old.for_member_ids
     and new.for_member_id is distinct from old.for_member_id then
    -- An older writer changed the single column: the list follows.
    new.for_member_ids := case when new.for_member_id is null then '{}'::uuid[] else array[new.for_member_id] end;
  elsif cardinality(new.for_member_ids) > 0 then
    new.for_member_id := new.for_member_ids[1];
  elsif tg_op = 'UPDATE' and new.for_member_ids is distinct from old.for_member_ids then
    new.for_member_id := null; -- the list was emptied
  elsif new.for_member_id is not null then
    new.for_member_ids := array[new.for_member_id];
  end if;
  return new;
end;
$$;

create trigger events_for_many before insert or update on public.events
  for each row execute function private.events_for_many();
