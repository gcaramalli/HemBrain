-- Tell the other parent when something that concerns them changes: an event
-- they do, an event for a kid, one moved or cancelled in the next 48 h, a
-- to-do given to them. Changes are caught here (so writes made through Hem,
-- the connector, count too), queued in `activity`, merged per row for a short
-- while (create + a few edits = one notification), then sent by
-- /api/cron/notify, which pg_cron calls every minute while something is due.
-- Who gets what is decided in src/lib/partner-notify.ts.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Who last changed an event: the signed-in user, or the speaker the connector
-- passes (it writes with the service role, so auth.uid() is null there).
alter table public.events add column updated_by uuid references auth.users(id) on delete set null;

create or replace function private.events_set_updated_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  elsif tg_op = 'INSERT' then
    new.updated_by := coalesce(new.updated_by, new.created_by);
  end if;
  return new;
end;
$$;

create trigger events_set_updated_by
  before insert or update on public.events
  for each row execute function private.events_set_updated_by();

-- One pending row per changed row: `before` is its state when the burst
-- started (null = created), `after` the latest (null = deleted).
-- No FK on family_id: rows are written while a family is being deleted too.
create table public.activity (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  table_name text not null check (table_name in ('events', 'list_items')),
  row_id uuid not null,
  actor uuid,
  via_app boolean not null default false,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '90 seconds',
  sent_at timestamptz
);
create unique index activity_pending on public.activity (table_name, row_id) where sent_at is null;
create index activity_due on public.activity (due_at) where sent_at is null;

-- Service role only: no policy.
alter table public.activity enable row level security;

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
  values ((r ->> 'family_id')::uuid, tg_table_name, (r ->> 'id')::uuid, who, auth.uid() is not null, o, n)
  on conflict (table_name, row_id) where sent_at is null do update
    set after = excluded.after,
        actor = coalesce(excluded.actor, activity.actor),
        via_app = excluded.via_app,
        due_at = excluded.due_at;
  return null;
end;
$$;

create trigger events_activity
  after insert or update or delete on public.events
  for each row execute function private.log_activity();

create trigger list_items_activity
  after insert or update on public.list_items
  for each row execute function private.log_activity();

-- Shared secret between pg_cron and the app's /api/cron/notify, kept in Vault.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_secret', 'pg_cron → /api/cron/notify');

create or replace function public.notify_secret_ok(given text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'notify_secret' and decrypted_secret = given);
$$;
revoke all on function public.notify_secret_ok(text) from public, anon, authenticated;
grant execute on function public.notify_secret_ok(text) to service_role;

-- Every minute, but only calls the app when a notification is due.
select cron.schedule(
  'hembrain-notify',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://hembrain.vercel.app/api/cron/notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.activity where sent_at is null and due_at <= now());
  $$
);

-- Sent rows are only kept a while, for debugging.
select cron.schedule('hembrain-activity-cleanup', '17 3 * * *', $$delete from public.activity where sent_at < now() - interval '14 days'$$);
