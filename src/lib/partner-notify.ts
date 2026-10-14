import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { careTitle } from "./care";
import { addDays, dayKey, startOfDay } from "./dates";
import { expand } from "./events";
import { BCP47, isLocale, translator, type Locale } from "./i18n";
import { sendPush } from "@/lib/push";
import type { CalendarEvent, ListItem, Member } from "./types";

// What the other parent hears about a change (docs/notifications.md):
// only what concerns them, now; nothing about what they did themselves.
// Rows come from `activity` (supabase/migrations/0029_partner_notifications.sql).
// Callers pin process.env.TZ to Europe/Stockholm: day maths uses local time.

type EventRow = CalendarEvent & { family_id: string; updated_by?: string | null };
type ItemRow = ListItem & { family_id: string };
type Activity = {
  id: number;
  family_id: string;
  table_name: "events" | "list_items";
  row_id: string;
  actor: string | null;
  via_app: boolean;
  before: EventRow | ItemRow | null;
  after: EventRow | ItemRow | null;
};

type Kind = "assigned" | "took_over" | "removed" | "going" | "cant" | "added_you" | "added_kid" | "added" | "moved" | "changed" | "place" | "cancelled" | "todo" | "todo_due";
const ICON: Record<Kind, string> = {
  assigned: "👉", took_over: "🔁", removed: "↩️", going: "✅", cant: "⚠️", added_you: "➕", added_kid: "➕", added: "➕",
  moved: "🕑", changed: "✏️", place: "📍", cancelled: "❌", todo: "👉", todo_due: "🕑",
};

type Note = { to: string; locale: Locale; actor: string; kind: Kind; title: string; body: string; url: string; urgent: boolean };

const HOUR = 3600000;
const QUIET_FROM = 21;
const QUIET_UNTIL = 7;

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

  const quiet = now.getHours() >= QUIET_FROM || now.getHours() < QUIET_UNTIL;
  const morning = new Date(now);
  if (now.getHours() >= QUIET_UNTIL) morning.setDate(morning.getDate() + 1);
  morning.setHours(QUIET_UNTIL, 0, 0, 0);

  const notes: Note[] = [];
  for (const familyId of new Set(rows.map((r) => r.family_id))) {
    const mine = rows.filter((r) => r.family_id === familyId);
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
    for (const row of mine) {
      const found = row.table_name === "events" ? await eventNotes(ctx, row) : itemNotes(ctx, row);
      // At night, only what happens in the next hours; the rest waits for the morning.
      if (quiet && found.length && !found.some((n) => n.urgent)) {
        const { error: deferError } = await db.from("activity").update({ sent_at: null, due_at: morning.toISOString() }).eq("id", row.id);
        if (!deferError) continue; // a newer change to the same row is already queued: send this one now
      }
      notes.push(...found);
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
      title: group.length === 1 ? first.title : t("{name} made {count} changes", { name: first.actor, count: group.length }),
      body: group.length === 1 ? first.body : group.slice(0, 5).map((n) => `${ICON[n.kind]} ${n.body}`).join("\n"),
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
  const near = (o: { occurrence_start: string } | null) => !!o && new Date(o.occurrence_start).getTime() < ctx.now.getTime() + 48 * HOUR;
  const soonAs = (o: { occurrence_start: string } | null, h: number) => !!o && new Date(o.occurrence_start).getTime() < ctx.now.getTime() + h * HOUR;
  const isKid = (id: string | null | undefined) => ctx.members.some((m) => m.id === id && !m.profile_id);
  // In the app, the Kids tab already says "I'm going" / "I can't" itself.
  const appCare = !!ev.care && row.via_app;
  const url = ev.care ? "/kids/preschool" : "/calendar";

  const out: Note[] = [];
  for (const r of ctx.members.filter((m) => m.profile_id && m.id !== actor.id)) {
    const h = helpers(ctx, r);
    const concerns = (e: EventRow) => e.responsible_member_id === r.id || e.for_member_id === r.id || isKid(e.for_member_id) || (!e.responsible_member_id && !e.for_member_id);
    const note = (kind: Kind, title: string, body: string, occ: { occurrence_start: string } | null) => {
      out.push({ to: r.profile_id!, locale: h.locale, actor: actor.name, kind, title, body, url, urgent: soonAs(occ, 14) });
    };
    const line = (e: EventRow, o: { occurrence_start: string } | null) => `${h.label(e)}${o ? ` · ${h.when(o.occurrence_start, e.all_day)}` : ""}`;
    const name = { name: actor.name };

    // Created.
    if (!before && after) {
      if (!ox) continue;
      if (after.care) {
        if (after.responsible_member_id === r.id) note("assigned", h.t("{name} gave you something to do", name), line(after, ox), ox);
        else if (after.responsible_member_id === actor.id && !appCare) note("going", h.t("{name} is going", name), line(after, ox), ox);
      } else if (after.responsible_member_id === r.id) note("assigned", h.t("{name} gave you something to do", name), line(after, ox), ox);
      else if (after.for_member_id === r.id && soonAs(ox, 7 * 24)) note("added_you", h.t("{name} added for you", name), line(after, ox), ox);
      else if (isKid(after.for_member_id)) note("added_kid", h.t("{name} added for {kid}", { ...name, kid: h.kid(after.for_member_id)!.name }), line(after, ox), ox);
      else if (!after.responsible_member_id && !after.for_member_id && dayKey(ox.occurrence_start) <= dayKey(addDays(ctx.now, 1))) {
        note("added", h.t("{name} added to the calendar", name), line(after, ox), ox);
      }
      continue;
    }

    // Deleted.
    if (before && !after) {
      if (!ob) continue;
      if (before.care && before.responsible_member_id === actor.id) {
        if (!appCare) note("cant", `⚠️ ${h.t("{name} can't make it", name)}`, line(before, ob), ob);
      } else if (before.responsible_member_id === r.id || before.for_member_id === r.id || (isKid(before.for_member_id) && !before.care) || (concerns(before) && near(ob))) {
        note("cancelled", `❌ ${h.t("{name} cancelled", name)}`, line(before, ob), ob);
      }
      continue;
    }

    // Changed.
    const b = before!;
    const x = after!;
    if (!ob && !ox) continue; // in the past
    if (b.responsible_member_id !== x.responsible_member_id) {
      if (x.responsible_member_id === r.id) note("assigned", h.t("{name} gave you something to do", name), line(x, ox), ox);
      else if (x.care && x.responsible_member_id === actor.id) {
        if (!appCare) note("going", h.t("{name} is going", name), line(x, ox), ox);
      } else if (x.care && b.responsible_member_id === actor.id) {
        if (!appCare) note("cant", `⚠️ ${h.t("{name} can't make it", name)}`, line(x, ox), ox);
      } else if (b.responsible_member_id === r.id) {
        note(
          x.responsible_member_id === actor.id ? "took_over" : "removed",
          x.responsible_member_id === actor.id ? h.t("{name} is taking over", name) : h.t("{name} took you off this", name),
          line(x, ox ?? ob),
          ox ?? ob,
        );
      }
      continue;
    }

    const relevant = x.responsible_member_id === r.id || (concerns(x) && (near(ob) || near(ox)));
    const moved = ob?.occurrence_start !== ox?.occurrence_start || ob?.occurrence_end !== ox?.occurrence_end || b.all_day !== x.all_day;
    if (relevant && moved && ob && ox) {
      note("moved", `🕑 ${h.t("{name} moved", name)}`, `${h.label(x)} · ${h.when(ob.occurrence_start, b.all_day)} → ${h.when(ox.occurrence_start, x.all_day)}`, near(ob) ? ob : ox);
    } else if (relevant && moved && ob && !ox) {
      note("cancelled", `❌ ${h.t("{name} cancelled", name)}`, line(b, ob), ob);
    } else if (relevant && (moved || b.recurrence !== x.recurrence || b.recurrence_until !== x.recurrence_until)) {
      note("changed", h.t("{name} changed", name), line(x, ox), ox);
    } else if (relevant && (b.location ?? "") !== (x.location ?? "") && x.location) {
      note("place", h.t("{name} changed the place", name), `${h.label(x)} · ${x.location}`, ox);
    }

    // Dates taken out of a series. A one-off put in their place is told on its own.
    const today = dayKey(ctx.now);
    for (const day of (x.skip_dates ?? []).filter((d) => d >= today && !(b.skip_dates ?? []).includes(d))) {
      const occ = occOn(x, day);
      if (!occ || (await hasReplacement(ctx, x, day))) continue;
      if (x.care && x.responsible_member_id === actor.id) {
        if (!appCare) note("cant", `⚠️ ${h.t("{name} can't make it", name)}`, line(x, occ), occ);
      } else if (x.responsible_member_id === r.id || (concerns(x) && near(occ))) {
        note("cancelled", `❌ ${h.t("{name} cancelled", name)}`, line(x, occ), occ);
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
  const due = (d: string) =>
    d < today ? `⚠️ ${fmtDay(d, h.locale)}` : d === today ? h.t("Today") : d === tomorrow ? h.t("Tomorrow") : fmtDay(d, h.locale);
  const body = `${item.title}${item.due_date ? ` · ${due(item.due_date)}` : ""}`;
  const urgent = !!item.due_date && item.due_date <= today;

  let n: Note | null = null;
  if (before?.assignee_member_id !== r.id) {
    n = { to: r.profile_id, locale: h.locale, actor: actor.name, kind: "todo", title: h.t("{name} gave you a to-do", { name: actor.name }), body, url: "/todo", urgent };
  } else if (item.due_date && item.due_date !== before.due_date && item.due_date <= tomorrow) {
    n = { to: r.profile_id, locale: h.locale, actor: actor.name, kind: "todo_due", title: h.t("{name} changed the due date", { name: actor.name }), body, url: "/todo", urgent };
  }
  return n ? [n] : [];
}

const fmtDay = (d: string, locale: Locale) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(BCP47[locale], { timeZone: "Europe/Stockholm", weekday: "short", day: "numeric", month: "short" });
