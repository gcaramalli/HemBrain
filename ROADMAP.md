# Roadmap

Priorities as of 2026-09-26. Build one batch at a time. The direction behind them is in [`VISION.md`](VISION.md).

## 0. Hygiene (before anything else)
- [ ] Remove `MCP_TOKEN` + `FAMILY_ID` from Vercel (old single-family connector token; personal links replace it)
- [x] Verified sending domain in Resend (hembrain.com) → password reset for everyone (Supabase SMTP, 2026-10)
- [ ] Turn "Confirm email" back on in Supabase (required before opening to other families)
- [ ] Production on a `main` branch

## 1. Groceries (daily use)
- [x] Aisles/categories, sorted in store order
- [x] Autocomplete from history (also prevents "Pasta"/"Pâtes" duplicates that skew restock predictions)
- [x] Visible quantity + note, +/- buttons
- [x] Paste several lines at once

## 2. Calendar
- [x] Recurring events (daily preschool drop-off/pick-up, weekly activities)
- [x] Month view; tap a day to open its week; multi-day events on every day they cover
- [x] Kids tab: plan drop-offs and pick-ups week by week, tap to assign; Today card for the next preschool day
- [x] Filter by person
- [x] Week view with a "who drops off / picks up" row per day
- [ ] Secret iCal feed per person (`/api/calendar/<token>.ics`) → subscribe from iOS/Google Calendar and get
      native reminders (read-only, periodic refresh)

## 3. Claude & automation
- [ ] Weekly routine (Sunday): week summary + add items that are running out
- [x] Skip / move a single occurrence of a repeating event (app and connector `only_date`)
- [x] Scan a receipt in the app (needs `ANTHROPIC_API_KEY`) and "type it" event entry
- [x] Show "added by <name>" for items/events created through the connector
- [ ] Test photo → events (school planning, emails) through the connector

## 4. Meals
- [ ] Weekly meal plan → missing ingredients to the shopping list
- [ ] Import a recipe from a URL (schema.org Recipe JSON-LD)
- [x] "What can we cook tonight?" via Claude (`dinner_ideas`) + "Tonight?" card on Today

## 5. Family memory, first slice (see VISION.md)
- [x] Occasions (weddings, birthdays) in Brain → Dates, out of the calendar except our own; 28 weddings imported
- [x] Paste a list (`251025 Names`, `*` = only me, `//` = no longer celebrated)
- [x] Reminder the evening before, only to the people concerned
- [ ] People and tastes (who they are to us, likes, gift ideas); link occasions to people
- [ ] Drafted message in the right language in the reminder (needs `ANTHROPIC_API_KEY`)
- [x] Connector tools `get_occasions`, `add_occasion`
- [ ] Connector tools `remember`, `recall`, `get_person`
- [x] Travels: countries each of us has been to, world map by person (Today tile), connector `get_travels` / `add_countries`
- [x] Travels timeline: trips by month with who went (Me → My trips), feeds the map; connector `add_trips`
- [ ] Charlie's measurements and growth curve
- [x] Kid tab as tiles: preschool, sleep (naps, nights, wakings → Claude suggests bedtime), wardrobe (sizes, has / to buy,
      season essentials), food (the kid's meals, loves / refuses), plus the family's own list and note tiles
- [ ] Breastfeeding / bottle log for newborns (Food tile)

## 5b. Money
- [x] Shared expenses between the parents (who paid, usual split 50/50 or set per family, adjust per expense, who owes whom, settle up); connector `add_expense` / `get_expenses`

## 6. If Hembrain becomes a product (Sweden)
- [x] Swedish, French and English UI, language per account
- [ ] GDPR: privacy policy, self-service data export and account deletion
- [ ] Onboarding for a new family (kids, preschool, usual store)
- [ ] Per-family limits/abuse protection on open sign-up

## Later / maybe
- BVC milestones, chores
- [x] Receipts: photo → Claude → `log_receipt` (purchases with store/price, checks off the list)
- Kivra: no public API for private users as far as we know — not planned

## Done
- [x] Papers (contracts, insurance, warranties, IDs): renewal / last day to cancel on Today and in the evening push,
      Claude reads a PDF or photo, `get_papers` review; family or private, private tiles lockable with a code
- [x] Evening reminders and "you've been given something to do" (web push, Vercel Cron)
- [x] Undo instead of confirmation dialogs; calmer ink-on-paper interface where colour means a person
- [x] Little gifts between family members ("à toi, à moi"): send an emoji + note, unwrapped on next open; also via Claude (`send_gift`)
- [x] Shared calendar, lists, recipes, notes, admin, profile (PWA)
- [x] Supabase schema with per-family RLS, restock prediction view
- [x] Password sign-in, multi-family sign-up, private invite links, dashboard-created accounts join the inviting family
- [x] Claude connector: 14 tools, personal revocable links (Profile → Connect Claude), knows who is talking
