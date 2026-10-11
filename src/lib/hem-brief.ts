import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callTool } from "@/lib/mcp/call-tool";
import type { McpContext } from "@/lib/mcp/context";
import { utcToStockholm } from "@/lib/mcp/time";
import { CARE_KINDS, isCareDay } from "@/lib/care";
import { upcomingDeadlines } from "@/lib/papers";
import type { CareAvailability, Member, Paper } from "@/lib/types";

const ymd = (ms: number) => utcToStockholm(new Date(ms).toISOString()).slice(0, 10);

type Ev = { title: string; start: string; all_day: boolean; kind: string | null; responsible: string | null; for_whom: string | null; location: string | null };
type Occ = { who: string; kind: string; next_date: string; in_days: number; years_next_time: number; concerns: string[] };

// "What's up today?": the facts worked out here, in plain sentences, so a small
// model can't misread them (an anniversary as the event itself, a slot nobody
// took as a quiet day). Hem only has to pick what matters and say it.
export async function todayBrief(supabase: SupabaseClient, ctx: McpContext, evening: boolean) {
  const today = ymd(Date.now());
  const tomorrow = ymd(Date.now() + 86400000);
  const focus = evening ? tomorrow : today;
  const days = evening ? [tomorrow] : [today, tomorrow];

  const [eventsJson, occJson, { data: members }, { data: answers }, { data: todos }, { data: papers }] = await Promise.all([
    callTool(ctx, "get_events", { from: today, days: 2 }),
    callTool(ctx, "get_occasions", { days: 7 }),
    supabase.from("members").select("id, name, profile_id, care_days"),
    supabase.from("care_availability").select("kid_id, day, kind, member_id, available").gte("day", today).lte("day", tomorrow),
    supabase.from("list_items").select("title, due_date, lists!inner(kind)").eq("lists.kind", "todo").eq("done", false).order("due_date", { nullsFirst: false }).limit(12),
    supabase.from("papers").select("*").eq("ended", false),
  ]);
  const events = JSON.parse(eventsJson) as Ev[];
  const people = (members ?? []) as Pick<Member, "id" | "name" | "profile_id" | "care_days">[];
  const name = (id: string) => people.find((m) => m.id === id)?.name ?? "?";
  const lines: string[] = [];

  const label = (d: string) => (d === today ? "today" : "tomorrow");
  for (const d of days) {
    const list = events.filter((e) => e.start.startsWith(d) && !e.kind);
    lines.push(`Events ${label(d)} (${d}): ${list.length ? list.map((e) => `${e.all_day ? "all day" : e.start.slice(11)} ${e.title}${e.responsible ? ` (${e.responsible})` : ""}`).join("; ") : "none"}.`);
  }

  for (const kid of people.filter((m) => !m.profile_id)) {
    for (const d of days) {
      if (!isCareDay(kid as Member, new Date(`${d}T12:00:00`))) continue;
      for (const kind of CARE_KINDS) {
        const word = kind === "dropoff" ? "drop-off" : "pick-up";
        const ev = events.find((e) => e.kind === kind && e.for_whom === kid.name && e.start.startsWith(d));
        const said = ((answers ?? []) as CareAvailability[]).filter((a) => a.kid_id === kid.id && a.day === d && a.kind === kind);
        const can = said.filter((a) => a.available).map((a) => name(a.member_id));
        const cant = said.filter((a) => !a.available).map((a) => name(a.member_id));
        const who = ev?.responsible
          ? `${ev.responsible} is going at ${ev.start.slice(11)}`
          : `NOBODY has confirmed they are going${can.length ? ` (${can.join(", ")} said they can)` : ""}${cant.length ? ` (${cant.join(", ")} can't)` : ""}`;
        lines.push(`${kid.name}'s preschool ${word} ${label(d)}: ${who}.`);
      }
    }
  }

  const late = (todos ?? []).filter((t) => t.due_date && t.due_date < today);
  const due = (todos ?? []).filter((t) => t.due_date && t.due_date >= today && t.due_date <= tomorrow);
  const open = (todos ?? []).filter((t) => !t.due_date);
  if (late.length) lines.push(`Late to-dos: ${late.map((t) => `${t.title} (was due ${t.due_date})`).join("; ")}.`);
  if (due.length) lines.push(`To-dos due: ${due.map((t) => `${t.title} (${label(t.due_date!)})`).join("; ")}.`);
  if (open.length) lines.push(`Other open to-dos, no date: ${open.map((t) => t.title).join("; ")}.`);

  for (const o of JSON.parse(occJson) as Occ[]) {
    const when = o.in_days === 0 ? "today" : o.in_days === 1 ? "tomorrow" : `in ${o.in_days} days (${o.next_date})`;
    lines.push(
      o.kind === "birthday"
        ? `${o.who}'s birthday ${when}: turns ${o.years_next_time}. Remember to wish it.`
        : `${o.who}: ${o.years_next_time}-year anniversary ${when} (a yearly date to remember, the ${o.kind} itself was ${o.years_next_time} years ago).`,
    );
  }

  for (const d of upcomingDeadlines((papers ?? []) as Paper[], 14, today)) {
    const what = { cancel: "last day to cancel or renegotiate", renew: "renews", expires: "expires", warranty: "warranty ends" }[d.kind];
    lines.push(`Paper: ${d.paper.title} ${what} on ${d.date} (in ${d.days} days).`);
  }

  return { focus, text: lines.join("\n") };
}

// Tonight's dinner: what was eaten lately and the saved recipes. Purchases and
// lists are left out on purpose: the family doesn't log everything it buys.
export async function dinnerData(supabase: SupabaseClient, ctx: McpContext) {
  const [meals, { data: recipes }] = await Promise.all([
    callTool(ctx, "get_meals", { days: 14 }),
    supabase.from("recipes").select("title, tags, favorite, kid_friendly, prep_minutes").order("favorite", { ascending: false }).limit(40),
  ]);
  return `## meals of the last 14 days\n${meals}\n\n## saved recipes\n${JSON.stringify(recipes ?? [])}`;
}
