import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { careTitle, usualTime } from "./care";
import { addDays, dayKey, startOfDay } from "./dates";
import { expand } from "./events";
import { BCP47, isLocale, translator, type Locale } from "./i18n";
import { sendPush } from "@/lib/push";
import type { CalendarEvent, CareAvailability, ListItem, Member } from "./types";

// What the other parent hears about a change (docs/notifications.md):
// only what concerns them, now; nothing about what they did themselves.
// Hem says it: the push is titled "Hem" and written as Hem's sentence.
// Rows come from `activity` (supabase/migrations/0029_partner_notifications.sql).
// Callers pin process.env.TZ to Europe/Stockholm: day maths uses local time.

type EventRow = CalendarEvent & { family_id: string; updated_by?: string | null };
type ItemRow = ListItem & { family_id: string };
type Answer = CareAvailability & { family_id: string };
type Activity = {
  id: number;
  family_id: string;
  table_name: "events" | "list_items" | "care_availability";
  row_id: string;
  actor: string | null;
  via_app: boolean;
  before: EventRow | ItemRow | Answer | null;
  after: EventRow | ItemRow | Answer | null;
};

type Kind = "assigned" | "took_over" | "removed" | "going" | "cant" | "added_you" | "added_kid" | "added" | "moved" | "changed" | "place" | "cancelled" | "todo" | "todo_due";
const ICON: Record<Kind, string> = {
  assigned: "👉", took_over: "🔁", removed: "↩️", going: "✅", cant: "⚠️", added_you: "➕", added_kid: "➕", added: "➕",
  moved: "🕑", changed: "✏️", place: "📍", cancelled: "❌", todo: "👉", todo_due: "🕑",
};

// `text` = Hem's sentence when sent alone, `line` = the short line when grouped.
type Note = { to: string; locale: Locale; actor: string; kind: Kind; text: string; line: string; url: string };

const HOUR = 3600000;

type Ctx = {
  db: SupabaseClient;
  now: Date;
  members: Member[];
  locales: Map<string, Locale>;
  todoLists: Set<string>;
};

export async function sendDueNotifications(db: SupabaseClient) {
  const now = new Date();
  // Claim what is due; a second run at the same time gets nothing.
  const { data, error } = await db
    .from("activity")
    .update({ sent_at: now.toISOString() })
    .is("sent_at", null)
    .lte("due_at", now.toISOString())
    .select("id, family_id, table_name, row_id, actor, via_app, before, after");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Activity[];

  const notes: Note[] = [];
  for (const familyId of new Set(rows.map((r) => r.family_id))) {
    const [{ data: members }, { data: profiles }, { data: lists }] = await Promise.all([
      db.from("members").select("*").eq("family_id", familyId),
      db.from("profiles").select("id, locale").eq("family_id", familyId),
      db.from("lists").select("id").eq("family_id", familyId).eq("kind", "todo"),
    ]);
    const ctx: Ctx = {
      db,
      now,
      members: (members ?? []) as Member[],
      locales: new Map((profiles ?? []).map((p) => [p.id as string, isLocale(p.locale) ? p.locale : "en"])),
      todoLists: new Set((lists ?? []).map((l) => l.id as string)),
    };
    for (const row of rows.filter((r) => r.family_id === familyId)) {
      notes.push(...(row.table_name === "events" ? await eventNotes(ctx, row) : row.table_name === "care_availability" ? await answerNotes(ctx, row) : itemNotes(ctx, row)));
    }
  }

  // One push per person and author: a few changes at once become one list.
  let sent = 0;
  const groups = new Map<string, Note[]>();
  for (const n of notes) groups.set(`${n.to}|${n.actor}`, [...(groups.get(`${n.to}|${n.actor}`) ?? []), n]);
  for (const group of groups.values()) {
    const [first] = group;
    const t = translator(first.locale);
    sent += await sendPush(first.to, {
      title: "Hem",
      body:
        group.length === 1
          ? first.text
          : [t("{name} made {count} changes:", { name: first.actor, count: group.length }), ...group.slice(0, 5).map((n) => `${ICON[n.kind]} ${n.line}`)].join("\n"),
      url: group.every((n) => n.url === first.url) ? first.url : "/",
      tag: `partner-${first.to}-${now.getTime()}`,
    });
  }
  return { claimed: rows.length, sent };
}

function helpers(ctx: Ctx, recipient: Member) {
  const locale = ctx.locales.get(recipient.profile_id!) ?? "en";
  const t = translator(locale);
  const kid = (id: string | null | undefined) => ctx.members.find((m) => m.id === id && !m.profile_id);
  const label = (ev: EventRow) => {
    const k = kid(ev.for_member_id);
    if (k && ev.care && ev.title === careTitle(ev.care, k)) {
      return ev.care === "dropoff" ? t("Drop-off {name}", { name: k.name }) : t("Pick-up {name}", { name: k.name });
    }
    return ev.title;
  };
  const when = (iso: string, allDay: boolean) =>
    new Date(iso).toLocaleString(BCP47[locale], {
      timeZone: "Europe/Stockholm",
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
    });
  return { locale, t, kid, label, when };
}

// The first occurrence still to come (or running now) in the next 60 days.
const nextOcc = (ctx: Ctx, ev: EventRow | null) => (ev ? (expand([ev], ctx.now, addDays(ctx.now, 60))[0] ?? null) : null);
const occOn = (ev: EventRow, day: string) => {
  const from = new Date(`${day}T00:00:00`);
  return expand([{ ...ev, skip_dates: [] }], from, addDays(from, 1)).find((o) => o.key === `${ev.id}:${day}`) ?? null;
};
const sameSlot = (a: EventRow, b: EventRow) => a.title === b.title || (!!a.care && a.care === b.care && a.for_member_id === b.for_member_id);

// A one-off that replaces one date of a series ("this Friday Jenny picks up").
async function seriesReplaced(ctx: Ctx, ev: EventRow) {
  if (ev.recurrence) return null;
  const day = dayKey(ev.starts_at);
  const { data } = await ctx.db.from("events").select("*").eq("family_id", ev.family_id).not("recurrence", "is", null).contains("skip_dates", [day]);
  const series = ((data ?? []) as EventRow[]).find((s) => sameSlot(s, ev));
  const occ = series && occOn(series, day);
  return series && occ ? ({ ...series, starts_at: occ.occurrence_start, ends_at: occ.occurrence_end, recurrence: null, recurrence_until: null, skip_dates: [] } as EventRow) : null;
}

async function hasReplacement(ctx: Ctx, series: EventRow, day: string) {
  const from = new Date(`${day}T00:00:00`);
  const { data } = await ctx.db
    .from("events")
    .select("*")
    .eq("family_id", series.family_id)
    .is("recurrence", null)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", addDays(from, 1).toISOString());
  return ((data ?? []) as EventRow[]).some((e) => sameSlot(series, e));
}

async function eventNotes(ctx: Ctx, row: Activity): Promise<Note[]> {
  const actor = ctx.members.find((m) => m.profile_id && m.profile_id === row.actor);
  if (!actor) return []; // unknown author (maintenance SQL): say nothing
  let before = row.before as EventRow | null;
  const after = row.after as EventRow | null;
  if (!before && !after) return []; // created and deleted within the same minute
  if (!before && after) before = await seriesReplaced(ctx, after); // then it is a change of that date

  const ev = (after ?? before)!;
  const ob = nextOcc(ctx, before);
  const ox = nextOcc(ctx, after);
  type Occ = { occurrence_start: string } | null;
  const soon = (o: Occ, hours: number) => !!o && new Date(o.occurrence_start).getTime() < ctx.now.getTime() + hours * HOUR;
  const near = (o: Occ) => soon(o, 48);
  const isKid = (id: string | null | undefined) => ctx.members.some((m) => m.id === id && !m.profile_id);
  // In the app, backing out of a slot also answers "I can't", told by answerNotes.
  const appCare = !!ev.care && row.via_app;
  const url = ev.care ? "/kids/preschool" : "/calendar";

  const out: Note[] = [];
  for (const r of ctx.members.filter((m) => m.profile_id && m.id !== actor.id)) {
    const h = helpers(ctx, r);
    const t = h.t;
    const concerns = (e: EventRow) => e.responsible_member_id === r.id || e.for_member_id === r.id || isKid(e.for_member_id) || (!e.responsible_member_id && !e.for_member_id);
    // "Pick-up Charlie (Thu 15 Oct, 16:00)"
    // Mid-sentence, a drop-off / pick-up reads "Charlie's pick-up".
    const lbl = (e: EventRow) => {
      const k = h.kid(e.for_member_id);
      if (!k || !e.care || e.title !== careTitle(e.care, k)) return h.label(e);
      return e.care === "dropoff" ? t("{name}'s drop-off", { name: k.name }) : t("{name}'s pick-up", { name: k.name });
    };
    const what = (e: EventRow, o: Occ) => `${lbl(e)}${o ? ` (${h.when(o.occurrence_start, e.all_day)})` : ""}`;
    const v = (e: EventRow, o: Occ) => ({ name: actor.name, what: what(e, o) });
    const note = (kind: Kind, text: string, line: string) => out.push({ to: r.profile_id!, locale: h.locale, actor: actor.name, kind, text, line, url });
    const say = {
      assigned: (e: EventRow, o: Occ) => note("assigned", t("{name} is counting on you for {what}.", v(e, o)), what(e, o)),
      going: (e: EventRow, o: Occ) => note("going", t("{name} is going: {what}.", v(e, o)), what(e, o)),
      cant: (e: EventRow, o: Occ) => note("cant", t("Heads up: {name} can't make it to {what}.", v(e, o)), what(e, o)),
      cancelled: (e: EventRow, o: Occ) => note("cancelled", t("Heads up: {name} cancelled {what}.", v(e, o)), what(e, o)),
    };

    // Created.
    if (!before && after) {
      if (!ox) continue;
      if (after.care) {
        if (after.responsible_member_id === r.id) say.assigned(after, ox);
        else if (after.responsible_member_id === actor.id) say.going(after, ox);
      } else if (after.responsible_member_id === r.id) say.assigned(after, ox);
      else if (after.for_member_id === r.id && soon(ox, 7 * 24)) note("added_you", t("{name} added something for you: {what}.", v(after, ox)), what(after, ox));
      else if (isKid(after.for_member_id)) {
        note("added_kid", t("{name} added something for {kid}: {what}.", { ...v(after, ox), kid: h.kid(after.for_member_id)!.name }), what(after, ox));
      } else if (!after.responsible_member_id && !after.for_member_id && dayKey(ox.occurrence_start) <= dayKey(addDays(ctx.now, 1))) {
        note("added", t("{name} added to the calendar: {what}.", v(after, ox)), what(after, ox));
      }
      continue;
    }

    // Deleted.
    if (before && !after) {
      if (!ob) continue;
      if (before.care && before.responsible_member_id === actor.id) {
        if (!appCare) say.cant(before, ob);
      } else if (before.responsible_member_id === r.id || before.for_member_id === r.id || (isKid(before.for_member_id) && !before.care) || (concerns(before) && near(ob))) {
        say.cancelled(before, ob);
      }
      continue;
    }

    // Changed.
    const b = before!;
    const x = after!;
    if (!ob && !ox) continue; // in the past
    if (b.responsible_member_id !== x.responsible_member_id) {
      if (x.responsible_member_id === r.id) say.assigned(x, ox);
      else if (x.care && x.responsible_member_id === actor.id) {
        say.going(x, ox);
      } else if (x.care && b.responsible_member_id === actor.id) {
        if (!appCare) say.cant(x, ox);
      } else if (b.responsible_member_id === r.id && x.responsible_member_id === actor.id) {
        note("took_over", t("Good news: {name} is taking {what} off your hands.", v(x, ox ?? ob)), what(x, ox ?? ob));
      } else if (b.responsible_member_id === r.id) {
        note("removed", t("{name} took you off {what}.", v(x, ox ?? ob)), what(x, ox ?? ob));
      }
      continue;
    }

    const relevant = x.responsible_member_id === r.id || (concerns(x) && (near(ob) || near(ox)));
    const moved = ob?.occurrence_start !== ox?.occurrence_start || ob?.occurrence_end !== ox?.occurrence_end || b.all_day !== x.all_day;
    if (relevant && moved && ob && ox) {
      const from = h.when(ob.occurrence_start, b.all_day);
      const to = h.when(ox.occurrence_start, x.all_day);
      note("moved", t("{name} moved {what}: {from} → {to}.", { name: actor.name, what: lbl(x), from, to }), `${lbl(x)} · ${from} → ${to}`);
    } else if (relevant && moved && ob && !ox) {
      say.cancelled(b, ob);
    } else if (relevant && (moved || b.recurrence !== x.recurrence || b.recurrence_until !== x.recurrence_until)) {
      note("changed", t("{name} changed {what}.", v(x, ox)), what(x, ox));
    } else if (relevant && (b.location ?? "") !== (x.location ?? "") && x.location) {
      note("place", t("{name} changed where {what} happens: {place}.", { ...v(x, ox), place: x.location }), `${lbl(x)} · ${x.location}`);
    }

    // Dates taken out of a series. A one-off put in their place is told on its own.
    const today = dayKey(ctx.now);
    for (const day of (x.skip_dates ?? []).filter((d) => d >= today && !(b.skip_dates ?? []).includes(d))) {
      const occ = occOn(x, day);
      if (!occ || (await hasReplacement(ctx, x, day))) continue;
      if (x.care && x.responsible_member_id === actor.id) {
        if (!appCare) say.cant(x, occ);
      } else if (x.responsible_member_id === r.id || (concerns(x) && near(occ))) {
        say.cancelled(x, occ);
      }
    }
  }
  return out;
}

function itemNotes(ctx: Ctx, row: Activity): Note[] {
  const actor = ctx.members.find((m) => m.profile_id && m.profile_id === row.actor);
  const before = row.before as ItemRow | null;
  const item = row.after as ItemRow | null;
  if (!actor || !item || item.done || !ctx.todoLists.has(item.list_id)) return [];
  const r = ctx.members.find((m) => m.id === item.assignee_member_id);
  if (!r?.profile_id || r.id === actor.id) return [];

  const h = helpers(ctx, r);
  const today = dayKey(ctx.now);
  const tomorrow = dayKey(addDays(startOfDay(ctx.now), 1));
  const due = (d: string) => (d === today ? h.t("today") : d === tomorrow ? h.t("tomorrow") : fmtDay(d, h.locale));
  const what = `${item.title}${item.due_date ? ` (${due(item.due_date)})` : ""}`;
  const note = (kind: Kind, text: string): Note[] => [{ to: r.profile_id!, locale: h.locale, actor: actor.name, kind, text, line: what, url: "/todo" }];

  if (before?.assignee_member_id !== r.id) return note("todo", h.t("{name} is counting on you for a to-do: {what}.", { name: actor.name, what }));
  if (item.due_date && item.due_date !== before.due_date && item.due_date <= tomorrow) {
    return note("todo_due", h.t("{name} moved the due date of {what}.", { name: actor.name, what }));
  }
  return [];
}

// "I can't" from the Kids tab, when nobody else is going.
async function answerNotes(ctx: Ctx, row: Activity): Promise<Note[]> {
  const before = row.before as Answer | null;
  const answer = row.after as Answer | null;
  if (!answer || answer.available || before?.available === false) return [];
  const actor = ctx.members.find((m) => m.id === answer.member_id && m.profile_id);
  const kid = ctx.members.find((m) => m.id === answer.kid_id && !m.profile_id);
  if (!actor || !kid) return [];

  const from = new Date(`${answer.day}T00:00:00`);
  const { data } = await ctx.db.from("events").select("*").eq("family_id", answer.family_id).eq("for_member_id", kid.id).eq("care", answer.kind);
  const slot = expand((data ?? []) as EventRow[], from, addDays(from, 1)).find((o) => dayKey(o.occurrence_start) === answer.day);
  if (slot?.responsible_member_id && slot.responsible_member_id !== actor.id) return [];
  if (new Date(slot?.occurrence_start ?? `${answer.day}T${usualTime(kid, answer.kind)}:00`) < ctx.now) return [];

  return ctx.members
    .filter((r) => r.profile_id && r.id !== actor.id)
    .map((r) => {
      const h = helpers(ctx, r);
      const start = slot?.occurrence_start ?? new Date(`${answer.day}T${usualTime(kid, answer.kind)}:00`).toISOString();
      const what = `${answer.kind === "dropoff" ? h.t("{name}'s drop-off", { name: kid.name }) : h.t("{name}'s pick-up", { name: kid.name })} (${h.when(start, false)})`;
      return { to: r.profile_id!, locale: h.locale, actor: actor.name, kind: "cant" as const, text: h.t("Heads up: {name} can't make it to {what}.", { name: actor.name, what }), line: what, url: "/kids/preschool" };
    });
}

const fmtDay = (d: string, locale: Locale) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(BCP47[locale], { timeZone: "Europe/Stockholm", weekday: "short", day: "numeric", month: "short" });
