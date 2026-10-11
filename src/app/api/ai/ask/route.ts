import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aiEnabled, BudgetExceededError, extract } from "@/lib/ai";
import { callTool } from "@/lib/mcp/call-tool";
import type { McpContext } from "@/lib/mcp/context";
import { stockholmToUtc, utcToStockholm } from "@/lib/mcp/time";
import { createAdminClient } from "@/lib/supabase/admin";
import { dinnerData, todayBrief, todoBrief, weekBrief } from "@/lib/hem-brief";
import { getSession } from "@/lib/session";

const Answer = z.object({
  headline: z.string().describe("Your answer as one short spoken sentence, e.g. 'I'd put him to bed around 19:15.'"),
  details: z.array(z.string()).describe("2 or 3 bullet points of at most 12 words each: the reason, with a real time, date or name"),
});

// Mirrors `AskTopic` in src/components/ask-hem.tsx.
const ASK_TOPICS = [
  "bedtime", "nap", "kid_food", "dinner", "today",
  "week", "todo", "shopping", "recipes", "purchases",
  "kid_week", "preschool", "wardrobe", "brain", "papers", "travels", "expenses", "work",
] as const;
type Topic = (typeof ASK_TOPICS)[number];
// What each conversation is about, so a typed message stays on it.
const SUBJECTS: Record<Topic, string> = {
  bedtime: "the kid's sleep",
  nap: "the kid's sleep",
  kid_food: "what the kid eats",
  dinner: "what to cook and eat",
  today: "the family's day and what needs doing",
  week: "the family's week and calendar",
  todo: "the family's to-dos",
  shopping: "the shopping list",
  recipes: "the family's recipes and what to cook",
  purchases: "what the family buys and what runs out",
  kid_week: "how the kid is doing (sleep, food, clothes)",
  preschool: "the kid's preschool drop-offs and pick-ups",
  wardrobe: "the kid's clothes and sizes",
  brain: "the family's notes and dates to remember",
  papers: "the family's contracts, insurance and papers",
  travels: "the family's travels and trip ideas",
  expenses: "the family's shared expenses",
  work: "their work to-dos, people and meetings",
};
// A conversation per topic and day stays short: the budget is shared by the family.
const DAILY_MESSAGES = 6;
type Exchange = { q: string; a: string };

const LANGUAGES = { en: "English", fr: "French (tutoie, ton complice)", sv: "Swedish" } as const;

type Ctx = { kid: string; evening: boolean };
type Tool = [string, Record<string, unknown>];
type Data = (supabase: SupabaseClient, ctx: McpContext, c: Ctx & { kidId: string }) => Promise<string>;

// What Hem is asked for each question, which connector tools it reads first, and
// the facts worked out beforehand (`data`) where a small model would misread raw rows.
const QUESTIONS: Record<Topic, { tools?: (c: Ctx) => Tool[]; data?: Data; ask: (c: Ctx) => string; kid?: true }> = {
  bedtime: {
    kid: true,
    tools: ({ kid }) => [["get_kid_sleep", { kid }]],
    ask: ({ kid }) =>
      `When should ${kid} go to bed tonight? Answer from the last days (wake-up time, nap length and end, awake time since the last nap, wakings) and the usual needs for ${kid}'s age; give a concrete time and say why.`,
  },
  nap: {
    kid: true,
    tools: ({ kid }) => [["get_kid_sleep", { kid }]],
    ask: ({ kid }) =>
      `And tomorrow's nap(s) for ${kid}: when should they start and how long, given the last days and ${kid}'s age? Give concrete times.`,
  },
  kid_food: {
    kid: true,
    tools: ({ kid }) => [["get_meals", { who: kid, days: 14 }]],
    ask: ({ kid }) =>
      `What should ${kid} eat tonight? Use what ${kid} loves and refuses, balance ${kid}'s week, and fit ${kid}'s age. Give 2 or 3 concrete ideas.`,
  },
  dinner: {
    data: (supabase, ctx) => dinnerData(supabase, ctx),
    ask: () =>
      `What should we cook tonight? Suggest 2 or 3 dinners that balance the last two weeks: fill the food groups that were missing or rare (fish, legumes, vegetables…), and avoid what was eaten in the last days. Use a saved recipe when one fits, otherwise a simple idea.`,
  },
  today: {
    data: async (supabase, ctx, { evening }) => {
      const brief = await todayBrief(supabase, ctx, evening);
      return `## the family's facts for ${evening ? "tomorrow" : "today"} (${brief.focus}), already worked out\n${brief.text}`;
    },
    ask: ({ evening }) =>
      `What's up ${evening ? "tomorrow" : "today"}? The app already shows the events, so don't read them back. Say what needs doing or deciding: a drop-off or pick-up NOBODY has confirmed (say who could), late or due to-dos, a birthday to wish, a contract deadline, a clash. If nothing needs doing, say it's a calm day, warmly.`,
  },
  week: {
    tools: () => [["get_family_context", {}]],
    data: async (supabase, ctx) => `## the next 7 days, already worked out\n${await weekBrief(supabase, ctx)}`,
    ask: () =>
      `How does the next 7 days look? Don't read the calendar back. Point out what needs sorting: a drop-off or pick-up NOBODY has confirmed, a clash, an overloaded day, something to prepare ahead (a gift, packing, a booking). If the week is calm, say so warmly.`,
  },
  todo: {
    data: async (supabase) => `## open to-dos\n${await todoBrief(supabase)}`,
    ask: () =>
      `Which to-dos should come first? Name the 1 to 3 to tackle now (late ones, then the ones due soon or quick to do), and say if some could be done together.`,
  },
  shopping: {
    tools: () => [["plan_groceries", {}]],
    ask: () =>
      `Am I forgetting anything for the shopping? Compare what usually runs out or is due with what is already on the list, and name 2 to 4 items worth adding, with why. Don't name what is already on the list.`,
  },
  recipes: {
    tools: () => [["search_recipes", {}], ["get_meals", { days: 30 }]],
    ask: () =>
      `Which of the family's saved recipes should we make again soon? Pick 2 or 3: favourites or kid-friendly ones not eaten for a while, and ones that fill what the last weeks lacked. Only saved recipes; if there are none, say so and suggest saving a few.`,
  },
  purchases: {
    tools: () => [["get_restock_suggestions", { within_days: 14 }]],
    ask: () =>
      `What is about to run out, from how often the family buys it? Name the items and roughly when. If too little is logged to tell, say so and how to fix it (check items off the list, scan receipts).`,
  },
  kid_week: {
    kid: true,
    tools: ({ kid }) => [["get_kid_sleep", { kid }], ["get_meals", { who: kid, days: 7 }], ["get_wardrobe", { kid }]],
    ask: ({ kid }) =>
      `How is ${kid} doing this week? A quick check on ${kid}'s sleep, food and clothes, and the one thing worth acting on now.`,
  },
  preschool: {
    kid: true,
    data: async (supabase, ctx, { kidId }) => `## the next 7 days at preschool, already worked out\n${await weekBrief(supabase, ctx, kidId)}`,
    ask: ({ kid }) =>
      `Is ${kid}'s preschool week covered? Name every drop-off or pick-up NOBODY has confirmed and who could take it (look at who said they can, and the parents' other plans). If everything is covered, say so warmly.`,
  },
  wardrobe: {
    kid: true,
    tools: ({ kid }) => [["get_wardrobe", { kid }]],
    ask: ({ kid }) =>
      `What does ${kid} need now? Look at the season in Sweden (preschool is outdoors in all weather), what ${kid} has and needs, and the sizes; flag what will soon be too small.`,
  },
  brain: {
    tools: () => [["get_notes", {}], ["get_occasions", { days: 60 }]],
    ask: () =>
      `From the family's notes and dates: what is coming in the next weeks that needs preparing (a birthday present, an anniversary), and is a useful fact missing from the notes (preschool contact, allergies, the doctor…)?`,
  },
  papers: {
    tools: () => [["get_papers", { review: true }]],
    ask: () =>
      `Look over the family's papers: anything to cancel, renegotiate or renew soon, a warranty about to end, a contract that looks expensive or duplicated? Name the one to act on first, with its date.`,
  },
  travels: {
    tools: () => [["get_travels", {}], ["get_family_context", {}]],
    ask: () =>
      `Where could the family go next? Suggest 2 or 3 ideas: a country none of them has been to, or one a parent loved that the others haven't seen, easy with a small kid. Say why, with their real trips.`,
  },
  expenses: {
    tools: () => [["get_expenses", { days: 90 }]],
    ask: () =>
      `Where do we stand on shared expenses? Who owes whom and how much right now, and what the money went on lately. Short.`,
  },
  work: {
    tools: () => [["get_work", {}]],
    ask: () =>
      `What should I focus on at work? Name my first priorities, what has been waiting on someone else for a while (worth a nudge), and what to bring to my next meeting.`,
  },
};

// The "Ask Hem" questions: reads what the connector would read, then asks the in-app model.
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "not configured" }, { status: 501 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { topic, kidId, previous, message, history } = (await req.json()) as {
    topic?: Topic;
    kidId?: string;
    previous?: string[];
    message?: string; // typed (or dictated) by the user instead of the suggested question
    history?: Exchange[];
  };
  if (!topic || !ASK_TOPICS.includes(topic)) return Response.json({ error: "unknown topic" }, { status: 400 });
  const typed = message?.trim().slice(0, 300) || null;

  const since = stockholmToUtc(utcToStockholm(new Date().toISOString()).slice(0, 10));
  const { count } = await createAdminClient()
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", session.profile.id)
    .eq("feature", `ask_${topic}`)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_MESSAGES) return Response.json({ error: "enough for today", limit: true }, { status: 429 });
  const q = QUESTIONS[topic];

  let kid = "";
  if (q.kid) {
    const { data } = await session.supabase.from("members").select("name").eq("id", kidId ?? "").is("profile_id", null).maybeSingle();
    if (!data) return Response.json({ error: "no kid" }, { status: 400 });
    kid = data.name;
  }

  const name = session.profile.display_name || null;
  const ctx = { familyId: session.profile.family_id, familyName: null, speaker: name, profileId: session.profile.id };
  const now = utcToStockholm(new Date().toISOString());
  const evening = Number(now.slice(11, 13)) >= 17;
  const language = LANGUAGES[session.profile.locale] ?? "English";

  try {
    const tools = await Promise.all((q.tools?.({ kid, evening }) ?? []).map(async ([tool, args]) => `## ${tool}\n${await callTool(ctx, tool, args)}`));
    if (q.data) tools.push(await q.data(session.supabase, ctx, { kid, evening, kidId: kidId ?? "" }));
    const again = previous?.length && !typed ? `\nYou already suggested: ${previous.slice(-3).join(" / ")}. Suggest something different.` : "";
    const before = (history ?? [])
      .slice(-2)
      .map((x) => `${name ?? "They"}: ${x.q.slice(0, 300)}\nHem: ${x.a.slice(0, 600)}`)
      .join("\n");
    const ask = typed
      ? `${before ? `The conversation so far:\n${before}\n\n` : `Context: ${q.ask({ kid, evening })}\n\n`}${name ?? "They"} now says: "${typed}"
Answer that, about ${SUBJECTS[topic]} only. If it is about something else, say kindly in the headline that here you only help with ${SUBJECTS[topic]} and that they can ask you anything in Claude; then no bullets.`
      : q.ask({ kid, evening }) + again;
    const answer = await extract(
      { familyId: session.profile.family_id, profileId: session.profile.id, feature: `ask_${topic}` },
      Answer,
      `You are Hem, the family's assistant in the Hembrain app, talking with ${name ?? "a parent"} like a friend who knows the family well. Write in ${language}.
Speak in the first person ("I'd…", "I see…") and to ${name ?? "them"} directly. Warm, natural and brief, never robotic: no "Here is", no data read back. The headline is what you'd say out loud; each bullet is a short reason ("Nap ended at 14:10", "No fish this week").
Base what you say on the family's data below (quote the real times, dates and names) and on general knowledge; if little is logged, say your advice is rough.
Now (Europe/Stockholm): ${now}.

${tools.join("\n\n").slice(0, 30000)}`,
      [{ text: ask }],
    );
    return Response.json(answer);
  } catch (e) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message, budget: true }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
