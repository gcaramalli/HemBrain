@AGENTS.md

# Hembrain — notes for Claude

Family app for **Guillaume** (dad, admin), **Jenny** (mom) and **Charlie** (baby/toddler, no account).
Where it is going: `VISION.md` (the family's long-term, agent-readable memory) — read it before proposing features;
next steps in `ROADMAP.md`.
Next.js 16 + Supabase. All data lives in Supabase Postgres; every table is scoped by `family_id` and
protected by RLS (`private.my_family_id()`, in a schema the API does not expose).

Supabase project: **Caramalli Familly brain** (`jvzwbguwoafayxmdirnj`, in Jenny's org, eu-west-1). Migrations 0001–0026 are applied. Sign-up is open (multi-family); joining a family needs an invite code (`invites.code`, link `/signup?invite=…`), see `handle_new_user()` in `0004_dashboard_users_join_invited_family.sql` (accounts created from the Supabase dashboard have no metadata and join the family that invited their email). A user's family = `profiles.family_id`.

## Adding things for the family

Preferred: the **Hembrain connector** (`/api/mcp` + bearer header, tools in `src/lib/mcp/tools.ts`) for
the calendar, lists, purchases, recipes, notes and papers (event times are passed as local Stockholm time, see `src/lib/mcp/time.ts`).
Setup and routing prompt: `docs/claude-setup.md`.

Fallback, for maintenance only (full admin access — avoid for day-to-day use): raw SQL via the Supabase connector.

When you run SQL with the Supabase connector you are **not** a signed-in user, so `auth.uid()` is null:
always set `family_id` explicitly and look people up by name.

```sql
-- Family id and people
select id, name from families;
select id, name, profile_id from members;          -- Guillaume, Jenny, Charlie

-- "Jenny picks up Charlie at the förskola on Thursday 16:00"
insert into events (family_id, title, starts_at, ends_at, location, responsible_member_id, for_member_id)
select f.id, 'Pick up Charlie', '2026-10-01 16:00 Europe/Stockholm', '2026-10-01 16:30 Europe/Stockholm',
       'Förskolan …',
       (select id from members where name ilike 'jenny%'),
       (select id from members where name ilike 'charlie%')
from families f limit 1;

-- Add to the shopping list
insert into list_items (family_id, list_id, title, quantity)
select l.family_id, l.id, 'Toothpaste', '1' from lists l where l.kind = 'grocery' order by position limit 1;

-- Log a purchase made outside the list (feeds the restock prediction)
insert into purchases (family_id, item_name, source) select id, 'Toothpaste', 'manual' from families limit 1;

-- What's probably running out
select item_name, next_due_on, avg_interval_days from restock_suggestions order by next_due_on;

-- Family facts to read before answering (pickup rules, addresses, allergies…)
select title, body from notes order by pinned desc, updated_at desc;
```

Rules of thumb:
- Times are Europe/Stockholm unless told otherwise; store as `timestamptz`.
- Check `notes` for context (e.g. the kindergarten address) before inventing a location.
- Don't delete rows unless explicitly asked.

## Schema (see `supabase/migrations/`)

- Three levels: member, family admin (`profiles.role`), and Hembrain super admin (`super_admins`, Guillaume only; granted by SQL, no API write policy). Super admins open `/stats`, fed by `hembrain_stats()`, which returns counts and dates across families, never their content.
- `families`, `profiles` (one per account, `role` admin/member), `members` (everyone, incl. Charlie), `invites` (secret `code`, `expires_at`, single use)
- `events` — calendar; `responsible_member_id` = who does it, `for_member_id` = who it's about; `recurrence` (daily/weekdays/weekly/biweekly/monthly) + `recurrence_until`, expanded in `src/lib/recurrence.ts` / `src/lib/events.ts`; `skip_dates` = occurrences removed or changed on their own (a changed one becomes a separate one-off event); `care` = `dropoff`/`pickup` of a child (Kids tab, `src/lib/care.ts`; stored title stays English, e.g. "Pick-up Charlie", and is translated on display). All-day events include their end date.
- `members` also hold kids' usual `dropoff_time`, `pickup_time`, `care_place`, `care_days` (ISO weekdays), and their
  `clothing_size` / `shoe_size` (+ `sizes_updated_on`)
- Kid tab = tiles (`/kids`, kid picked in `KidProvider`, `src/components/kid-context.tsx`): Preschool (`/kids/preschool`, the
  drop-off / pick-up planner), Sleep, Wardrobe, Food, plus the family's own list/note tiles (`kid_boards` / `kid_items`,
  rendered by `BoardView` from `private-space.tsx`). `kid_sleep` = naps and nights (`ends_at` null = asleep now, `wakings`
  counted), summed per day in `src/lib/sleep.ts` (a night belongs to the evening it started); `kid_clothes` = has / need /
  outgrown by category, season essentials in `src/lib/wardrobe.ts`; Food = the kid's rows in `meals` (their own + family
  ones) with `meals.reaction` (loved/ok/refused). Connector: `get_kid_sleep` / `log_sleep`, `get_wardrobe` /
  `update_wardrobe`, `get_meals` with `who`, `log_meal` with `reaction`; Claude gives the bedtime / meal advice, not the app.
- `care_availability` — per kid/day/`kind`/parent: `available` true ("I can") or false ("I can't"), no row = hasn't said. The one who goes confirms ("I'm going") = the care event's `responsible_member_id` (`src/components/care-slot.tsx`)
- `push_subscriptions` — one row per device with reminders on (own rows only)
- `lists` (`kind` grocery → Kitchen, todo → Calendar → To-do, and open to-dos with a `due_date` also show on their day in the calendar and on Today, late ones on today (`src/components/todo-row.tsx`); both rendered by `src/components/lists-view.tsx`) and `list_items` (`category` = aisle id from `src/lib/categories.ts`)
- `purchases` — auto-filled by a trigger when a grocery item is checked off (skipped if the item was logged <10 min ago); `source` list/manual/receipt, `store`, `price`
- `restock_suggestions` — view: average interval between purchases → `next_due_on` (needs ≥2 purchases)
- `recipes` — `ingredients text[]`, `tags text[]`, `favorite`, `kid_friendly`
- `meals` — what we ate: `eaten_on`, `slot` (breakfast/lunch/dinner/snack), `title`, optional `recipe_id`, `food_groups` (ids in `src/lib/meals.ts`, for balance), `place` (home/out/takeaway), `member_ids` (empty = everyone). Meals tab → "What we ate", filtered All / with the kids (no `member_ids` or a kid in them) / parents only; connector `log_meal` / `get_meals`, `dinner_ideas` returns last week's meals, `plan_groceries` gives Claude the habits + what runs out to plan the shopping (no in-app prediction on purpose)
- `notes` — the family brain
- `private_boards` / `private_items` — each account's private space (top of the Me tab, `src/components/private-space.tsx`): tiles that are a
  list, a note or gift ideas (`private_items.person` / `occasion`, grouped by person; tiles show no content preview), RLS on `profile_id = auth.uid()` so nobody else sees them, not even the admin. Not exposed through the
  connector on purpose (it uses the service role and speaks for the whole family).
- `work_people` / `work_projects` / `work_meetings` / `work_items` — the private **Work** space (`/work`, opened from a `work`
  tile): people at work (`role` boss/peer/team/other), projects (`person_ids`), recurring meetings (`weekday`, `person_ids` =
  attendees) and items (`kind` todo/give/discuss, `status` open → waiting (handed over) → done, optional person/project/meeting).
  A person's page = their items + items on their projects; a meeting's agenda = its own (collective) items first, then each attendee's give/discuss items under their name, for its
  attendees (`src/lib/work.ts`); `not_before` keeps an item off agendas until then ("for next week's meeting"), done items
  stay visible `HISTORY_DAYS` (60) for recaps, people and projects carry `notes` (who owns what) for routing. `priority` puts an item first everywhere; the Me tab of /work = priorities, my own to-dos (`kind` todo), unsorted, waiting on others, and the tab switches (`profiles.work_hidden_tabs` hides People / Projects / Meetings, data kept). Delete a person / project / meeting from the bottom of its sheet (items stay, unsorted). Owner-only RLS like `private_boards`. The one private part the connector reaches
  (`get_work` / `add_work_items` / `update_work_item` / `set_work_entry`), always filtered by the token owner's `profile_id`
  and refused for the legacy family token.
- `feedback` — ideas / bugs sent from Settings → Give feedback (own rows only); super admins read them through
  `hembrain_feedback()` and set `status` (new/planned/done/declined) in Hembrain admin → Feedback (`/stats/feedback`).
- `ai_budgets` (per family `plan` free/paid + `monthly_limit_usd`, no row = free at `FREE_MONTHLY_LIMIT_USD` = $1,
  `src/lib/ai-budget.ts`; only super admins write it) and `ai_usage` (one row per in-app Claude call with tokens and
  `cost_usd`, written with the service role by `extract()` in `src/lib/ai.ts`, which refuses a call once the month's
  spend reaches the cap → HTTP 402). Admin view: `/stats/ai` via `hembrain_ai_usage()`. The connector costs nothing here.
- `visited_countries` — Travels: one row per member and country (ISO alpha-2, `first_year`, `note`), names translated with
  `Intl.DisplayNames` and pasted lists in any language matched by `parseCountries` (`src/lib/countries.ts`). Map outlines are
  pre-projected in `src/lib/world-map.json` (built by `scripts/gen-world-map.mjs`, no map library), drawn by `WorldMap`:
  each person's colour, ink (`--foreground`, white in dark mode) where both parents went, a kid with a parent keeps the parent's colour. Tile on Home, page `/travels`; connector `get_travels` / `add_countries`.
- `trips` — Travels timeline (`/travels/timeline`, from Travels, filtered on me by default but family-visible):
  `country`, `start_month` / `end_month` (first of the month; no start = year unknown), `lived`, `note`, `member_ids` (who went).
  A trigger (`private.trip_ticks_country`) ticks the country in `visited_countries` for everyone who went and keeps
  `first_year` to the earliest trip; deleting a trip leaves the tick. Connector `add_trips`; `get_travels` returns the trips too.
- `papers` — contracts, insurance, receipts kept for the warranty, IDs (Me → Papers, `/papers`): `category` (ids in
  `src/lib/papers.ts`), `provider`, `member_ids` (who it covers, empty = household), `amount` + `period`, `renews_on` +
  `notice_days` (last day to cancel, rolled forward by period in `nextRenewal()`; monthly contracts get no deadlines),
  `expires_on`, `warranty_until`, `summary`, `details` (jsonb of key terms), `ended`. `profile_id` null = the family's,
  set = private to that account (RLS). The document goes to the private `papers` storage bucket at
  `<family_id>/<paper_id>/<file>` (storage policies check the paper row is visible), read through signed URLs.
  Deadlines in the next 30 days show on Home (private ones unnamed) and in the evening push 30/7/1 days ahead.
  In-app "photo or PDF" reading = `/api/ai/paper` (Haiku, metered). Connector: `get_papers` (with `review` for the yearly
  review), `add_paper`, `update_paper`; files can't go through the connector.
- Locked tiles: `private_boards.locked` + a per-account code (4–8 digits) hashed in `private.pins`, only reached through
  `private_pin_status/set/check/clear()` (5 wrong → 5 min wait). `src/components/pin-lock.tsx`: `usePin`, `PinGate`,
  `PinSheet`; unlocked state is in memory and relocks after a minute in the background. Private papers are always behind
  the code when one is set. A curtain for a shared phone, not encryption: RLS already hides these rows from other accounts.
- `expenses` — shared expenses, a small Tricount (Home → Expenses, `/expenses`): `paid_by` a member, `split_among` (the
  adults by default; kids never pay), `shares` = `{member_id: weight}` for an uneven split (null = equal), `settlement` = a
  payback (payer gives the amount to the one person in `split_among`, same arithmetic). The family's usual split
  (`expense_settings.shares`, empty = 50/50, editable by both parents) is copied onto each new expense; opening one
  offers 50/50, the usual split, or Other (amounts by hand). Parts and the fewest transfers in `parts` / `settleUp`
  (`src/lib/expenses.ts`, in cents, per currency). Connector `add_expense` (usual split by default, `shares` by name) /
  `get_expenses`.
- `gifts` — little gifts between accounts (emoji + note), private to sender/recipient, unwrapped in `GiftInbox`
- `profiles.locale` — app language per account (en/fr/sv)
- `occasions` — dates celebrated every year (weddings attended, friends' / relatives' birthdays): `date` = original day,
  `member_ids` = who it concerns (gets the reminder), `ended` = kept but no longer celebrated (e.g. divorced),
  `ours` = one of the family's own dates. Deliberately **not** in `events`: only `ours` and members' `birthdate`
  are shown in the calendar (`familyDates` in `src/lib/occasions.ts`); the rest live in Brain → Dates and in the
  evening reminder. Connector: `get_occasions` / `add_occasion`.
  Family members' own birthdays are `members.birthdate` (asked at sign-up via `handle_new_user`, then Profile, Family settings, kid ⚙️; connector `set_birthdate`), turned
  into occasions by `familyBirthdays()`: calendar, Brain → Dates, `get_occasions`, and the evening reminder to everyone but the person.

## Dev

- `npm run dev`, `npm run lint`, `npm run build`
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`)
- Pages under `src/app/(app)` are client components talking to Supabase directly (RLS is the security
  boundary). New tables need RLS + a `family all` policy like the existing ones.
- Claude connector (mcp-handler + MCP SDK v2): `src/app/api/mcp/[token]/route.ts` (personal link) and
  `src/app/api/mcp/route.ts` (Bearer header). Tokens live hashed in `connector_tokens` (created in Profile →
  Me → Reminders & AI; ChatGPT uses the same link via Developer mode); `src/lib/mcp/context.ts` resolves token → family + speaker into an AsyncLocalStorage.
  It uses the service-role client (`src/lib/supabase/admin.ts`, bypasses RLS), so every query in
  `src/lib/mcp/tools.ts` must filter by `familyId()`. Server env: `SUPABASE_SERVICE_ROLE_KEY` (or
  `SUPABASE_SECRET_KEY`); legacy single-family `MCP_TOKEN` + `FAMILY_ID` still accepted.
- Schema changes: add a new numbered file in `supabase/migrations/`, never edit an applied one.
- Navigation: five tabs, one job each — Home (`/`: today at the top, then the family's shared tiles: to-do, shopping, meals, `/brain`, `/papers`, `/travels`), Calendar (`/calendar` + `/todo` for to-do lists, `CalendarSegments`),
  the kid (if any: tiles, see above), Kitchen (`/lists` = shopping lists only, `/meals`, `/recipes`, `/purchases`, see `KitchenHeader`), Me (`/me`: only what is private — private tiles, `/work`).
  Optional parts nobody has filled in yet show as dashed tiles (`HubTile empty`, private-space suggestions) with one line on what they are for, so they advertise the feature; they turn solid once there is data. Private suggestions are matched by kind (work, gifts) or by name in any language, never by the current locale's title only.
  Settings sit behind the avatar, top right (`/settings`): personal (`/profile`), Reminders & AI (`/connections`), family (`/admin`),
  give feedback (`/feedback`), invite a friend (shares `/signup`), sign out, and for super admins Hembrain admin (`/stats`, `/stats/feedback`, `/stats/ai`, `StatsHeader`).
  Screens use `PageHeader` (title left, one main action right, `Segments` under it). Settings live next to what
  they set (kid's routine and profile in the kid tab ⚙️, list rename/delete in the list's ⋯).
- UI text: wrap every string in `t("English text")` from `useFamily()`, then add French and Swedish in
  `src/lib/i18n/fr.ts` / `sv.ts`; `npm run i18n:check` lists what's missing. Format dates with `fmtDate` (`src/lib/dates.ts`).
- No `prompt()`/`confirm()`/`alert()`: deletions act at once and offer Undo (`useToast`), irreversible ones use `ConfirmButton`.
- Colour: people's colours on data about people (events, slots, badges); each module has its own hue
  (`src/lib/modules.ts`) used only to find your way — tab bar, `HubTile`s, `ModuleIcon` next to page titles.
  Buttons and text stay ink. Dark mode is night blue.
- Look: bold Geist titles, surfaces float on the page (`--lift` shadow, no outline), pill buttons, segmented
  controls as a pill on a soft track, floating rounded tab bar with coloured duotone icons,
  the page fading into the background beneath it. A person shows as a dot in their colour + name (`MemberBadge`).
- Icons: `lucide-react` line icons for the interface (tabs, buttons, section titles); emoji only for what
  people choose themselves (a kid's emoji, private tiles, gifts).
- Brand: the app icon (`src/app/icon.svg`, PNGs in `src/app/apple-icon.png` / `public/icon-*.png`, `favicon.ico`) is a house
  that is also a speech bubble with three dots (blue, pink, orange = the family, and Claude thinking), on night blue `#111722`.
  Same mark as the Home tab icon (`HemHome` in `src/lib/modules.ts`). The dots are the signature: `ThinkingDots`
  (`src/components/thinking-dots.tsx`) pulses them whenever the app reads or works something out.
  Pull-to-refresh (`src/components/pull-to-refresh.tsx`, installed app only: Safari has its own) shows them too, and
  remounts `<main>` (a new key in `AppShell`) so every screen reloads its data.
- Optional server env: `ANTHROPIC_API_KEY` (receipt scan + "type it" event entry, `src/lib/ai.ts`, on the cheapest model,
  Haiku; advice like sleep or meals goes through the family's own Claude + the connector, not the API),
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (reminders, `src/lib/push.ts`) and `CRON_SECRET`
  (`/api/cron/reminders`, daily at 17:00 UTC via `vercel.json`). Features hide themselves when unset.
