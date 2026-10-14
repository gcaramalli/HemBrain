# Telling the other parent

When one parent adds or changes something, the other hears about it only when it
concerns them, so notifications stay worth reading. Phase 1 (live pushes) is built;
phase 2 (an evening "what changed" summary) is not.

## Who hears what

| # | The other parent… | Live push | Evening summary (phase 2) | Nothing |
|---|---|---|---|---|
| **Calendar** |||||
| 1 | creates an event you do | ✅ | | |
| 2 | creates an event *for* you | within 7 days | later | |
| 3 | creates a family event (nobody responsible, for nobody) | today / tomorrow | later | |
| 4 | moves an event you do, or one in the next 48 h that concerns you | ✅ "Thu 16:00 → 17:00" | | |
| 5 | takes over / takes you off something you did | ✅ | | |
| 6 | cancels something you do, or something in the next 48 h | ✅ | others | |
| 7 | only edits the title or notes | | | ✅ |
| **Kids** |||||
| 8 | adds an event for a kid (doctor, BVC, preschool closed) | ✅ always | | |
| 9 | "I'm going" on a drop-off or pick-up, or "I can't" while nobody else is going | ✅ | | |
| 10 | moves a drop-off / pick-up in the next 48 h | ✅ | | |
| 11 | changes the kid's usual times or days | | ✅ | |
| 12 | logs sleep, meals, clothes | | | ✅ |
| **To-dos** |||||
| 13 | gives you a to-do | ✅ | | |
| 14 | moves your to-do's due date to today / tomorrow | ✅ | others | |
| 15 | ticks off a to-do of yours | | ✅ | |
| 16 | adds an unassigned to-do or a grocery item | | | ✅ |
| **Other** |||||
| 17 | adds a shared expense, a paper, a pinned note | | ✅ | |

"Concerns you" = you do it, it is for you, it is for a kid, or it is for the whole
family (nobody responsible, for nobody). Never about what you did yourself, including
through Hem.

Hem says it: every push is titled "Hem" and reads as Hem's sentence ("Jenny is counting on
you for Charlie's pick-up (Thu 15 Oct, 16:00)."). Written from templates, not by the model:
free, instant, and it never fails silently. No quiet hours: the phone's own focus / silent
mode decides. Several changes by the same person at once become one push listing them.

## How it works

1. `events`, `list_items` and `care_availability` triggers (`private.log_activity`, migration 0029) write each
   relevant change to `activity`: `before` (first state of the burst, null = created),
   `after` (latest, null = deleted), `actor` (profile) and `via_app`. A row stays pending
   90 s after its last change, so create + a few edits merge into one.
2. Who did it: `auth.uid()` in the app; the connector writes with the service role and
   signs `events.updated_by` itself (deletes sign the row first). Unknown author
   (maintenance SQL) → nothing is sent.
3. pg_cron (`hembrain-notify`, every minute) calls `POST /api/cron/notify` through pg_net,
   only while something is due, with the `notify_secret` kept in Supabase Vault
   (checked by `notify_secret_ok()`).
4. `src/lib/partner-notify.ts` claims due rows and decides recipients and wording. A
   one-off that replaces one date of a series ("this Friday Jenny picks up") is read as
   a change of that date, not as a new event plus a cancellation.
5. Kids tab answers are told here too, never by the phone (a timer in the page died as
   soon as the app was closed). "I'm going" comes from the care event; "I can't" from
   `care_availability` (migration 0030, row key `kid:day:kind:member`), so backing out
   of a slot in the app is told once.

Sent rows are deleted after 14 days (`hembrain-activity-cleanup`).
