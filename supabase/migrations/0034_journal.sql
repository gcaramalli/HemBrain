-- Travel journal (Travels → Guide → Journal): where we stay and what we did each day.
-- kind 'stay' = a hotel or place we sleep (entry_date = arrival, end_date = departure, open while null),
-- kind 'day' = a note about one day. Written in the app or through the connector (add_journal).
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.my_family_id() references public.families(id) on delete cascade,
  country text not null default 'TH' check (char_length(country) = 2),
  kind text not null default 'day' check (kind in ('stay', 'day')),
  entry_date date not null,
  end_date date,
  title text check (char_length(title) <= 200),
  body text check (char_length(body) <= 4000),
  place text check (char_length(place) <= 200),
  city text check (char_length(city) <= 100),
  member_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index journal_entries_family on public.journal_entries (family_id, country, entry_date);

alter table public.journal_entries enable row level security;
create policy "family all" on public.journal_entries for all
  using (family_id = (select private.my_family_id()))
  with check (family_id = (select private.my_family_id()));
