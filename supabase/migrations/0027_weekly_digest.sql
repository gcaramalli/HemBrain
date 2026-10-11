-- Weekly news email: what's new in Hembrain, written by Claude from the week's
-- merged pull requests (a Claude Code routine inserts a draft on Sunday
-- morning, see docs/weekly-digest.md), reviewed and sent by a super admin
-- from Hembrain admin → News (/stats/digest) through Resend.

create table public.digests (
  id uuid primary key default gen_random_uuid(),
  week_of date not null unique, -- the Sunday it is sent
  -- Per language: {"en": "…", "fr": "…", "sv": "…"}. Body = short paragraphs,
  -- "- " bullets and **bold** (src/lib/digest-format.ts).
  subject jsonb not null,
  body jsonb not null,
  -- Extra paragraph for families that haven't used the app for two weeks.
  nudge jsonb,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'skipped')),
  sent_at timestamptz,
  sent_count integer,
  created_at timestamptz not null default now()
);
alter table public.digests enable row level security;
create policy "super admin all" on public.digests for all
  using (exists (select 1 from public.super_admins s where s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.super_admins s where s.user_id = (select auth.uid())));

-- Opt-out per account (Personal settings, or the link at the bottom of the email).
alter table public.profiles add column digest_opt_out boolean not null default false;

-- Who gets this week's email, in which language, and whether their family has
-- gone quiet (nothing added and no sign-in for 14 days → gets the nudge).
create or replace function public.digest_recipients()
returns table (profile_id uuid, email text, display_name text, locale text, inactive boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.super_admins s where s.user_id = auth.uid()) then
    raise exception 'not_super_admin' using errcode = '42501';
  end if;
  return query
  with activity as (
    select family_id, created_at as at from public.events
    union all select family_id, created_at from public.list_items
    union all select family_id, purchased_at from public.purchases
    union all select family_id, created_at from public.meals
    union all select family_id, updated_at from public.notes
  ),
  fam as (
    select f.id, greatest(
      (select max(a.at) from activity a where a.family_id = f.id),
      (select max(u.last_sign_in_at) from auth.users u join public.profiles p on p.id = u.id where p.family_id = f.id)
    ) as last_active
    from public.families f
  )
  select p.id, coalesce(u.email, p.email)::text, p.display_name, p.locale,
         coalesce(fam.last_active < now() - interval '14 days', true)
  from public.profiles p
  join fam on fam.id = p.family_id
  left join auth.users u on u.id = p.id
  where not p.digest_opt_out and coalesce(u.email, p.email) is not null;
end;
$$;
revoke all on function public.digest_recipients() from public, anon;
grant execute on function public.digest_recipients() to authenticated;
