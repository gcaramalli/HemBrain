-- The family's memory of the people around it (VISION.md): who they are to us,
-- and what we know about them (tastes, gift ideas, what we gave, moments).
-- People are friends and relatives outside the family; the family's own members
-- stay in `members`, and a memory can be about either.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.my_family_id() references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- How we know them, in our words: "Guillaume's best man", "Charlie's friend from preschool".
  relation text check (char_length(relation) <= 200),
  circle text not null default 'friend' check (circle in ('relative', 'friend', 'child', 'other')),
  -- For a child: their parents (other people), so "Paul's son" can be found from Paul.
  parent_ids uuid[] not null default '{}',
  -- The language to write to them in (free text: "French", "svenska").
  language text check (char_length(language) <= 40),
  notes text check (char_length(notes) <= 4000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index people_family_name on public.people (family_id, lower(name));

alter table public.people enable row level security;
create policy "family all" on public.people for all
  using (family_id = (select private.my_family_id()))
  with check (family_id = (select private.my_family_id()));

-- One thing worth remembering, in a sentence, about some people and / or family members.
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.my_family_id() references public.families(id) on delete cascade,
  kind text not null default 'fact' check (kind in ('like', 'dislike', 'gift_idea', 'gift_given', 'size', 'allergy', 'fact', 'moment')),
  body text not null check (char_length(body) between 1 and 2000),
  person_ids uuid[] not null default '{}',
  member_ids uuid[] not null default '{}',
  -- When it happened (a gift given, a moment); null for what is simply true.
  happened_on date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index memories_family on public.memories (family_id, created_at desc);
create index memories_people on public.memories using gin (person_ids);

alter table public.memories enable row level security;
create policy "family all" on public.memories for all
  using (family_id = (select private.my_family_id()))
  with check (family_id = (select private.my_family_id()));

-- A wedding or birthday can point at the people it is about.
alter table public.occasions add column person_ids uuid[] not null default '{}';
