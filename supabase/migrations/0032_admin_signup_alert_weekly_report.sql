-- For Hembrain's super admins only: a push when a new account signs in for
-- the first time, and the numbers for the Sunday usage email
-- (/api/cron/usage-report). Counts and dates, never a family's content.

-- The first sign-in rides the partner-notification queue (0029): pg_cron
-- already calls /api/cron/notify when a row is due, which hands 'signups'
-- rows to src/lib/admin-notify.ts. row_id = the new account's id.
alter table public.activity drop constraint activity_table_name_check;
alter table public.activity add constraint activity_table_name_check
  check (table_name in ('events', 'list_items', 'care_availability', 'signups'));

create or replace function private.log_first_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is null
     or (tg_op = 'UPDATE' and old.last_sign_in_at is not null)
     or exists (select 1 from public.super_admins s where s.user_id = new.id) then
    return null;
  end if;
  insert into public.activity (family_id, table_name, row_id, due_at)
  values (
    -- The profile may not exist yet when GoTrue signs in at sign-up; the
    -- family is looked up again when the push is sent.
    coalesce((select family_id from public.profiles where id = new.id), '00000000-0000-0000-0000-000000000000'),
    'signups',
    new.id::text,
    now() + interval '30 seconds'
  )
  on conflict (table_name, row_id) where sent_at is null do nothing;
  return null;
exception when others then
  -- Never stand in the way of a sign-in.
  return null;
end;
$$;

create trigger on_auth_user_first_sign_in
  after insert or update of last_sign_in_at on auth.users
  for each row execute function private.log_first_sign_in();

-- The week in numbers, for the service role (the cron has no signed-in user).
create or replace function public.hembrain_weekly_report()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with added as (
    select family_id, created_at as at from public.events
    union all select family_id, created_at from public.list_items
    union all select family_id, purchased_at from public.purchases
    union all select family_id, created_at from public.recipes
    union all select family_id, updated_at from public.notes
    union all select family_id, created_at from public.meals
    union all select family_id, created_at from public.expenses
    union all select family_id, created_at from public.papers
  ),
  fam as (
    select
      f.id,
      f.name,
      f.created_at,
      (select count(*) from public.profiles p where p.family_id = f.id) as accounts,
      (select count(*) from added a where a.family_id = f.id and a.at > now() - interval '7 days') as added_7d,
      (select count(*) from added a where a.family_id = f.id and a.at > now() - interval '14 days' and a.at <= now() - interval '7 days') as added_prev_7d,
      greatest(
        (select max(a.at) from added a where a.family_id = f.id),
        (select max(u.last_sign_in_at) from auth.users u join public.profiles p on p.id = u.id where p.family_id = f.id)
      ) as last_active,
      (select max(ct.last_used_at) from public.connector_tokens ct join public.profiles p on p.id = ct.profile_id where p.family_id = f.id) as connector_last_used,
      (select coalesce(sum(au.cost_usd), 0) from public.ai_usage au where au.family_id = f.id and au.created_at > now() - interval '7 days') as ai_usd_7d
    from public.families f
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'families', (select count(*) from fam),
      'accounts', (select count(*) from public.profiles),
      'new_accounts_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'new_families_7d', (select count(*) from fam where created_at > now() - interval '7 days'),
      'active_families_7d', (select count(*) from fam where last_active > now() - interval '7 days'),
      'active_families_prev_7d', (
        select count(distinct family_id) from added
        where at > now() - interval '14 days' and at <= now() - interval '7 days'
      ),
      'added_7d', (select coalesce(sum(added_7d), 0) from fam),
      'added_prev_7d', (select coalesce(sum(added_prev_7d), 0) from fam),
      'connector_families_7d', (select count(*) from fam where connector_last_used > now() - interval '7 days'),
      'ai_calls_7d', (select count(*) from public.ai_usage where created_at > now() - interval '7 days'),
      'ai_usd_7d', (select coalesce(sum(cost_usd), 0) from public.ai_usage where created_at > now() - interval '7 days'),
      'feedback_7d', (select count(*) from public.feedback where created_at > now() - interval '7 days'),
      'feedback_open', (select count(*) from public.feedback where status = 'new'),
      'push_devices', (select count(*) from public.push_subscriptions)
    ),
    'new_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', p.display_name,
        'email', p.email,
        'family', f.name,
        'joined_existing', f.created_at < p.created_at - interval '1 minute',
        'created_at', p.created_at,
        'last_sign_in_at', u.last_sign_in_at
      ) order by p.created_at desc)
      from public.profiles p
      join public.families f on f.id = p.family_id
      left join auth.users u on u.id = p.id
      where p.created_at > now() - interval '7 days'
    ), '[]'::jsonb),
    'families', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', name, 'accounts', accounts, 'added_7d', added_7d, 'added_prev_7d', added_prev_7d,
        'last_active', last_active, 'ai_usd_7d', ai_usd_7d
      ) order by added_7d desc, last_active desc nulls last)
      from fam
    ), '[]'::jsonb),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'locale', coalesce(p.locale, 'en')))
      from public.super_admins s
      join auth.users u on u.id = s.user_id
      left join public.profiles p on p.id = s.user_id
      where u.email is not null
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.hembrain_weekly_report() from public, anon, authenticated;
grant execute on function public.hembrain_weekly_report() to service_role;
