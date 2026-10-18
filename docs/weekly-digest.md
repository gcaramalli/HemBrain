# Weekly news email

Every Sunday, a short email tells each account what's new in Hembrain. Families
that have gone quiet (nothing added and no sign-in for 14 days) get one extra
paragraph nudging them to try something. Nothing is sent without a super
admin's tap.

```
Sunday ~08:00  Claude Code routine → reads the week's merged PRs → writes a draft
               (en / fr / sv) into `digests` through the Supabase connector
Sunday         Hembrain admin → News (/stats/digest): read each language, edit,
               "Send me a test", then "Send to everyone" — or "Skip this week"
               → /api/digest/send → Resend batch API
Any time       Personal settings checkbox, or the link at the bottom of the
               email (/unsubscribe → /api/digest/unsubscribe) → profiles.digest_opt_out
```

## Pictures

A paragraph that is only `![what it shows](/digest/<file>)` becomes a picture
(full width, rounded) in the email and in the admin preview; it is left out of
the plain-text version. Only files in `public/digest/` (png, jpg, gif, webp) are
accepted, so a draft can't load anything from elsewhere: commit the picture
there first (e.g. `public/digest/2026-10-18-week.jpg`, ~1000 px wide, < 200 KB),
then add the line in each language in Hembrain admin → News.

## Setup

- Domain `hembrain.com` verified in Resend (SPF/DKIM on `send.` and
  `resend._domainkey`, DMARC on `_dmarc`, DNS in Vercel).
- Vercel env (Production): `RESEND_API_KEY` (a Resend key with sending access
  to hembrain.com). Optional: `DIGEST_FROM` (default
  `Hembrain <news@hembrain.com>`), `DIGEST_REPLY_TO` (default
  `hello@hembrain.com`, forwarded by ImprovMX), `APP_URL` (default
  `https://hembrain.vercel.app`), `DIGEST_SECRET` (signs unsubscribe links;
  falls back to `CRON_SECRET`). Without `RESEND_API_KEY` the send button answers
  "not configured" and nothing else changes.
- Sign-in emails (Supabase SMTP) use `noreply@hembrain.com` and their own
  Resend key, so a complaint about the news never hurts password resets.

## The routine's prompt

A Claude Code routine (claude.ai/code → Routines), a fresh session every Sunday
at 07:52 Europe/Stockholm, with the Supabase connector:

> You write Hembrain's weekly "what's new" email. Do not send anything and do
> not change any table other than `public.digests`.
>
> 1. With the Supabase connector (project `jvzwbguwoafayxmdirnj`), run
>    `select week_of, created_at from digests order by week_of desc limit 1;`.
>    Today's date in Europe/Stockholm is `week_of` for this run; if a row for
>    it already exists, stop.
> 2. With the GitHub tools, list the pull requests merged into `main` of
>    `gcaramalli/hembrain` since that last row's `created_at` (or the last 7
>    days if there is none). Read their titles and descriptions, and the diff
>    when the description doesn't say what changes on screen.
> 3. Keep only what a family notices in the app: new screens, new things Hem
>    (the Claude/ChatGPT connector) can do, visible fixes. Leave out
>    refactors, infrastructure, admin-only pages, and anything about how the
>    data is stored. Name things the way the app does (check
>    `src/lib/i18n/fr.ts` and `sv.ts` for the words people see). At most 5
>    items, the most useful first.
> 4. If nothing is left, insert a skipped row and stop:
>    `insert into digests (week_of, subject, body, status) values ('<date>', '{"en":"Nothing new"}', '{"en":""}', 'skipped');`
> 5. Otherwise write, in English, French and Swedish (natural, not
>    word-for-word; French uses "vous", Swedish "ni"):
>    - `subject`: under 60 characters, the best novelty, no emoji.
>    - `body`: one warm sentence, then a "- " bullet per item: **what it is**,
>      where to find it, why it helps, in one or two lines. End with one line
>      inviting replies ("Just reply to this email to tell us what you'd
>      like next."). Blank line between paragraphs, `**bold**` only, no links,
>      no headings.
>    - `nudge`: two or three sentences for a family that hasn't opened the
>      app for two weeks: one concrete thing to try this week that takes a
>      minute (e.g. "Ask Hem: add swimming on Saturday at 10"), friendly, no
>      guilt.
> 6. Insert it with dollar quoting so apostrophes are safe:
>    `insert into digests (week_of, subject, body, nudge) values ('<date>', jsonb_build_object('en', $s$…$s$, 'fr', $s$…$s$, 'sv', $s$…$s$), jsonb_build_object(…), jsonb_build_object(…)) on conflict (week_of) do nothing;`
> 7. Answer with the English subject and the list of PRs you used, so the
>    notification says what's waiting in Hembrain admin → News.
