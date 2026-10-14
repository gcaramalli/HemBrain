-- "I can't" on a drop-off / pick-up is now told by the server too (it was
-- pushed by the phone 4 s after the last tap, which never happened once the
-- app was closed). care_availability has no id: its row key is
-- kid:day:kind:member.

alter table public.activity drop constraint activity_table_name_check;
alter table public.activity add constraint activity_table_name_check
  check (table_name in ('events', 'list_items', 'care_availability'));
alter table public.activity alter column row_id type text using row_id::text;

create or replace function private.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  who uuid := auth.uid();
begin
  if tg_table_name = 'events' then
    -- Only what changes when or where it happens, or who does it / is concerned.
    if tg_op = 'UPDATE' and (o - 'title' - 'notes' - 'updated_by' - 'created_by' - 'created_at')
                          = (n - 'title' - 'notes' - 'updated_by' - 'created_by' - 'created_at') then
      return null;
    end if;
    who := coalesce(who, (r ->> 'updated_by')::uuid);
  elsif tg_table_name = 'care_availability' then
    -- Only "I can't" (and taking it back, so a pending one is dropped).
    if coalesce((o ->> 'available')::boolean, true) and coalesce((n ->> 'available')::boolean, true) then
      return null;
    end if;
  else
    -- To-dos: only when someone is given one, or its due date moves.
    if tg_op = 'DELETE'
       or (tg_op = 'INSERT' and new.assignee_member_id is null)
       or (tg_op = 'UPDATE' and new.assignee_member_id is not distinct from old.assignee_member_id
                            and new.due_date is not distinct from old.due_date) then
      return null;
    end if;
    who := coalesce(who, case when tg_op = 'INSERT' then new.created_by end);
  end if;

  insert into public.activity (family_id, table_name, row_id, actor, via_app, before, after)
  values (
    (r ->> 'family_id')::uuid,
    tg_table_name,
    coalesce(r ->> 'id', concat_ws(':', r ->> 'kid_id', r ->> 'day', r ->> 'kind', r ->> 'member_id')),
    who,
    auth.uid() is not null,
    o,
    n
  )
  on conflict (table_name, row_id) where sent_at is null do update
    set after = excluded.after,
        actor = coalesce(excluded.actor, activity.actor),
        via_app = excluded.via_app,
        due_at = excluded.due_at;
  return null;
end;
$$;

create trigger care_availability_activity
  after insert or update or delete on public.care_availability
  for each row execute function private.log_activity();
