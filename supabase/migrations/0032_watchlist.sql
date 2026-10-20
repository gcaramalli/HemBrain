-- Films and series recommended to the family, added one by one and ticked off
-- once watched (Home → Films & series).
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.my_family_id() references public.families(id) on delete cascade,
  kind text not null default 'film' check (kind in ('film', 'series')),
  title text not null check (char_length(title) <= 200),
  -- Who recommended it (free text: a friend, a newspaper...) and where to watch it.
  recommended_by text check (char_length(recommended_by) <= 100),
  platform text check (char_length(platform) <= 100),
  notes text,
  status text not null default 'to_watch' check (status in ('to_watch', 'watched')),
  watched_on date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index watchlist_family on public.watchlist (family_id);

alter table public.watchlist enable row level security;
create policy "family all" on public.watchlist for all
  using (family_id = (select private.my_family_id()))
  with check (family_id = (select private.my_family_id()));
