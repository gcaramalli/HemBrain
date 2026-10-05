import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcpContext, type McpContext } from "./context";
import { categoryById, categoryOrder, guessCategory } from "@/lib/categories";
import { familyBirthdays } from "@/lib/occasions";
import { countryName, findCountry } from "@/lib/countries";
import { occurrenceDates, RECURRENCES, type Recurrence } from "@/lib/recurrence";
import { stockholmToUtc, utcToStockholm } from "./time";
import { FOOD_GROUP_IDS, groupCounts } from "@/lib/meals";
import { ageInMonths } from "@/lib/dates";
import { avgClock, minutesBetween, nightDay, sleepDays, sleepState } from "@/lib/sleep";
import { CLOTHES_CATEGORIES, CLOTHES_CATEGORY_IDS, coldSeason, missingEssentials, probablyTooSmall } from "@/lib/wardrobe";
import { findByName, HISTORY_DAYS, meetingAgenda, nextMeetingDate, peopleSummary, personItems, sortItems } from "@/lib/work";
import { isEqual, settleUp } from "@/lib/expenses";
import { deadlines, nextRenewal, PAPER_CATEGORIES, PAPER_CATEGORY_IDS, PERIOD_IDS, upcomingDeadlines, yearlyCost } from "@/lib/papers";
import type { KidClothes, KidSleep, Paper, WorkItem, WorkMeeting, WorkPerson, WorkProject } from "@/lib/types";

// Tools exposed to Claude through the family connector. Every query is
// scoped to the caller's family (see ./context.ts) because the service-role
// client bypasses RLS.

export function buildInstructions(ctx: McpContext) {
  const who = ctx.speaker
    ? `The person talking to you is ${ctx.speaker}${ctx.familyName ? ` (family "${ctx.familyName}")` : ""}. "I" / "me" = ${ctx.speaker}.`
    : "Ask who is talking if it matters (e.g. for who is responsible).";
  return `Hembrain: a family's shared calendar, lists, recipes and notes. Times are Europe/Stockholm unless told otherwise.
In this family the assistant behind Hembrain is called Hem. When the user talks to or about Hem ("Hem, add milk",
"ask Hem when Charlie should sleep", "tell Hem we paid the plumber", "what does Hem know about…") or about Hembrain,
they mean this connector: answer with its tools, never from memory or another app. Speak as Hem in your confirmations
("I've added…"), short and warm; you remain the AI model you are if asked what you are.
${who}
Routing:
- Calendar (appointments, who drops off / picks up the kids, trips, birthdays): get_events / add_event / update_event / delete_event.
  Pass times as local time (YYYY-MM-DDTHH:MM). Set "responsible" (who does it) and "for_whom" (who it is about) by first name.
  Check get_events for that day first to avoid duplicates. Only delete when explicitly asked.
  Drop-offs and pick-ups of a child: set kind "dropoff"/"pickup" (they show in the app's Kids tab); the child's usual
  times are in get_family_context. To change one day of a repeating event ("this Friday Jenny picks up"), pass only_date.
- Shopping and to-dos: add_to_list / check_off / get_list. Default list is the first shopping list.
- "We bought X" outside the list: log_purchase (feeds the "running out soon" prediction).
- Recipes: search_recipes / add_recipe. "What should we cook tonight?": dinner_ideas, then suggest 2-3 options
  (prefer favourites and recipes whose ingredients were bought recently, avoid what was eaten in the last days,
  and balance the week: fill the food groups it lacks, e.g. fish, legumes, vegetables) and offer to add missing ingredients.
- "We had salmon and potatoes tonight": log_meal (one call per meal; set food_groups yourself from what was on the
  plate; "yesterday lunch" → date + slot). "What did we eat this week?" / "is it balanced?": get_meals.
- "What should we buy this week?" / "plan the week's meals": plan_groceries (eating habits, what runs out, what is already
  on the list), check get_events for the week (trips, dinners out), then propose a few dinners that balance recent weeks
  and the items to buy. Add to the shopping list only after they agree (add_to_list, skip what is already on it).
- Receipt photo: read every line, then log_receipt with store, date and items. Use the family's usual item
  names (see get_list / get_restock_suggestions) rather than raw receipt abbreviations, e.g. "Mellanmjölk 1,5%" → "Milk".
- The kid's sleep ("Charlie fell asleep at 13:10", "slept 19:30 to 6:45, woke twice"): log_sleep. "When should he go to bed
  tonight?" / "how is he sleeping?": get_kid_sleep, then answer from the last days (wake-up time, nap length and end,
  awake time since the last nap, wakings) and the usual needs for the kid's age; give a concrete time and say why.
- The kid's clothes and sizes ("his shoe size is now 24", "we need rain trousers", "what does he need for winter?"):
  get_wardrobe / update_wardrobe. Suggest what's missing for the season in Sweden (preschool is outdoors in all weather).
- What the kid ate and how it went ("Charlie refused the fish"): log_meal with who = the kid and reaction. Ideas for the
  kid's meals: get_meals with who = the kid (loves / refuses) and suggest what fits their age and balances their week.
- Family facts (pickup rules, allergies, contacts): get_notes / add_note.
- Travels ("we went to Lisbon in July with Jennie", "Jenny has been to Japan", "where haven't we been?", "when did I
  last go to London?", trip ideas): get_travels (countries per person + the trips timeline). A dated trip → add_trips
  (ticks the country for everyone who went); a country with no date → add_countries. Pass countries as ISO codes or names.
- "Send Jennie a little heart": send_gift (an emoji + optional short note, unwrapped in the app).
- Birthdays of the family's own members (parents, kids): set_birthdate (they show in the calendar and the others are
  reminded the evening before). Weddings, friends' and relatives' birthdays, anniversaries: get_occasions / add_occasion. These are kept out of
  the calendar on purpose (only the family's own dates show there); the app reminds the right people the evening before.
- The speaker's own WORK (colleagues, work projects, meetings, "tell Karim to…", "discuss X with my boss"): get_work /
  add_work_items / update_work_item / set_work_entry. Private to the speaker: never mix it with family lists or notes, and
  don't bring it up unless asked. File each item yourself: who it's for (person), which project, which recurring meeting,
  and the kind (todo = I do it, give = hand it to the person, discuss = bring it up with them). Call get_work first to
  know the people, projects and meetings; if a name is new, ask before creating it with set_work_entry.
  The speaker's own to-do = kind todo (with or without person/project); "urgent", "priority", "first thing" → priority.
  "Done in the Tuesday meeting: gave X to Karim" → update_work_item status "waiting" (handed over) or "done".
  "For next week's team meeting: talk about X" → add_work_items with meeting + next_time. Tasks assigned during a meeting →
  one item per person, kind give, already_handed_over. Recaps ("what's not done, who delivered?"): get_work with
  include_done, then a table per person from summary_by_person and the items. Use people's and projects' notes to route
  things ("the budget point" → whoever owns the budget); when the user tells you who does what, save it in notes.
- Papers (contracts, insurance, warranties, IDs; "file this policy", "when can we cancel the electricity contract?",
  "is Charlie insured?"): get_papers / add_paper / update_paper. From a PDF or photo, read it and fill every field you can,
  dates and amounts only from the document; ask whether it's the family's or private when it's clearly personal (own work
  contract, pension). Review ("what do we pay too much?", "check our insurance"): get_papers with review, then point out
  cover paid twice (e.g. travel or accident cover already inside the home insurance), gaps for the household (e.g. a child
  insurance for each kid), contracts to renegotiate or cancel before their last day, and the yearly total; give concrete
  next steps, say it's not a broker's advice, and search the web for current prices only if the user asks to compare.
- Shared expenses ("I paid 89 kr for toilet paper", "Jenny paid the plumber 1 200", "who owes whom?", "Jenny paid me
  back"): add_expense (paid_by defaults to the speaker, split equally between the adults unless told otherwise; a
  payback is settlement = true) / get_expenses (the balance and recent expenses). Not for groceries' restock log
  (log_purchase) unless someone also wants to split it.
Call get_family_context first if you don't know the lists or people. After writing, tell the user exactly what you added and where.`;
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

function familyId() {
  const ctx = mcpContext.getStore();
  if (!ctx) throw new Error("No family context for this request");
  return ctx.familyId;
}

// Work tools act on the speaker's private work space only: they need a
// personal link (the legacy family token has no owner).
function ownerId() {
  const id = mcpContext.getStore()?.profileId;
  if (!id) throw new Error("The work space needs a personal connector link (Me → Reminders & AI).");
  return id;
}

async function loadWork() {
  const db = createAdminClient();
  const owner = ownerId();
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
  const [p, pr, m, i, d] = await Promise.all([
    db.from("work_people").select("id, name, role, notes, created_at").eq("profile_id", owner).order("name"),
    db.from("work_projects").select("id, name, person_ids, archived, notes, created_at").eq("profile_id", owner).order("name"),
    db.from("work_meetings").select("id, name, weekday, person_ids, created_at").eq("profile_id", owner).order("name"),
    db.from("work_items").select("*").eq("profile_id", owner).neq("status", "done").order("created_at"),
    db.from("work_items").select("*").eq("profile_id", owner).eq("status", "done").gte("done_at", since).order("done_at", { ascending: false }),
  ]);
  const error = p.error ?? pr.error ?? m.error ?? i.error ?? d.error;
  if (error) throw new Error(error.message);
  return {
    people: (p.data ?? []) as WorkPerson[],
    projects: (pr.data ?? []) as WorkProject[],
    meetings: (m.data ?? []) as WorkMeeting[],
    items: sortItems((i.data ?? []) as WorkItem[]), // open + waiting, priority first
    done: (d.data ?? []) as WorkItem[], // finished in the last HISTORY_DAYS
  };
}

type Work = Awaited<ReturnType<typeof loadWork>>;

// Name → id; "" clears (null), undefined leaves it unchanged.
function workRef(rows: { id: string; name: string }[], name: string | undefined, what: string) {
  if (name === undefined) return undefined;
  if (!name.trim()) return null;
  const hit = findByName(rows, name);
  if (!hit) throw new Error(`No ${what} called "${name}". Known: ${rows.map((r) => r.name).join(", ") || "none"}. Ask before creating it with set_work_entry.`);
  return hit.id;
}

function findWork<T extends { name: string }>(rows: T[], name: string, what: string) {
  const hit = findByName(rows, name);
  if (!hit) throw new Error(`No ${what} called "${name}". Known: ${rows.map((r) => r.name).join(", ") || "none"}`);
  return hit;
}

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function workItemOut(i: WorkItem, w: Work) {
  const name = (rows: { id: string; name: string }[], id: string | null) => rows.find((r) => r.id === id)?.name ?? null;
  return {
    id: i.id,
    title: i.title,
    kind: i.kind,
    status: i.status,
    priority: i.priority || undefined,
    person: name(w.people, i.person_id),
    project: name(w.projects, i.project_id),
    meeting: name(w.meetings, i.meeting_id),
    due: i.due_date,
    late: (i.status !== "done" && !!i.due_date && i.due_date < workToday()) || undefined,
    not_before: i.not_before,
    waiting_since: i.waiting_since?.slice(0, 10) ?? null,
    done_on: i.done_at?.slice(0, 10) ?? null,
  };
}

const workToday = () => utcToStockholm(new Date().toISOString()).slice(0, 10);

// Recently done items, optionally only since a date (YYYY-MM-DD).
const doneSince = (w: Work, since?: string) => (since ? w.done.filter((i) => (i.done_at ?? "") >= since) : w.done);

// Who is talking, stored as created_by so the app can show "added by …".
function createdBy() {
  return mcpContext.getStore()?.profileId ?? null;
}

// Category last used for this item in the family, else a keyword guess.
async function categoryFor(title: string) {
  const { data } = await createAdminClient()
    .from("list_items")
    .select("category")
    .eq("family_id", familyId())
    .ilike("title", title.trim())
    .not("category", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.category ?? guessCategory(title);
}

const recurrenceIds = RECURRENCES.map((r) => r.id) as [Recurrence, ...Recurrence[]];

async function resolveList(name?: string) {
  const db = createAdminClient();
  const { data: lists, error } = await db.from("lists").select("id, name, kind").eq("family_id", familyId()).order("position");
  if (error) throw new Error(error.message);
  if (!lists?.length) throw new Error("This family has no lists yet.");
  if (name) {
    const n = name.trim().toLowerCase();
    const match = lists.find((l) => l.name.toLowerCase() === n) ?? lists.find((l) => l.name.toLowerCase().includes(n));
    if (!match) throw new Error(`No list called "${name}". Lists: ${lists.map((l) => l.name).join(", ")}`);
    return match;
  }
  return lists.find((l) => l.kind === "grocery") ?? lists[0];
}

async function memberIdByName(name?: string | null) {
  if (!name) return null;
  const { data } = await createAdminClient().from("members").select("id, name").eq("family_id", familyId());
  const n = name.trim().toLowerCase();
  const m = (data ?? []).find((x) => x.name.toLowerCase() === n) ?? (data ?? []).find((x) => x.name.toLowerCase().startsWith(n));
  if (!m) throw new Error(`Unknown family member "${name}". Members: ${(data ?? []).map((x) => x.name).join(", ")}`);
  return m.id;
}

// A kid by first name; with only one kid in the family, the name is optional.
async function kidByName(name?: string) {
  const { data } = await createAdminClient()
    .from("members")
    .select("id, name, birthdate, clothing_size, shoe_size, sizes_updated_on")
    .eq("family_id", familyId())
    .is("profile_id", null)
    .order("created_at");
  const kids = data ?? [];
  if (!kids.length) throw new Error("This family has no kids.");
  if (!name) {
    if (kids.length === 1) return kids[0];
    throw new Error(`Which kid? ${kids.map((k) => k.name).join(", ")}`);
  }
  const n = name.trim().toLowerCase();
  const kid = kids.find((k) => k.name.toLowerCase() === n) ?? kids.find((k) => k.name.toLowerCase().startsWith(n));
  if (!kid) throw new Error(`No kid called "${name}". Kids: ${kids.map((k) => k.name).join(", ")}`);
  return kid;
}

const stockholmDay = (iso: string) => utcToStockholm(iso).slice(0, 10);
const stockholmClock = (iso: string) => utcToStockholm(iso).slice(11, 16);
const stockholmMinutes = (iso: string) => {
  const [h, m] = stockholmClock(iso).split(":").map(Number);
  return h * 60 + m;
};

const eventFields = {
  title: z.string().min(1).optional(),
  start: z.string().optional().describe("Local Stockholm time: YYYY-MM-DDTHH:MM, or YYYY-MM-DD for all-day"),
  end: z.string().optional().describe("Local Stockholm time, optional"),
  all_day: z.boolean().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  responsible: z.string().optional().describe("First name of who does it, e.g. 'Jenny'"),
  for_whom: z.string().optional().describe("First name of who it is about, e.g. 'Charlie'"),
  repeats: z.enum(recurrenceIds).optional().describe("Repeat the event: daily, weekdays (Mon-Fri), weekly, biweekly, monthly"),
  repeat_until: z.string().optional().describe("Last date of the series, YYYY-MM-DD"),
  kind: z.enum(["dropoff", "pickup"]).optional().describe("Set when taking a child to (dropoff) or fetching a child from (pickup) preschool/school"),
};

async function eventRow(e: {
  title?: string;
  start?: string;
  end?: string;
  all_day?: boolean;
  location?: string;
  notes?: string;
  responsible?: string;
  for_whom?: string;
  repeats?: Recurrence;
  repeat_until?: string;
  kind?: "dropoff" | "pickup";
}) {
  const row: Record<string, unknown> = {};
  if (e.title !== undefined) row.title = e.title;
  if (e.all_day !== undefined) row.all_day = e.all_day;
  if (e.start !== undefined) {
    row.starts_at = stockholmToUtc(e.start);
    if (e.all_day === undefined && /^\d{4}-\d{2}-\d{2}$/.test(e.start.trim())) row.all_day = true;
  }
  if (e.end !== undefined) row.ends_at = e.end ? stockholmToUtc(e.end) : null;
  if (e.location !== undefined) row.location = e.location || null;
  if (e.notes !== undefined) row.notes = e.notes || null;
  if (e.responsible !== undefined) row.responsible_member_id = await memberIdByName(e.responsible);
  if (e.for_whom !== undefined) row.for_member_id = await memberIdByName(e.for_whom);
  if (e.repeats !== undefined) row.recurrence = e.repeats;
  if (e.repeat_until !== undefined) row.recurrence_until = e.repeat_until || null;
  if (e.kind !== undefined) row.care = e.kind;
  return row;
}

type EventRecord = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  responsible_member_id: string | null;
  for_member_id: string | null;
  recurrence: string | null;
  care: string | null;
  skip_dates: string[] | null;
};

async function seriesEvent(id: string) {
  const { data, error } = await createAdminClient().from("events").select("*").eq("id", id).eq("family_id", familyId()).maybeSingle<EventRecord>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No event with that id.");
  return data;
}

const duration = (ev: EventRecord) => (ev.ends_at ? new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime() : null);

// A one-off copy of a series' occurrence on `date` (same local time of day).
function occurrenceCopy(ev: EventRecord, date: string): Record<string, unknown> {
  const time = utcToStockholm(ev.starts_at).split(" ")[1];
  const start = stockholmToUtc(`${date}T${time}`);
  const len = duration(ev);
  return {
    family_id: familyId(),
    title: ev.title,
    starts_at: start,
    ends_at: len !== null ? new Date(new Date(start).getTime() + len).toISOString() : null,
    all_day: ev.all_day,
    location: ev.location,
    notes: ev.notes,
    responsible_member_id: ev.responsible_member_id,
    for_member_id: ev.for_member_id,
    care: ev.care,
    created_by: createdBy(),
  };
}

const itemSchema = z.object({
  title: z.string().min(1).describe("Item name, e.g. 'Milk'"),
  quantity: z.string().optional().describe("e.g. '2', '1 kg'"),
});

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_family_context",
    {
      title: "Get family context",
      description: "Hem's view of the family: people, available lists, and pinned notes. Call this first when unsure, or when the user asks Hem something.",
      inputSchema: z.object({}),
    },
    async () => {
      const db = createAdminClient();
      const fid = familyId();
      const [members, lists, notes] = await Promise.all([
        db.from("members").select("name, birthdate, notes, dropoff_time, pickup_time, care_place").eq("family_id", fid).order("created_at"),
        db.from("lists").select("name, kind").eq("family_id", fid).order("position"),
        db.from("notes").select("title, body").eq("family_id", fid).eq("pinned", true),
      ]);
      return text({ members: members.data, lists: lists.data, pinned_notes: notes.data });
    },
  );

  server.registerTool(
    "get_occasions",
    {
      title: "Get weddings and birthdays",
      description:
        "Dates the family celebrates every year (weddings attended, friends' and relatives' birthdays, our own anniversary), with how many years it will be next time and who it concerns. Use 'days' for what's coming up.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(366).optional().describe("Only anniversaries in the next N days; omit for all"),
        search: z.string().optional().describe("Filter by name, e.g. 'Romain'"),
      }),
    },
    async ({ days, search }) => {
      const db = createAdminClient();
      const [{ data: rows, error }, { data: members }] = await Promise.all([
        db.from("occasions").select("id, kind, title, date, ours, member_ids, ended, notes").eq("family_id", familyId()).order("date"),
        db.from("members").select("id, name, birthdate").eq("family_id", familyId()),
      ]);
      if (error) throw new Error(error.message);
      // The family's own birthdays live on members (set_birthdate).
      const all = [...(rows ?? []), ...familyBirthdays(members ?? [])];
      const today = new Date(`${utcToStockholm(new Date().toISOString()).slice(0, 10)}T12:00:00Z`);
      const name = (id: string) => (members ?? []).find((m) => m.id === id)?.name ?? null;
      const out = all
        .filter((o) => !search || o.title.toLowerCase().includes(search.toLowerCase()))
        .map((o) => {
          const [y, m, d] = o.date.split("-").map(Number);
          let next = new Date(Date.UTC(today.getUTCFullYear(), m - 1, d, 12));
          if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, m - 1, d, 12));
          return {
            id: o.id,
            kind: o.kind,
            who: o.title,
            original_date: o.date,
            next_date: next.toISOString().slice(0, 10),
            in_days: Math.round((next.getTime() - today.getTime()) / 86400000),
            years_next_time: next.getUTCFullYear() - y,
            ours: o.ours,
            concerns: o.member_ids.map(name).filter(Boolean),
            no_longer_celebrated: o.ended,
            notes: o.notes,
          };
        })
        .filter((o) => days === undefined || (!o.no_longer_celebrated && o.in_days <= days))
        .sort((a, b) => a.in_days - b.in_days);
      return text(out);
    },
  );

  server.registerTool(
    "set_birthdate",
    {
      title: "Set a family member's date of birth",
      description:
        "Date of birth of someone in the family (a parent or a kid). It shows in the family calendar, the others get a reminder the evening before, and a kid's age drives sleep and clothing advice. Friends and relatives go in add_occasion instead.",
      inputSchema: z.object({
        name: z.string().min(1).describe("First name of the family member"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
      }),
    },
    async ({ name, date }) => {
      const id = await memberIdByName(name);
      if (date > stockholmDay(new Date().toISOString())) throw new Error("A date of birth can't be in the future.");
      const { data, error } = await createAdminClient().from("members").update({ birthdate: date }).eq("id", id).eq("family_id", familyId()).select("name").single();
      if (error) throw new Error(error.message);
      return text(`${data.name}'s date of birth is now ${date}.`);
    },
  );

  server.registerTool(
    "add_occasion",
    {
      title: "Add a wedding or birthday",
      description: "Remember a date the family celebrates every year (a wedding we attended, a friend's child's birthday…). Not for one-off events: use add_event for those.",
      inputSchema: z.object({
        kind: z.enum(["wedding", "birthday", "other"]),
        who: z.string().min(1).describe("e.g. 'Damien & Caroline' or 'Léo (son of Paul)'"),
        date: z.string().describe("The original date YYYY-MM-DD (wedding day, date of birth)"),
        concerns: z.array(z.string()).optional().describe("First names of the family members it concerns / who were there; default everyone"),
        ours: z.boolean().optional().describe("One of the family's own dates (shown in the calendar)"),
        notes: z.string().optional(),
      }),
    },
    async ({ kind, who, date, concerns, ours, notes }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
      const ids = concerns?.length ? (await Promise.all(concerns.map((n) => memberIdByName(n)))).filter((x): x is string => !!x) : [];
      const { data: adults } = await createAdminClient().from("members").select("id").eq("family_id", familyId()).not("profile_id", "is", null);
      const { error } = await createAdminClient()
        .from("occasions")
        .insert({
          family_id: familyId(),
          kind,
          title: who.trim(),
          date,
          ours: ours ?? false,
          member_ids: ids.length ? ids : (adults ?? []).map((a) => a.id),
          notes: notes ?? null,
          created_by: createdBy(),
        });
      if (error) throw new Error(error.message);
      return text({ added: who, kind, date });
    },
  );

  server.registerTool(
    "get_events",
    {
      title: "Get calendar events",
      description: "Family calendar events in a date range (Stockholm time). Returns ids for update_event / delete_event.",
      inputSchema: z.object({
        from: z.string().optional().describe("YYYY-MM-DD, default today"),
        days: z.number().int().min(1).max(92).optional().describe("Default 7"),
      }),
    },
    async ({ from, days }) => {
      const fromYmd = from ?? utcToStockholm(new Date().toISOString()).slice(0, 10);
      const start = stockholmToUtc(fromYmd);
      const end = new Date(new Date(start).getTime() + (days ?? 7) * 86400000).toISOString();
      const toYmd = utcToStockholm(new Date(new Date(end).getTime() - 1).toISOString()).slice(0, 10);
      const db = createAdminClient();
      const [{ data: events, error }, { data: members }] = await Promise.all([
        db
          .from("events")
          .select("id, title, starts_at, ends_at, all_day, location, notes, responsible_member_id, for_member_id, recurrence, recurrence_until, skip_dates, care")
          .eq("family_id", familyId())
          .lt("starts_at", end)
          .or(
            `and(recurrence.is.null,or(starts_at.gte.${start},ends_at.gte.${start})),and(recurrence.not.is.null,or(recurrence_until.is.null,recurrence_until.gte.${fromYmd}))`,
          )
          .order("starts_at"),
        db.from("members").select("id, name").eq("family_id", familyId()),
      ]);
      if (error) throw new Error(error.message);
      const name = (id: string | null) => (members ?? []).find((m) => m.id === id)?.name ?? null;
      const out = [];
      for (const e of events ?? []) {
        const local = utcToStockholm(e.starts_at); // "YYYY-MM-DD HH:MM"
        const [baseDate, time] = local.split(" ");
        const duration = e.ends_at ? new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() : null;
        // A one-off multi-day event that started before the window and is still running.
        const ongoing = !e.recurrence && baseDate < fromYmd ? [baseDate] : [];
        for (const d of [...ongoing, ...occurrenceDates(baseDate, e.recurrence as Recurrence | null, e.recurrence_until, fromYmd, toYmd)]) {
          if ((e.skip_dates ?? []).includes(d)) continue;
          const occ = stockholmToUtc(`${d}T${time}`);
          out.push({
            id: e.id,
            title: e.title,
            start: e.all_day ? d : `${d} ${time}`,
            end: duration !== null ? utcToStockholm(new Date(new Date(occ).getTime() + duration).toISOString()) : null,
            all_day: e.all_day,
            repeats: e.recurrence,
            repeat_until: e.recurrence_until,
            kind: e.care,
            location: e.location,
            notes: e.notes,
            responsible: name(e.responsible_member_id),
            for_whom: name(e.for_member_id),
            _sort: occ,
          });
        }
      }
      out.sort((a, b) => a._sort.localeCompare(b._sort));
      return text(out.map((o) => ({ ...o, _sort: undefined })));
    },
  );

  server.registerTool(
    "add_event",
    {
      title: "Add a calendar event",
      description: "Add an event to the family calendar, e.g. 'Jenny picks up Charlie Thursday 16:00'. Use repeats for routines (e.g. daily preschool drop-off: weekdays).",
      inputSchema: z.object({ ...eventFields, title: z.string().min(1), start: z.string() }),
    },
    async (e) => {
      const row = await eventRow(e);
      const { data, error } = await createAdminClient()
        .from("events")
        .insert({ ...row, family_id: familyId(), created_by: createdBy() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return text({ added: e.title, start: e.start, responsible: e.responsible ?? null, for_whom: e.for_whom ?? null, id: data.id });
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Update a calendar event",
      description:
        "Change an existing event (time, person responsible, place, repetition...). Get the id from get_events. Only pass fields to change. For a repeating event this changes the whole series, unless only_date is given.",
      inputSchema: z.object({
        id: z.string().uuid(),
        only_date: z.string().optional().describe("For a repeating event: change only the occurrence on this date (YYYY-MM-DD), e.g. 'this Thursday Jenny picks up instead'"),
        ...eventFields,
      }),
    },
    async ({ id, only_date, ...e }) => {
      const row = await eventRow(e);
      if (!Object.keys(row).length) return text("Nothing to change.");
      const db = createAdminClient();
      if (only_date) {
        const ev = await seriesEvent(id);
        if (ev.recurrence) {
          const copy: Record<string, unknown> = { ...occurrenceCopy(ev, only_date), ...row, recurrence: null, recurrence_until: null };
          // A new start without a new end keeps the event's length.
          if (row.starts_at && e.end === undefined && ev.ends_at) {
            copy.ends_at = new Date(new Date(row.starts_at as string).getTime() + duration(ev)!).toISOString();
          }
          const { error: skipError } = await db.from("events").update({ skip_dates: [...(ev.skip_dates ?? []), only_date] }).eq("id", id).eq("family_id", familyId());
          if (skipError) throw new Error(skipError.message);
          const { data, error } = await db.from("events").insert(copy).select("id").single();
          if (error) throw new Error(error.message);
          return text({ updated: ev.title, only_date, changes: Object.keys(e), new_event_id: data.id });
        }
      }
      const { data, error } = await db
        .from("events")
        .update(row)
        .eq("id", id)
        .eq("family_id", familyId())
        .select("title")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("No event with that id.");
      return text({ updated: data.title, changes: Object.keys(e) });
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete a calendar event",
      description:
        "Remove an event (for a repeating event: the whole series, unless only_date is given). Only when the user explicitly asks to delete or cancel it.",
      inputSchema: z.object({
        id: z.string().uuid(),
        only_date: z.string().optional().describe("For a repeating event: remove only the occurrence on this date (YYYY-MM-DD)"),
      }),
    },
    async ({ id, only_date }) => {
      const db = createAdminClient();
      if (only_date) {
        const ev = await seriesEvent(id);
        if (ev.recurrence) {
          const { error } = await db.from("events").update({ skip_dates: [...(ev.skip_dates ?? []), only_date] }).eq("id", id).eq("family_id", familyId());
          if (error) throw new Error(error.message);
          return text({ deleted: ev.title, only_date });
        }
      }
      const { data, error } = await db
        .from("events")
        .delete()
        .eq("id", id)
        .eq("family_id", familyId())
        .select("title")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("No event with that id.");
      return text({ deleted: data.title });
    },
  );

  server.registerTool(
    "get_list",
    {
      title: "Get a list",
      description: "Open items of a shopping or to-do list.",
      inputSchema: z.object({
        list: z.string().optional().describe("List name; defaults to the main shopping list"),
        include_done: z.boolean().optional(),
      }),
    },
    async ({ list, include_done }) => {
      const l = await resolveList(list);
      let q = createAdminClient().from("list_items").select("title, quantity, notes, done, due_date, category").eq("list_id", l.id).order("created_at");
      if (!include_done) q = q.eq("done", false);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const items = (data ?? [])
        .sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category))
        .map(({ category, ...i }) => ({ ...i, aisle: l.kind === "grocery" ? categoryById(category).label : undefined }));
      return text({ list: l.name, items });
    },
  );

  server.registerTool(
    "add_to_list",
    {
      title: "Add to list",
      description: "Add one or more items to a shopping or to-do list. Skips items already open on the list.",
      inputSchema: z.object({
        items: z.array(itemSchema).min(1),
        list: z.string().optional().describe("List name; defaults to the main shopping list"),
      }),
    },
    async ({ items, list }) => {
      const db = createAdminClient();
      const l = await resolveList(list);
      const { data: open } = await db.from("list_items").select("title").eq("list_id", l.id).eq("done", false);
      const existing = new Set((open ?? []).map((i) => i.title.trim().toLowerCase()));
      const fresh = items.filter((i) => !existing.has(i.title.trim().toLowerCase()));
      if (fresh.length) {
        const { error } = await db
          .from("list_items")
          .insert(
            await Promise.all(
              fresh.map(async (i) => ({
                family_id: familyId(),
                list_id: l.id,
                title: i.title.trim(),
                quantity: i.quantity ?? null,
                category: l.kind === "grocery" ? await categoryFor(i.title) : null,
                created_by: createdBy(),
              })),
            ),
          );
        if (error) throw new Error(error.message);
      }
      const skipped = items.filter((i) => !fresh.includes(i)).map((i) => i.title);
      return text({ list: l.name, added: fresh.map((i) => i.title), already_on_list: skipped });
    },
  );

  server.registerTool(
    "check_off",
    {
      title: "Check off items",
      description: "Mark items as done/bought. On a shopping list this also records the purchase.",
      inputSchema: z.object({
        titles: z.array(z.string().min(1)).min(1),
        list: z.string().optional(),
      }),
    },
    async ({ titles, list }) => {
      const db = createAdminClient();
      const l = await resolveList(list);
      const { data: open } = await db.from("list_items").select("id, title").eq("list_id", l.id).eq("done", false);
      const wanted = titles.map((t) => t.trim().toLowerCase());
      const hits = (open ?? []).filter((i) => wanted.includes(i.title.trim().toLowerCase()));
      if (hits.length) {
        const { error } = await db
          .from("list_items")
          .update({ done: true, done_at: new Date().toISOString() })
          .in("id", hits.map((h) => h.id));
        if (error) throw new Error(error.message);
      }
      const found = new Set(hits.map((h) => h.title.trim().toLowerCase()));
      return text({ list: l.name, checked: hits.map((h) => h.title), not_found: titles.filter((t) => !found.has(t.trim().toLowerCase())) });
    },
  );

  server.registerTool(
    "log_purchase",
    {
      title: "Log a purchase",
      description: "Record things bought outside the list (e.g. 'I bought toothpaste'), so the app learns how often they are needed.",
      inputSchema: z.object({
        items: z.array(itemSchema).min(1),
        purchased_at: z.string().optional().describe("ISO date/time; defaults to now"),
      }),
    },
    async ({ items, purchased_at }) => {
      const { error } = await createAdminClient()
        .from("purchases")
        .insert(
          items.map((i) => ({
            family_id: familyId(),
            item_name: i.title.trim(),
            quantity: i.quantity ?? null,
            source: "manual",
            created_by: createdBy(),
            ...(purchased_at ? { purchased_at } : {}),
          })),
        );
      if (error) throw new Error(error.message);
      return text({ logged: items.map((i) => i.title) });
    },
  );

  server.registerTool(
    "get_restock_suggestions",
    {
      title: "Running out soon",
      description: "Items the family buys regularly that are probably due soon, based on purchase history.",
      inputSchema: z.object({ within_days: z.number().int().min(0).max(60).optional().describe("Default 7") }),
    },
    async ({ within_days }) => {
      const until = new Date(Date.now() + (within_days ?? 7) * 86400000).toISOString().slice(0, 10);
      const { data, error } = await createAdminClient()
        .from("restock_suggestions")
        .select("item_name, last_bought_at, avg_interval_days, next_due_on")
        .eq("family_id", familyId())
        .lte("next_due_on", until)
        .order("next_due_on");
      if (error) throw new Error(error.message);
      return text(data);
    },
  );

  server.registerTool(
    "search_recipes",
    {
      title: "Search recipes",
      description: "Find family recipes by name, ingredient or tag. Empty query lists them all.",
      inputSchema: z.object({
        query: z.string().optional(),
        favorites_only: z.boolean().optional(),
        kid_friendly_only: z.boolean().optional(),
      }),
    },
    async ({ query, favorites_only, kid_friendly_only }) => {
      let q = createAdminClient()
        .from("recipes")
        .select("title, description, ingredients, steps, tags, prep_minutes, servings, favorite, kid_friendly, source_url")
        .eq("family_id", familyId())
        .order("title");
      if (favorites_only) q = q.eq("favorite", true);
      if (kid_friendly_only) q = q.eq("kid_friendly", true);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const needle = query?.trim().toLowerCase();
      const hits = needle
        ? (data ?? []).filter((r) => [r.title, r.description ?? "", ...r.ingredients, ...r.tags].join(" ").toLowerCase().includes(needle))
        : data;
      return text(hits);
    },
  );

  server.registerTool(
    "add_recipe",
    {
      title: "Add a recipe",
      description: "Save a recipe to the family cookbook.",
      inputSchema: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        ingredients: z.array(z.string()).describe("One ingredient per entry, e.g. '400 g pasta'"),
        steps: z.string().optional(),
        tags: z.array(z.string()).optional(),
        prep_minutes: z.number().int().optional(),
        servings: z.number().int().optional(),
        source_url: z.string().optional(),
        kid_friendly: z.boolean().optional(),
      }),
    },
    async (r) => {
      const { error } = await createAdminClient()
        .from("recipes")
        .insert({ ...r, tags: (r.tags ?? []).map((t) => t.toLowerCase()), family_id: familyId(), created_by: createdBy() });
      if (error) throw new Error(error.message);
      return text(`Saved recipe "${r.title}".`);
    },
  );

  server.registerTool(
    "get_notes",
    {
      title: "Family notes",
      description: "Search the family brain: pickup rules, addresses, allergies, contacts, sizes, codes.",
      inputSchema: z.object({ query: z.string().optional() }),
    },
    async ({ query }) => {
      const { data, error } = await createAdminClient()
        .from("notes")
        .select("title, body, tags, pinned, updated_at")
        .eq("family_id", familyId())
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      const needle = query?.trim().toLowerCase();
      return text(needle ? (data ?? []).filter((n) => `${n.title} ${n.body} ${n.tags.join(" ")}`.toLowerCase().includes(needle)) : data);
    },
  );

  server.registerTool(
    "add_note",
    {
      title: "Add a family note",
      description: "Save a fact worth remembering (e.g. kindergarten address, a doctor's number).",
      inputSchema: z.object({
        title: z.string().min(1),
        body: z.string(),
        tags: z.array(z.string()).optional(),
        pinned: z.boolean().optional(),
      }),
    },
    async (n) => {
      const { error } = await createAdminClient()
        .from("notes")
        .insert({ ...n, tags: (n.tags ?? []).map((t) => t.toLowerCase()), family_id: familyId(), created_by: createdBy() });
      if (error) throw new Error(error.message);
      return text(`Saved note "${n.title}".`);
    },
  );

  server.registerTool(
    "dinner_ideas",
    {
      title: "Dinner ideas",
      description:
        "Recipes to suggest for a meal, ranked by favourites, kid-friendliness and how many ingredients were bought in the last 10 days or are already on the shopping list.",
      inputSchema: z.object({
        max_minutes: z.number().int().optional().describe("Only recipes that take at most this long"),
        kid_friendly_only: z.boolean().optional(),
      }),
    },
    async ({ max_minutes, kid_friendly_only }) => {
      const db = createAdminClient();
      const since = new Date(Date.now() - 10 * 86400000).toISOString();
      const weekAgo = utcToStockholm(new Date(Date.now() - 7 * 86400000).toISOString()).slice(0, 10);
      const [{ data: recipes, error }, { data: bought }, { data: listed }, { data: eaten }] = await Promise.all([
        db.from("recipes").select("id, title, description, ingredients, tags, prep_minutes, favorite, kid_friendly").eq("family_id", familyId()),
        db.from("purchases").select("item_key").eq("family_id", familyId()).gte("purchased_at", since),
        db.from("list_items").select("title").eq("family_id", familyId()).eq("done", false),
        db.from("meals").select("eaten_on, title, recipe_id, food_groups").eq("family_id", familyId()).gte("eaten_on", weekAgo).order("eaten_on"),
      ]);
      if (error) throw new Error(error.message);
      const have = new Set([...(bought ?? []).map((b) => b.item_key), ...(listed ?? []).map((l) => l.title.trim().toLowerCase())]);
      const matches = (ingredient: string) => [...have].some((h) => h.length > 2 && ingredient.toLowerCase().includes(h));
      const ranked = (recipes ?? [])
        .filter((r) => (!max_minutes || !r.prep_minutes || r.prep_minutes <= max_minutes) && (!kid_friendly_only || r.kid_friendly))
        .map(({ id, ...r }) => {
          const inHand = r.ingredients.filter(matches);
          const last = (eaten ?? []).filter((m) => m.recipe_id === id || m.title.toLowerCase() === r.title.toLowerCase()).at(-1);
          return {
            ...r,
            ingredients_in_hand: inHand,
            ingredients_missing: r.ingredients.filter((i: string) => !matches(i)),
            last_eaten_this_week: last?.eaten_on ?? null,
            score: (r.favorite ? 3 : 0) + (r.kid_friendly ? 1 : 0) + inHand.length - (last ? 4 : 0),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      const lastWeek = {
        meals: (eaten ?? []).map((m) => ({ date: m.eaten_on, title: m.title, food_groups: m.food_groups })),
        food_group_counts: groupCounts(eaten ?? []),
      };
      if (!ranked.length) {
        return text({
          note: "No recipes saved yet. Suggest ideas from general knowledge that balance last week, and offer to save the ones they like with add_recipe.",
          last_week: lastWeek,
        });
      }
      return text({ recipes: ranked, last_week: lastWeek });
    },
  );

  server.registerTool(
    "log_meal",
    {
      title: "Log a meal",
      description:
        "Record what the family ate (the meals journal). Used to suggest balanced meals and, later, to anticipate groceries. One call per meal.",
      inputSchema: z.object({
        title: z.string().min(1).describe("What was eaten, e.g. 'Salmon, potatoes and green beans' or a recipe name"),
        date: z.string().optional().describe("YYYY-MM-DD, Stockholm; default today"),
        slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional().describe("Default dinner"),
        food_groups: z
          .array(z.enum(FOOD_GROUP_IDS))
          .optional()
          .describe("What was on the plate: vegetables, fruit, legumes, fish, poultry, red_meat, processed_meat, eggs, dairy, starch (pasta/rice/potatoes/bread), treat (sweets/fried/fast food)"),
        place: z.enum(["home", "out", "takeaway"]).optional().describe("Default home"),
        who: z.array(z.string()).optional().describe("First names of who ate, if not the whole family"),
        recipe: z.string().optional().describe("Name of a saved recipe, if it was one"),
        notes: z.string().optional().describe("e.g. 'too salty'"),
        reaction: z.enum(["loved", "ok", "refused"]).optional().describe("How the kid took it (when a kid ate): loved, ok (ate a bit), refused"),
      }),
    },
    async (m) => {
      const db = createAdminClient();
      const date = m.date ?? utcToStockholm(new Date().toISOString()).slice(0, 10);
      let recipeId: string | null = null;
      const recipeName = (m.recipe ?? m.title).trim();
      const { data: recipes } = await db.from("recipes").select("id, title").eq("family_id", familyId()).ilike("title", recipeName);
      if (recipes?.length) recipeId = recipes[0].id;
      else if (m.recipe) throw new Error(`No saved recipe called "${m.recipe}". Log it without "recipe", or save it first with add_recipe.`);
      const memberIds = await Promise.all((m.who ?? []).map((n) => memberIdByName(n)));
      const { error } = await db.from("meals").insert({
        family_id: familyId(),
        eaten_on: date,
        slot: m.slot ?? "dinner",
        title: m.title.trim(),
        recipe_id: recipeId,
        food_groups: m.food_groups ?? [],
        place: m.place ?? "home",
        member_ids: memberIds.filter(Boolean),
        notes: m.notes ?? null,
        reaction: m.reaction ?? null,
        created_by: createdBy(),
      });
      if (error) throw new Error(error.message);
      return text(`Logged ${m.slot ?? "dinner"} on ${date}: ${m.title}${recipeId ? " (saved recipe)" : ""}.`);
    },
  );

  server.registerTool(
    "get_meals",
    {
      title: "What we ate",
      description:
        "The meals journal for the last days, with how many meals touched each food group (to judge balance). With 'who' = a kid: that kid's meals (their own and the family's), how they took them, and what they love or refuse over the last 90 days.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional().describe("Default 7"),
        who: z.string().optional().describe("Only meals this person ate (first name), e.g. the kid"),
      }),
    },
    async ({ days, who }) => {
      const db = createAdminClient();
      const since = utcToStockholm(new Date(Date.now() - ((days ?? 7) - 1) * 86400000).toISOString()).slice(0, 10);
      const personId = who ? await memberIdByName(who) : null;
      const tasteSince = utcToStockholm(new Date(Date.now() - 89 * 86400000).toISOString()).slice(0, 10);
      let query = db
        .from("meals")
        .select("eaten_on, slot, title, food_groups, place, member_ids, notes, reaction")
        .eq("family_id", familyId())
        .gte("eaten_on", personId ? (tasteSince < since ? tasteSince : since) : since)
        .order("eaten_on")
        .order("created_at");
      if (personId) query = query.or(`member_ids.cs.{${personId}},member_ids.eq.{}`);
      const [{ data, error }, { data: members }] = await Promise.all([query, db.from("members").select("id, name").eq("family_id", familyId())]);
      if (error) throw new Error(error.message);
      const name = (id: string) => members?.find((x) => x.id === id)?.name ?? "?";
      const all = data ?? [];
      const inRange = all.filter((m) => m.eaten_on >= since);
      const meals = inRange.map(({ member_ids, reaction, ...m }) => ({ ...m, who: member_ids.length ? member_ids.map(name) : "everyone", ...(reaction ? { reaction } : {}) }));
      const tastes = (r: string) => [...new Set(all.filter((m) => m.reaction === r).map((m) => m.title))];
      return text({
        since,
        meals,
        food_group_counts: groupCounts(inRange),
        ...(personId ? { loves: tastes("loved"), refuses: tastes("refused") } : {}),
      });
    },
  );

  server.registerTool(
    "plan_groceries",
    {
      title: "Plan groceries from habits",
      description:
        "Everything needed to anticipate the shopping: home-cooked meals of the last weeks (with recipe ingredients), dishes the family eats often, food groups per week, items probably running out, and what is already on the shopping list.",
      inputSchema: z.object({
        weeks: z.number().int().min(1).max(12).optional().describe("How far back to look at meals, default 4"),
        within_days: z.number().int().min(1).max(30).optional().describe("Horizon for items running out, default 7"),
      }),
    },
    async ({ weeks, within_days }) => {
      const db = createAdminClient();
      const w = weeks ?? 4;
      const since = utcToStockholm(new Date(Date.now() - (w * 7 - 1) * 86400000).toISOString()).slice(0, 10);
      const until = new Date(Date.now() + (within_days ?? 7) * 86400000).toISOString().slice(0, 10);
      const [{ data: meals, error }, { data: recipes }, { data: due }, { data: listed }] = await Promise.all([
        db.from("meals").select("eaten_on, slot, title, recipe_id, food_groups, place").eq("family_id", familyId()).gte("eaten_on", since).order("eaten_on"),
        db.from("recipes").select("id, title, ingredients, favorite").eq("family_id", familyId()),
        db.from("restock_suggestions").select("item_name, avg_interval_days, next_due_on").eq("family_id", familyId()).lte("next_due_on", until).order("next_due_on"),
        db.from("list_items").select("title, quantity, lists!inner(kind)").eq("family_id", familyId()).eq("done", false).eq("lists.kind", "grocery"),
      ]);
      if (error) throw new Error(error.message);
      const recipe = (id: string | null) => recipes?.find((r) => r.id === id);
      const home = (meals ?? []).filter((m) => m.place === "home");
      // Dishes eaten more than once: the family's habits.
      const often = new Map<string, { title: string; times: number; last: string; ingredients: string[] }>();
      for (const m of home) {
        const r = recipe(m.recipe_id);
        const key = (r?.title ?? m.title).trim().toLowerCase();
        const cur = often.get(key) ?? { title: r?.title ?? m.title, times: 0, last: m.eaten_on, ingredients: r?.ingredients ?? [] };
        often.set(key, { ...cur, times: cur.times + 1, last: m.eaten_on });
      }
      const counts = groupCounts(meals ?? []);
      return text({
        since,
        meals_logged: meals?.length ?? 0,
        note:
          (meals?.length ?? 0) < 10
            ? "Few meals logged so far: habits are not reliable yet. Lean on running_out and favourites, and say so."
            : undefined,
        home_meals: home.map((m) => ({ date: m.eaten_on, slot: m.slot, title: m.title, ingredients: recipe(m.recipe_id)?.ingredients })),
        eaten_often: [...often.values()].filter((d) => d.times > 1).sort((a, b) => b.times - a.times),
        food_groups_per_week: Object.fromEntries(Object.entries(counts).map(([g, n]) => [g, Math.round((n / w) * 10) / 10])),
        favourite_recipes: (recipes ?? []).filter((r) => r.favorite).map((r) => ({ title: r.title, ingredients: r.ingredients })),
        running_out: due ?? [],
        already_on_list: (listed ?? []).map((l) => (l.quantity ? `${l.quantity} ${l.title}` : l.title)),
      });
    },
  );

  server.registerTool(
    "log_receipt",
    {
      title: "Log a receipt",
      description:
        "Record everything bought on a receipt (read from a photo). Logs each line as a purchase (with store and price) and checks off matching items on the shopping lists.",
      inputSchema: z.object({
        store: z.string().optional().describe("e.g. ICA Maxi Lindhagen"),
        date: z.string().optional().describe("Purchase date YYYY-MM-DD (Stockholm); default today"),
        items: z
          .array(
            z.object({
              name: z.string().min(1).describe("Normalized item name the family uses, e.g. 'Milk' (not 'MELLANMJ 1,5%')"),
              quantity: z.string().optional(),
              price: z.number().optional().describe("Line total in SEK"),
            }),
          )
          .min(1),
      }),
    },
    async ({ store, date, items }) => {
      const db = createAdminClient();
      const purchasedAt = date ? stockholmToUtc(`${date}T12:00`) : new Date().toISOString();
      // Log purchases first: the check-off trigger then skips its own duplicate.
      const { error } = await db.from("purchases").insert(
        items.map((i) => ({
          family_id: familyId(),
          item_name: i.name.trim(),
          quantity: i.quantity ?? null,
          price: i.price ?? null,
          store: store ?? null,
          source: "receipt",
          purchased_at: purchasedAt,
          created_by: createdBy(),
        })),
      );
      if (error) throw new Error(error.message);

      const { data: open } = await db
        .from("list_items")
        .select("id, title, lists!inner(kind)")
        .eq("family_id", familyId())
        .eq("done", false)
        .eq("lists.kind", "grocery");
      const names = items.map((i) => i.name.trim().toLowerCase());
      const hits = (open ?? []).filter((o) => {
        const t = o.title.trim().toLowerCase();
        return names.some((n) => n === t || (t.length > 2 && n.includes(t)) || (n.length > 2 && t.includes(n)));
      });
      if (hits.length) {
        await db.from("list_items").update({ done: true, done_at: new Date().toISOString() }).in("id", hits.map((h) => h.id));
      }
      const total = items.reduce((s, i) => s + (i.price ?? 0), 0);
      return text({
        logged: items.length,
        store: store ?? null,
        total_sek: total ? Math.round(total * 100) / 100 : null,
        checked_off_from_list: hits.map((h) => h.title),
      });
    },
  );

  server.registerTool(
    "send_gift",
    {
      title: "Send a little gift",
      description: "Send a family member a small gift (emoji + optional note) that they unwrap next time they open the app.",
      inputSchema: z.object({
        to: z.string().describe("First name of the family member with an account, e.g. 'Jennie'"),
        emoji: z.string().max(16).optional().describe("Default ❤️"),
        message: z.string().max(140).optional(),
      }),
    },
    async ({ to, emoji, message }) => {
      const from = createdBy();
      if (!from) throw new Error("Gifts need a personal connector link (Me → Reminders & AI) so we know who sends it.");
      const db = createAdminClient();
      const { data: people } = await db.from("profiles").select("id, display_name").eq("family_id", familyId());
      const n = to.trim().toLowerCase();
      const target =
        (people ?? []).find((p) => p.display_name.toLowerCase() === n) ?? (people ?? []).find((p) => p.display_name.toLowerCase().startsWith(n));
      if (!target) throw new Error(`No account named "${to}". People with an account: ${(people ?? []).map((p) => p.display_name).join(", ")}`);
      if (target.id === from) throw new Error("You can't send a gift to yourself.");
      const { error } = await db
        .from("gifts")
        .insert({ family_id: familyId(), from_profile: from, to_profile: target.id, emoji: emoji || "❤️", message: message?.trim() || null });
      if (error) throw new Error(error.message);
      return text(`Sent ${emoji || "❤️"} to ${target.display_name}. They'll unwrap it next time they open Hembrain.`);
    },
  );

  server.registerTool(
    "get_work",
    {
      title: "Get my work space",
      description:
        "The speaker's private work organiser: people (role + notes on what they do), projects (people + notes), recurring meetings (attendees), open and waiting items, and a per-person summary. Filter by person (their items + items on their projects), project, or meeting (today's agenda, what attendees still owe, what is set for next time). Set include_done for what got done recently (up to 60 days back), e.g. for a recap of who did what.",
      inputSchema: z.object({
        person: z.string().optional(),
        project: z.string().optional(),
        meeting: z.string().optional(),
        include_done: z.boolean().optional().describe("Also return items done recently"),
        done_since: z.string().optional().describe("With include_done: only done on or after this date, YYYY-MM-DD"),
      }),
    },
    async ({ person, project, meeting, include_done, done_since }) => {
      const w = await loadWork();
      const names = (ids: string[]) => ids.map((id) => w.people.find((p) => p.id === id)?.name).filter(Boolean);
      const out = (items: WorkItem[]) => items.map((i) => workItemOut(i, w));
      const done = (keep: (i: WorkItem) => boolean) => (include_done ? { done: out(doneSince(w, done_since).filter(keep)) } : {});
      if (person) {
        const p = findWork(w.people, person, "person");
        const { direct, viaProjects } = personItems(p, w.items, w.projects);
        return text({ person: p.name, role: p.role, notes: p.notes, items: out(direct), on_their_projects: out(viaProjects), ...done((i) => i.person_id === p.id) });
      }
      if (project) {
        const p = findWork(w.projects, project, "project");
        return text({ project: p.name, notes: p.notes, people: names(p.person_ids), items: out(w.items.filter((i) => i.project_id === p.id)), ...done((i) => i.project_id === p.id) });
      }
      if (meeting) {
        const m = findWork(w.meetings, meeting, "meeting");
        const today = workToday();
        const { forMeeting, byPerson, nextTime, waiting } = meetingAgenda(m, w.items, today);
        const attendees = new Set(m.person_ids);
        return text({
          meeting: m.name,
          day: m.weekday ? WEEKDAYS[m.weekday] : null,
          next_meeting: nextMeetingDate(m, today),
          attendees: names(m.person_ids),
          // Collective points first, then each attendee's own: present them in that order.
          agenda: out(forMeeting),
          agenda_by_person: byPerson.map((g) => ({ person: names([g.personId])[0], items: out(g.items) })),
          waiting_on_attendees: out(waiting),
          set_for_next_time: out(nextTime),
          ...done((i) => i.meeting_id === m.id || (!!i.person_id && attendees.has(i.person_id))),
        });
      }
      return text({
        today: workToday(),
        people: w.people.map((p) => ({ name: p.name, role: p.role, notes: p.notes || undefined })),
        projects: w.projects.map((p) => ({ name: p.name, people: names(p.person_ids), notes: p.notes || undefined, archived: p.archived || undefined })),
        meetings: w.meetings.map((m) => ({ name: m.name, day: m.weekday ? WEEKDAYS[m.weekday] : null, attendees: names(m.person_ids) })),
        summary_by_person: peopleSummary(w.people, w.items, doneSince(w, done_since)),
        items: out(w.items),
        ...done(() => true),
      });
    },
  );

  server.registerTool(
    "add_work_items",
    {
      title: "Add to my work space",
      description:
        "File one or more items in the speaker's private work space. Set person / project / meeting with names from get_work, and kind: todo (I do it), give (hand it to the person), discuss (bring it up with the person). To hand the same thing to several people, add one item per person. next_time keeps it off the meeting's agenda until its next occurrence (decided at the end of a meeting, for next week).",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              title: z.string().min(1).max(500),
              kind: z.enum(["todo", "give", "discuss"]).optional().describe("Default todo"),
              priority: z.boolean().optional().describe("Urgent / important: listed first"),
              person: z.string().optional(),
              project: z.string().optional(),
              meeting: z.string().optional().describe("Recurring meeting where it should come up"),
              next_time: z.boolean().optional().describe("With meeting: for its next occurrence, not today's"),
              not_before: z.string().optional().describe("Keep off agendas until this date, YYYY-MM-DD"),
              due: z.string().optional().describe("YYYY-MM-DD"),
              already_handed_over: z.boolean().optional().describe("Already given to the person (e.g. assigned during the meeting): now waiting on them"),
            }),
          )
          .min(1)
          .max(50),
      }),
    },
    async ({ items }) => {
      const w = await loadWork();
      const now = new Date().toISOString();
      const rows = items.map((i) => {
        const meetingId = workRef(w.meetings, i.meeting, "meeting") ?? null;
        const meeting = w.meetings.find((m) => m.id === meetingId);
        if (i.next_time && !meeting) throw new Error(`"${i.title}": next_time needs a meeting.`);
        return {
          family_id: familyId(),
          profile_id: ownerId(),
          title: i.title.trim(),
          kind: i.kind ?? "todo",
          priority: i.priority ?? false,
          person_id: workRef(w.people, i.person, "person") ?? null,
          project_id: workRef(w.projects, i.project, "project") ?? null,
          meeting_id: meetingId,
          not_before: i.next_time && meeting ? nextMeetingDate(meeting, workToday()) : i.not_before || null,
          due_date: i.due || null,
          status: i.already_handed_over ? "waiting" : "open",
          waiting_since: i.already_handed_over ? now : null,
        };
      });
      const { data, error } = await createAdminClient().from("work_items").insert(rows).select("*");
      if (error) throw new Error(error.message);
      return text({ added: ((data ?? []) as WorkItem[]).map((i) => workItemOut(i, w)) });
    },
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update a work item",
      description:
        "Change a work item by id (from get_work): status open / waiting (handed over, waiting on the person) / done, or re-file it. An empty string clears person, project, meeting, due or not_before.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        kind: z.enum(["todo", "give", "discuss"]).optional(),
        status: z.enum(["open", "waiting", "done"]).optional(),
        priority: z.boolean().optional(),
        person: z.string().optional(),
        project: z.string().optional(),
        meeting: z.string().optional(),
        due: z.string().optional(),
        not_before: z.string().optional().describe("Keep off agendas until this date, YYYY-MM-DD"),
      }),
    },
    async ({ id, title, kind, status, priority, person, project, meeting, due, not_before }) => {
      const w = await loadWork();
      const db = createAdminClient();
      const { data: before } = await db.from("work_items").select("*").eq("id", id).eq("profile_id", ownerId()).maybeSingle();
      if (!before) throw new Error("No work item with that id in your space.");
      const row: Record<string, unknown> = {};
      if (title !== undefined) row.title = title.trim();
      if (kind !== undefined) row.kind = kind;
      if (priority !== undefined) row.priority = priority;
      if (status !== undefined && status !== before.status) {
        const now = new Date().toISOString();
        row.status = status;
        // Kept once done: how long it waited on the person.
        row.waiting_since = status === "waiting" ? now : status === "done" ? before.waiting_since : null;
        row.done_at = status === "done" ? now : null;
      }
      const refs = { person_id: workRef(w.people, person, "person"), project_id: workRef(w.projects, project, "project"), meeting_id: workRef(w.meetings, meeting, "meeting") };
      for (const [k, v] of Object.entries(refs)) if (v !== undefined) row[k] = v;
      if (due !== undefined) row.due_date = due || null;
      if (not_before !== undefined) row.not_before = not_before || null;
      const { data, error } = await db.from("work_items").update(row).eq("id", id).eq("profile_id", ownerId()).select("*").single();
      if (error) throw new Error(error.message);
      return text({ updated: workItemOut(data as WorkItem, w) });
    },
  );

  server.registerTool(
    "set_work_entry",
    {
      title: "Add or edit a work person, project or meeting",
      description:
        "Create, or update (matched by name), a person, project or recurring meeting in the speaker's private work space. Ask the user before creating a new one. Keep notes up to date with what the user tells you (job, what they own, who decides): they are how you file things later.",
      inputSchema: z.object({
        type: z.enum(["person", "project", "meeting"]),
        name: z.string().min(1).max(80),
        new_name: z.string().min(1).max(80).optional().describe("Rename"),
        role: z.enum(["boss", "peer", "team", "other"]).optional().describe("person: boss = my manager, team = reports to me, peer = colleague"),
        notes: z.string().max(2000).optional().describe("person or project: replaces the notes (job, what they own, context)"),
        people: z.array(z.string()).optional().describe("project: people on it; meeting: attendees (names of existing people)"),
        weekday: z.number().int().min(1).max(7).optional().describe("meeting: ISO weekday, 1 = Monday"),
        archived: z.boolean().optional().describe("project"),
      }),
    },
    async ({ type, name, new_name, role, notes, people, weekday, archived }) => {
      const w = await loadWork();
      const db = createAdminClient();
      const table = type === "person" ? "work_people" : type === "project" ? "work_projects" : "work_meetings";
      const rows: { id: string; name: string }[] = type === "person" ? w.people : type === "project" ? w.projects : w.meetings;
      const existing = findByName(rows, name);
      const row: Record<string, unknown> = {};
      if (new_name || !existing) row.name = (new_name ?? name).trim();
      if (type === "person" && role) row.role = role;
      if (type !== "meeting" && notes !== undefined) row.notes = notes.trim();
      if (type !== "person" && people) row.person_ids = people.map((n) => workRef(w.people, n, "person")).filter(Boolean);
      if (type === "meeting" && weekday !== undefined) row.weekday = weekday;
      if (type === "project" && archived !== undefined) row.archived = archived;
      const { error } = existing
        ? await db.from(table).update(row).eq("id", existing.id).eq("profile_id", ownerId())
        : await db.from(table).insert({ ...row, family_id: familyId(), profile_id: ownerId() });
      if (error) throw new Error(error.message);
      return text(`${existing ? "Updated" : "Created"} ${type} "${(new_name ?? existing?.name ?? name).trim()}".`);
    },
  );

  server.registerTool(
    "get_kid_sleep",
    {
      title: "Kid's sleep",
      description:
        "A kid's naps and nights for the last days (Stockholm time): bedtime, wake-up, night wakings, naps, totals per day, averages, age, and whether the kid is asleep right now or since when awake. Use it to suggest tonight's bedtime or nap times.",
      inputSchema: z.object({
        kid: z.string().optional().describe("First name; optional when the family has one kid"),
        days: z.number().int().min(1).max(30).optional().describe("Default 7"),
      }),
    },
    async ({ kid: kidName, days }) => {
      const kid = await kidByName(kidName);
      const n = days ?? 7;
      const since = new Date(Date.now() - (n + 1) * 86400000).toISOString();
      const { data, error } = await createAdminClient()
        .from("kid_sleep")
        .select("kind, starts_at, ends_at, wakings, notes")
        .eq("family_id", familyId())
        .eq("kid_id", kid.id)
        .gte("starts_at", since)
        .order("starts_at");
      if (error) throw new Error(error.message);
      const entries = (data ?? []) as Pick<KidSleep, "kind" | "starts_at" | "ends_at" | "wakings" | "notes">[];
      const now = new Date();
      const today = stockholmDay(now.toISOString());
      const perDay = sleepDays(entries, stockholmDay, now).filter((d) => d.day >= stockholmDay(new Date(Date.now() - n * 86400000).toISOString()));
      const full = perDay.filter((d) => d.day < today);
      const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
      const state = sleepState(entries);
      const noteOf = (start: string) => entries.find((e) => e.starts_at === start)?.notes ?? undefined;
      return text({
        kid: kid.name,
        age_months: kid.birthdate ? ageInMonths(kid.birthdate) : null,
        now: utcToStockholm(now.toISOString()),
        right_now: !state
          ? "nothing logged"
          : state.asleep
            ? `asleep (${state.kind}) since ${stockholmClock(state.since)}, ${minutesBetween(state.since, now)} min`
            : `awake since ${utcToStockholm(state.since)}, ${minutesBetween(state.since, now)} min`,
        days: perDay.map((d) => ({
          day: d.day,
          night: d.night
            ? { bedtime: stockholmClock(d.night.start), woke_up: d.night.end ? utcToStockholm(d.night.end) : "still asleep", minutes: d.night.minutes, wakings: d.night.wakings, notes: noteOf(d.night.start) }
            : null,
          naps: d.naps.map((x) => ({ from: stockholmClock(x.start), to: x.end ? stockholmClock(x.end) : "still asleep", minutes: x.minutes, notes: noteOf(x.start) })),
          total_minutes: d.night_minutes + d.nap_minutes,
        })),
        averages_full_days: {
          days: full.length,
          total_minutes: avg(full.map((d) => d.night_minutes + d.nap_minutes)),
          night_minutes: avg(full.filter((d) => d.night).map((d) => d.night_minutes)),
          nap_minutes: avg(full.map((d) => d.nap_minutes)),
          bedtime: avgClock(full.flatMap((d) => (d.night ? [d.night.start] : [])), stockholmMinutes, true),
          wake_up: avgClock(full.flatMap((d) => (d.night?.end ? [d.night.end] : [])), stockholmMinutes),
        },
        note: entries.length < 5 ? "Little logged so far: say the advice is rough until a few days are in." : undefined,
      });
    },
  );

  server.registerTool(
    "log_sleep",
    {
      title: "Log a kid's sleep",
      description:
        "Record a kid's nap or night. 'fell_asleep' starts it (start defaults to now), 'woke_up' ends the sleep in progress (end defaults to now; wakings adds night wakings), 'log' records a whole past sleep (start and end required). Times are Stockholm local (YYYY-MM-DDTHH:MM).",
      inputSchema: z.object({
        kid: z.string().optional().describe("First name; optional when the family has one kid"),
        action: z.enum(["fell_asleep", "woke_up", "log"]),
        kind: z.enum(["nap", "night"]).optional().describe("Default: night from 17:00 to 05:00, else nap"),
        start: z.string().optional(),
        end: z.string().optional(),
        wakings: z.number().int().min(0).max(30).optional().describe("Night wakings"),
        notes: z.string().max(500).optional().describe("e.g. 'teething', 'awake 1 h at 3'"),
      }),
    },
    async ({ kid: kidName, action, kind, start, end, wakings, notes }) => {
      const kid = await kidByName(kidName);
      const db = createAdminClient();
      const startIso = start ? stockholmToUtc(start) : new Date().toISOString();
      const hour = Number(stockholmClock(startIso).slice(0, 2));
      const k = kind ?? (hour >= 17 || hour < 5 ? "night" : "nap");
      if (action === "woke_up") {
        const { data: open } = await db
          .from("kid_sleep")
          .select("id, kind, starts_at, wakings")
          .eq("family_id", familyId())
          .eq("kid_id", kid.id)
          .is("ends_at", null)
          .order("starts_at", { ascending: false })
          .limit(1);
        const cur = open?.[0];
        if (!cur) throw new Error(`${kid.name} has no sleep in progress. Use action "log" with start and end.`);
        const endIso = end ? stockholmToUtc(end) : new Date().toISOString();
        if (endIso <= cur.starts_at) throw new Error(`The sleep in progress started at ${utcToStockholm(cur.starts_at)}; the end must be after it.`);
        const { error } = await db
          .from("kid_sleep")
          .update({ ends_at: endIso, wakings: cur.wakings + (wakings ?? 0), ...(notes ? { notes } : {}) })
          .eq("id", cur.id)
          .eq("family_id", familyId());
        if (error) throw new Error(error.message);
        return text(`${kid.name} woke up at ${stockholmClock(endIso)} after a ${cur.kind} of ${minutesBetween(cur.starts_at, endIso)} min.`);
      }
      if (action === "log" && (!start || !end)) throw new Error('"log" needs start and end.');
      const endIso = action === "log" && end ? stockholmToUtc(end) : null;
      if (endIso && endIso <= startIso) throw new Error("The end must be after the start.");
      const { error } = await db.from("kid_sleep").insert({
        family_id: familyId(),
        kid_id: kid.id,
        kind: k,
        starts_at: startIso,
        ends_at: endIso,
        wakings: wakings ?? 0,
        notes: notes ?? null,
        created_by: createdBy(),
      });
      if (error) throw new Error(error.message);
      return text(
        endIso
          ? `Logged ${kid.name}'s ${k} on ${k === "night" ? nightDay(startIso, stockholmDay) : stockholmDay(startIso)}: ${stockholmClock(startIso)} → ${stockholmClock(endIso)} (${minutesBetween(startIso, endIso)} min).`
          : `${kid.name} fell asleep (${k}) at ${stockholmClock(startIso)}.`,
      );
    },
  );

  server.registerTool(
    "get_wardrobe",
    {
      title: "Kid's wardrobe",
      description:
        "A kid's clothing and shoe sizes, the clothes they have (by category, with size), what's on the to-buy list, what's too small, and the season's essentials nothing covers yet.",
      inputSchema: z.object({ kid: z.string().optional().describe("First name; optional when the family has one kid") }),
    },
    async ({ kid: kidName }) => {
      const kid = await kidByName(kidName);
      const { data, error } = await createAdminClient()
        .from("kid_clothes")
        .select("title, category, size, status, notes")
        .eq("family_id", familyId())
        .eq("kid_id", kid.id)
        .order("created_at");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Pick<KidClothes, "title" | "category" | "size" | "status" | "notes">[];
      const age = kid.birthdate ? ageInMonths(kid.birthdate) : null;
      const out = (r: (typeof rows)[number]) => ({
        title: r.title,
        size: r.size ?? undefined,
        notes: r.notes ?? undefined,
        ...(r.status === "have" && probablyTooSmall(r.size, r.category === "shoes" ? kid.shoe_size : kid.clothing_size, age, r.category === "shoes") ? { probably_too_small: true } : {}),
      });
      const has: Record<string, ReturnType<typeof out>[]> = {};
      for (const r of rows.filter((x) => x.status === "have")) (has[r.category] ??= []).push(out(r));
      return text({
        kid: kid.name,
        age_months: age,
        clothing_size: kid.clothing_size,
        shoe_size: kid.shoe_size,
        sizes_updated_on: kid.sizes_updated_on,
        season: coldSeason() ? "cold (October–April)" : "warm (May–September)",
        has,
        to_buy: rows.filter((x) => x.status === "need").map(out),
        too_small: rows.filter((x) => x.status === "outgrown").map(out),
        missing_essentials: missingEssentials(rows, (x) => x).map((e) => e.title),
        categories: CLOTHES_CATEGORY_IDS,
      });
    },
  );

  server.registerTool(
    "update_wardrobe",
    {
      title: "Update a kid's wardrobe",
      description:
        "Set a kid's sizes, add clothes they have or need to buy, and mark to-buy items as bought (matched by title). Tell the user what changed.",
      inputSchema: z.object({
        kid: z.string().optional().describe("First name; optional when the family has one kid"),
        clothing_size: z.string().max(20).optional().describe("e.g. '92' (cm, Nordic sizing)"),
        shoe_size: z.string().max(20).optional().describe("EU size, e.g. '23'"),
        add: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              category: z.enum(CLOTHES_CATEGORY_IDS).optional().describe(CLOTHES_CATEGORIES.map((c) => `${c.id} = ${c.label}`).join("; ")),
              size: z.string().max(20).optional().describe("Default: the kid's current size (shoe size for shoes)"),
              status: z.enum(["have", "need", "outgrown"]).optional().describe("have (default), need = to buy, outgrown = too small"),
              notes: z.string().max(500).optional(),
            }),
          )
          .optional(),
        bought: z.array(z.string()).optional().describe("Titles on the to-buy list that were bought"),
      }),
    },
    async ({ kid: kidName, clothing_size, shoe_size, add, bought }) => {
      const kid = await kidByName(kidName);
      const db = createAdminClient();
      const done: string[] = [];
      if (clothing_size !== undefined || shoe_size !== undefined) {
        const row: Record<string, unknown> = { sizes_updated_on: stockholmDay(new Date().toISOString()) };
        if (clothing_size !== undefined) row.clothing_size = clothing_size.trim() || null;
        if (shoe_size !== undefined) row.shoe_size = shoe_size.trim() || null;
        const { error } = await db.from("members").update(row).eq("id", kid.id).eq("family_id", familyId());
        if (error) throw new Error(error.message);
        done.push(`sizes: clothes ${clothing_size ?? kid.clothing_size ?? "?"}, shoes ${shoe_size ?? kid.shoe_size ?? "?"}`);
      }
      const clothes = (clothing_size ?? kid.clothing_size) || null;
      const shoes = (shoe_size ?? kid.shoe_size) || null;
      if (add?.length) {
        const { error } = await db.from("kid_clothes").insert(
          add.map((a) => ({
            family_id: familyId(),
            kid_id: kid.id,
            title: a.title.trim(),
            category: a.category ?? "other",
            size: a.size ?? (a.category === "shoes" ? shoes : clothes),
            status: a.status ?? "have",
            notes: a.notes ?? null,
            created_by: createdBy(),
          })),
        );
        if (error) throw new Error(error.message);
        done.push(`added ${add.map((a) => `${a.title} (${a.status ?? "have"})`).join(", ")}`);
      }
      if (bought?.length) {
        const { data: need } = await db.from("kid_clothes").select("id, title").eq("family_id", familyId()).eq("kid_id", kid.id).eq("status", "need");
        const missing: string[] = [];
        for (const b of bought) {
          const n = b.trim().toLowerCase();
          const hit = (need ?? []).find((x) => x.title.toLowerCase() === n) ?? (need ?? []).find((x) => x.title.toLowerCase().includes(n));
          if (!hit) {
            missing.push(b);
            continue;
          }
          await db.from("kid_clothes").update({ status: "have", updated_at: new Date().toISOString() }).eq("id", hit.id).eq("family_id", familyId());
          done.push(`bought ${hit.title}`);
        }
        if (missing.length) done.push(`not on the to-buy list: ${missing.join(", ")} (add them with status "have" if needed)`);
      }
      return text(done.length ? `${kid.name}: ${done.join("; ")}.` : "Nothing to change.");
    },
  );

  server.registerTool(
    "get_travels",
    {
      title: "Countries we've been to",
      description: "Every family member's visited countries (Travels map) with the first year when known, the ones all of us have been to, and the timeline of trips (newest first: country, month, who, note).",
      inputSchema: z.object({}),
    },
    async () => {
      const db = createAdminClient();
      const [{ data: people }, { data: rows, error }] = await Promise.all([
        db.from("members").select("id, name").eq("family_id", familyId()).order("created_at"),
        db.from("visited_countries").select("member_id, country, first_year, note").eq("family_id", familyId()),
      ]);
      const { data: trips } = await db
        .from("trips")
        .select("country, start_month, end_month, lived, note, member_ids")
        .eq("family_id", familyId())
        .order("start_month", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      const all = rows ?? [];
      const byPerson = (people ?? []).map((p) => ({
        name: p.name,
        countries: all
          .filter((r) => r.member_id === p.id)
          .map((r) => ({ code: r.country, name: countryName(r.country), ...(r.first_year ? { first_year: r.first_year } : {}), ...(r.note ? { note: r.note } : {}) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }));
      const codes = [...new Set(all.map((r) => r.country))];
      const together = codes.filter((c) => (people ?? []).every((p) => all.some((r) => r.member_id === p.id && r.country === c)));
      const nameOf = (id: string) => (people ?? []).find((p) => p.id === id)?.name ?? "?";
      return text({
        family_total: codes.length,
        people: byPerson,
        everyone_has_been: together.map((c) => countryName(c)),
        trips: (trips ?? []).map((x) => ({
          country: countryName(x.country),
          from: x.start_month?.slice(0, 7) ?? "unknown",
          ...(x.end_month ? { to: x.end_month.slice(0, 7) } : {}),
          ...(x.lived ? { lived_there: true } : {}),
          ...(x.note ? { note: x.note } : {}),
          who: (x.member_ids as string[]).map(nameOf),
        })),
      });
    },
  );

  server.registerTool(
    "add_countries",
    {
      title: "Add countries we've been to",
      description: "Mark countries as visited by one or more family members (or remove them, only when asked). Countries: ISO codes or names in any language.",
      inputSchema: z.object({
        who: z.array(z.string()).min(1).describe("First names of the family members who went"),
        countries: z.array(z.string().min(1)).min(1).max(250),
        first_year: z.number().int().min(1900).max(2100).optional().describe("First time there, when it is one trip"),
        note: z.string().max(500).optional(),
        remove: z.boolean().optional().describe("Remove these countries instead (only when explicitly asked)"),
      }),
    },
    async ({ who, countries, first_year, note, remove }) => {
      const db = createAdminClient();
      const memberIds = await Promise.all(who.map((n) => memberIdByName(n)));
      const codes = [...new Set(countries.map((c) => findCountry(c)).filter((c): c is string => !!c))];
      const unknown = countries.filter((c) => !findCountry(c));
      if (remove) {
        const { error } = await db.from("visited_countries").delete().eq("family_id", familyId()).in("member_id", memberIds as string[]).in("country", codes);
        if (error) throw new Error(error.message);
        return text({ removed: codes.map((c) => countryName(c)), for: who, not_recognised: unknown });
      }
      const rows = memberIds.flatMap((member_id) =>
        codes.map((country) => ({
          family_id: familyId(),
          member_id,
          country,
          created_by: createdBy(),
          ...(first_year ? { first_year } : {}),
          ...(note ? { note } : {}),
        })),
      );
      // A year or a note updates countries already ticked; otherwise they are left as they are.
      const { error } = await db
        .from("visited_countries")
        .upsert(rows, { onConflict: "member_id,country", ignoreDuplicates: !first_year && !note });
      if (error) throw new Error(error.message);
      return text({ added: codes.map((c) => countryName(c)), for: who, not_recognised: unknown });
    },
  );

  server.registerTool(
    "add_trips",
    {
      title: "Add trips to the timeline",
      description:
        "Add dated trips (or a stretch lived somewhere) to the Travels timeline. Each trip also ticks its country on the map for everyone who went. One trip per country: a trip through Croatia and Bosnia = two trips.",
      inputSchema: z.object({
        trips: z
          .array(
            z.object({
              country: z.string().min(1).describe("ISO code or name"),
              from: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM; leave out when the year is unknown"),
              to: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM, for trips over several months"),
              who: z.array(z.string()).min(1).describe("First names of the family members who went"),
              note: z.string().max(500).optional().describe("What it was: 'Kate's wedding in Bristol', 'with Alex'"),
              lived: z.boolean().optional().describe("Lived there (studies, work, residence)"),
            }),
          )
          .min(1)
          .max(100),
      }),
    },
    async ({ trips }) => {
      const rows = await Promise.all(
        trips.map(async (x) => {
          const country = findCountry(x.country);
          if (!country) throw new Error(`Unknown country "${x.country}"`);
          return {
            family_id: familyId(),
            country,
            start_month: x.from ? `${x.from}-01` : null,
            end_month: x.from && x.to && x.to >= x.from ? `${x.to}-01` : null,
            lived: x.lived ?? false,
            note: x.note?.trim() || null,
            member_ids: (await Promise.all(x.who.map((n) => memberIdByName(n)))) as string[],
            created_by: createdBy(),
          };
        }),
      );
      const { error } = await createAdminClient().from("trips").insert(rows);
      if (error) throw new Error(error.message);
      return text({ added: trips.map((x) => `${countryName(findCountry(x.country)!)} ${x.from ?? "(year unknown)"} — ${x.who.join(", ")}`) });
    },
  );

  // ---- Papers: contracts, insurance, warranties, IDs (family + the speaker's private ones)

  server.registerTool(
    "get_papers",
    {
      title: "Family papers",
      description:
        "The family's contracts, insurance policies, receipts kept for the warranty and IDs, plus the speaker's own private ones: who they cover, price, renewal, notice period and last day to cancel, expiry, what they cover. Deadlines of the next 90 days first. review = add yearly costs per category, what's missing in each paper, and the household (for a review of what we pay twice, gaps, what to renegotiate).",
      inputSchema: z.object({
        category: z.enum(PAPER_CATEGORY_IDS).optional(),
        include_ended: z.boolean().optional().describe("Also cancelled / replaced ones"),
        review: z.boolean().optional(),
      }),
    },
    async ({ category, include_ended, review }) => {
      const db = createAdminClient();
      const owner = mcpContext.getStore()?.profileId ?? null;
      let q = db.from("papers").select("*").eq("family_id", familyId()).order("category").order("title");
      q = owner ? q.or(`profile_id.is.null,profile_id.eq.${owner}`) : q.is("profile_id", null);
      if (category) q = q.eq("category", category);
      if (!include_ended) q = q.eq("ended", false);
      const [{ data, error }, { data: members }] = await Promise.all([
        q,
        db.from("members").select("id, name, birthdate, profile_id").eq("family_id", familyId()).order("created_at"),
      ]);
      if (error) throw new Error(error.message);
      const papers = (data ?? []) as Paper[];
      const today = stockholmDay(new Date().toISOString());
      const nameOf = (id: string) => (members ?? []).find((m) => m.id === id)?.name ?? "?";
      const out = papers.map((p) => {
        const next = deadlines(p, today);
        const renewal = p.period === "month" ? null : nextRenewal(p, today);
        return {
          id: p.id,
          title: p.title,
          category: p.category,
          provider: p.provider ?? undefined,
          reference: p.reference ?? undefined,
          covers: p.member_ids.length ? p.member_ids.map(nameOf) : "whole household",
          price: p.amount != null ? `${p.amount} ${p.currency}${p.period ? ` (${p.period})` : ""}` : undefined,
          yearly_cost: yearlyCost(p) ?? undefined,
          next_renewal: renewal ?? undefined,
          notice_days: p.notice_days ?? undefined,
          last_day_to_cancel: next.find((d) => d.kind === "cancel")?.date,
          expires_on: p.expires_on ?? undefined,
          warranty_until: p.warranty_until ?? undefined,
          summary: p.summary ?? undefined,
          details: Object.keys(p.details ?? {}).length ? p.details : undefined,
          has_document: !!p.file_path,
          private: p.profile_id ? true : undefined,
          ended: p.ended || undefined,
        };
      });
      const upcoming = upcomingDeadlines(papers, 90, today).map((d) => ({ paper: d.paper.title, what: d.kind, date: d.date, in_days: d.days }));
      if (!review) return text({ today, upcoming, papers: out });
      const perCategory: Record<string, number> = {};
      for (const p of papers) {
        const y = yearlyCost(p);
        if (y != null && !p.ended) perCategory[`${p.category} (${p.currency})`] = (perCategory[`${p.category} (${p.currency})`] ?? 0) + y;
      }
      const missing = papers
        .filter((p) => !p.ended)
        .map((p) => ({
          paper: p.title,
          missing: [
            p.amount == null && "price",
            !p.renews_on && !p.expires_on && !p.warranty_until && "renewal or expiry date",
            p.renews_on && p.notice_days == null && p.period !== "month" && "notice period",
            !p.summary && "what it covers",
          ].filter(Boolean),
        }))
        .filter((x) => x.missing.length);
      return text({
        today,
        household: (members ?? []).map((m) => ({ name: m.name, adult: !!m.profile_id, age_months: m.birthdate ? ageInMonths(m.birthdate) : undefined })),
        yearly_cost_per_category: perCategory,
        upcoming,
        papers: out,
        incomplete: missing,
      });
    },
  );

  const paperFields = {
    category: z.enum(PAPER_CATEGORY_IDS).optional().describe(PAPER_CATEGORIES.map((c) => `${c.id} = ${c.label}`).join("; ")),
    provider: z.string().max(200).optional().describe("Company or authority, e.g. Folksam, Polisen"),
    reference: z.string().max(200).optional().describe("Policy, contract or document number"),
    covers: z.array(z.string()).optional().describe("First names of the family members it covers; empty = whole household"),
    amount: z.number().min(0).optional().describe("Price per period, or the price paid for a purchase"),
    currency: z.string().length(3).optional().describe("Default SEK"),
    period: z.enum(PERIOD_IDS).optional(),
    starts_on: z.string().optional().describe("YYYY-MM-DD"),
    renews_on: z.string().optional().describe("Next renewal or end of binding period, YYYY-MM-DD"),
    notice_days: z.number().int().min(0).max(730).optional().describe("Notice period (uppsägningstid) in days, 1 month = 30"),
    expires_on: z.string().optional().describe("Expiry of an ID or fixed-term contract, YYYY-MM-DD"),
    warranty_until: z.string().optional().describe("End of warranty, YYYY-MM-DD (Swedish reklamationsrätt: purchase + 3 years)"),
    summary: z.string().max(4000).optional().describe("What it covers, 3-6 short lines, in the user's language"),
    details: z.record(z.string(), z.string()).optional().describe('Key terms, e.g. {"Självrisk": "1 500 kr", "Reseskydd": "45 dagar"}'),
  };

  async function paperRow(f: { [K in keyof typeof paperFields]?: unknown } & { covers?: string[] }) {
    const row: Record<string, unknown> = {};
    for (const k of ["category", "provider", "reference", "amount", "period", "starts_on", "renews_on", "notice_days", "expires_on", "warranty_until", "summary", "details"] as const) {
      if (f[k] !== undefined) row[k] = f[k] === "" ? null : f[k];
    }
    if (typeof f.currency === "string") row.currency = f.currency.toUpperCase();
    if (f.covers) row.member_ids = await Promise.all(f.covers.map((n) => memberIdByName(n)));
    return row;
  }

  server.registerTool(
    "add_paper",
    {
      title: "Add a paper",
      description:
        "File a contract, insurance policy, receipt kept for the warranty or ID in the family's papers (Me → Papers). Read the document the user sent and fill every field you can; only use dates and amounts from the document. private = only the speaker sees it (their own work contract, pension…). The document itself can be attached in the app. Call get_papers first to avoid duplicates.",
      inputSchema: z.object({ title: z.string().min(1).max(200).describe("Short name, e.g. 'Home insurance'"), private: z.boolean().optional(), ...paperFields }),
    },
    async ({ title, private: priv, ...fields }) => {
      const db = createAdminClient();
      const { data: same } = await db.from("papers").select("id").eq("family_id", familyId()).ilike("title", title.trim()).eq("ended", false).limit(1);
      if (same?.length) throw new Error(`There is already a paper called "${title}". Use update_paper, or a more specific title.`);
      const { error } = await db.from("papers").insert({
        family_id: familyId(),
        profile_id: priv ? ownerId() : null,
        title: title.trim(),
        ...(await paperRow(fields)),
        created_by: createdBy(),
      });
      if (error) throw new Error(error.message);
      return text(`Added "${title}" to ${priv ? "your private papers" : "the family's papers"}. The PDF can be attached in the app (Me → Papers).`);
    },
  );

  server.registerTool(
    "update_paper",
    {
      title: "Update a paper",
      description:
        "Change a paper found by title (or id from get_papers): new price at renewal, new renewal date, notice period, coverage… details are merged with the existing ones. ended = cancelled or replaced (kept, no more reminders).",
      inputSchema: z.object({ paper: z.string().describe("Title or id"), title: z.string().min(1).max(200).optional(), ended: z.boolean().optional(), ...paperFields }),
    },
    async ({ paper, title, ended, ...fields }) => {
      const db = createAdminClient();
      const owner = mcpContext.getStore()?.profileId ?? null;
      let q = db.from("papers").select("id, title, details").eq("family_id", familyId());
      q = owner ? q.or(`profile_id.is.null,profile_id.eq.${owner}`) : q.is("profile_id", null);
      const { data } = await q;
      const rows = data ?? [];
      const n = paper.trim().toLowerCase();
      const hit = rows.find((r) => r.id === paper) ?? rows.find((r) => r.title.toLowerCase() === n) ?? rows.find((r) => r.title.toLowerCase().includes(n));
      if (!hit) throw new Error(`No paper called "${paper}". Papers: ${rows.map((r) => r.title).join(", ") || "none"}`);
      const row = await paperRow(fields);
      if (fields.details) row.details = { ...(hit.details as Record<string, string>), ...fields.details };
      if (title) row.title = title.trim();
      if (ended !== undefined) row.ended = ended;
      const { error } = await db.from("papers").update({ ...row, updated_at: new Date().toISOString() }).eq("id", hit.id).eq("family_id", familyId());
      if (error) throw new Error(error.message);
      return text(`Updated "${hit.title}": ${Object.keys(row).join(", ")}.`);
    },
  );

  server.registerTool(
    "add_expense",
    {
      title: "Log a shared expense",
      description:
        "Log something one adult paid for the family (Home → Expenses); the app keeps who owes whom. Split: the family's usual split by default (50/50 unless they set e.g. 60/40); split_among = only these people, equally; shares = an explicit split by first name, as percentages or amounts ({\"Guillaume\": 50, \"Jenny\": 39}). settlement = true logs a payback instead: paid_by gave the amount to the single person in split_among. Returns the new balance.",
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe("Short, e.g. 'Toilet paper', 'Plumber'"),
        amount: z.number().positive(),
        currency: z.string().length(3).optional().describe("Default SEK"),
        paid_by: z.string().optional().describe("First name; default the speaker"),
        split_among: z.array(z.string()).optional().describe("First names it was for, split equally; default the usual split between all adults"),
        shares: z.record(z.string(), z.number().min(0)).optional().describe("Uneven split by first name: percentages or amounts"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD, default today"),
        settlement: z.boolean().optional(),
      }),
    },
    async ({ title, amount, currency, paid_by, split_among, shares, date, settlement }) => {
      const db = createAdminClient();
      const { data: people } = await db.from("members").select("id, name, profile_id").eq("family_id", familyId());
      const adults = (people ?? []).filter((m) => m.profile_id);
      const owner = mcpContext.getStore()?.profileId;
      const payer = paid_by ? await memberIdByName(paid_by) : adults.find((m) => m.profile_id === owner)?.id;
      if (!payer) throw new Error(`Who paid? Adults: ${adults.map((m) => m.name).join(", ")}`);
      let weights: Record<string, number> | null = null;
      if (shares && !settlement) {
        weights = {};
        for (const [n, w] of Object.entries(shares)) weights[(await memberIdByName(n)) as string] = w;
      } else if (!split_among?.length && !settlement) {
        // The family's usual split (Expenses → Usual split); empty = equal.
        const { data: st } = await db.from("expense_settings").select("shares").eq("family_id", familyId()).maybeSingle();
        const usual = (st?.shares ?? {}) as Record<string, number>;
        if (Object.keys(usual).length && !isEqual(usual, adults.map((m) => m.id))) weights = usual;
      }
      const among = weights
        ? Object.keys(weights).filter((id) => weights![id] > 0)
        : split_among?.length
          ? await Promise.all(split_among.map((n) => memberIdByName(n) as Promise<string>))
          : adults.map((m) => m.id);
      if (!among.length) throw new Error("Nobody to split it between.");
      if (settlement && among.length !== 1) throw new Error("A payback goes to exactly one person: set split_among to them.");
      const { error } = await db.from("expenses").insert({
        family_id: familyId(),
        title: settlement ? "Paid back" : title.trim(),
        amount: Math.round(amount * 100) / 100,
        currency: (currency ?? "SEK").toUpperCase(),
        paid_by: payer,
        split_among: among,
        shares: weights,
        spent_on: date ?? workToday(),
        settlement: !!settlement,
        created_by: createdBy(),
      });
      if (error) throw new Error(error.message);
      const { data: all } = await db.from("expenses").select("amount, currency, paid_by, split_among, shares").eq("family_id", familyId());
      const name = (id: string) => (people ?? []).find((m) => m.id === id)?.name ?? "?";
      const owes = settleUp(all ?? []).map((x) => `${name(x.from)} owes ${name(x.to)} ${x.amount} ${x.currency}`);
      return text(`Logged. Balance: ${owes.join("; ") || "all square"}.`);
    },
  );

  server.registerTool(
    "get_expenses",
    {
      title: "Shared expenses and who owes whom",
      description: "The balance between the adults (who owes whom, to settle up) and the shared expenses of the last `days` days (default 60).",
      inputSchema: z.object({ days: z.number().int().min(1).max(730).optional() }),
    },
    async ({ days }) => {
      const db = createAdminClient();
      const [{ data: people }, { data: all }] = await Promise.all([
        db.from("members").select("id, name").eq("family_id", familyId()),
        db.from("expenses").select("title, amount, currency, paid_by, split_among, shares, spent_on, settlement").eq("family_id", familyId()).order("spent_on", { ascending: false }),
      ]);
      const name = (id: string) => (people ?? []).find((m) => m.id === id)?.name ?? "?";
      const since = new Date(Date.now() - (days ?? 60) * 86400000).toISOString().slice(0, 10);
      return text({
        owes: settleUp(all ?? []).map((x) => ({ from: name(x.from), to: name(x.to), amount: x.amount, currency: x.currency })),
        expenses: (all ?? [])
          .filter((e) => e.spent_on >= since)
          .map((e) => ({
            date: e.spent_on,
            title: e.settlement ? `${name(e.paid_by)} paid ${name(e.split_among[0])} back` : e.title,
            amount: Number(e.amount),
            currency: e.currency,
            paid_by: name(e.paid_by),
            for: e.split_among.map(name),
            split: e.shares ? Object.fromEntries(Object.entries(e.shares as Record<string, number>).map(([id, w]) => [name(id), w])) : "equal",
          })),
      });
    },
  );
}
