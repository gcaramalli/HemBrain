import { z } from "zod";
import { aiEnabled, BudgetExceededError, extract } from "@/lib/ai";
import { callTool } from "@/lib/mcp/call-tool";
import { utcToStockholm } from "@/lib/mcp/time";
import { dinnerData, todayBrief } from "@/lib/hem-brief";
import { getSession } from "@/lib/session";

const Answer = z.object({
  headline: z.string().describe("Your answer as one short spoken sentence, e.g. 'I'd put him to bed around 19:15.'"),
  details: z.array(z.string()).describe("2 or 3 bullet points of at most 12 words each: the reason, with a real time, date or name"),
});

const ASK_TOPICS = ["bedtime", "nap", "kid_food", "dinner", "today"] as const;
type Topic = (typeof ASK_TOPICS)[number];
const LANGUAGES = { en: "English", fr: "French (tutoie, ton complice)", sv: "Swedish" } as const;

type Ctx = { kid: string; evening: boolean };
type Tool = [string, Record<string, unknown>];

// What Hem is asked for each question, and which connector tools it reads first.
const QUESTIONS: Record<Topic, { tools?: (c: Ctx) => Tool[]; ask: (c: Ctx) => string; kid?: true }> = {
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
    ask: () =>
      `What should we cook tonight? Suggest 2 or 3 dinners that balance the last two weeks: fill the food groups that were missing or rare (fish, legumes, vegetables…), and avoid what was eaten in the last days. Use a saved recipe when one fits, otherwise a simple idea.`,
  },
  today: {
    ask: ({ evening }) =>
      `What's up ${evening ? "tomorrow" : "today"}? The app already shows the events, so don't read them back. Say what needs doing or deciding: a drop-off or pick-up NOBODY has confirmed (say who could), late or due to-dos, a birthday to wish, a contract deadline, a clash. If nothing needs doing, say it's a calm day, warmly.`,
  },
};

// The "Ask Hem" questions: reads what the connector would read, then asks the in-app model.
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "not configured" }, { status: 501 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { topic, kidId, previous } = (await req.json()) as { topic?: Topic; kidId?: string; previous?: string[] };
  if (!topic || !ASK_TOPICS.includes(topic)) return Response.json({ error: "unknown topic" }, { status: 400 });
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
    if (topic === "dinner") tools.push(await dinnerData(session.supabase, ctx));
    if (topic === "today") {
      const brief = await todayBrief(session.supabase, ctx, evening);
      tools.push(`## the family's facts for ${evening ? "tomorrow" : "today"} (${brief.focus}), already worked out\n${brief.text}`);
    }
    const again = previous?.length ? `\nYou already suggested: ${previous.slice(-3).join(" / ")}. Suggest something different.` : "";
    const answer = await extract(
      { familyId: session.profile.family_id, profileId: session.profile.id, feature: `ask_${topic}` },
      Answer,
      `You are Hem, the family's assistant in the Hembrain app, talking with ${name ?? "a parent"} like a friend who knows the family well. Write in ${language}.
Speak in the first person ("I'd…", "I see…") and to ${name ?? "them"} directly. Warm, natural and brief, never robotic: no "Here is", no data read back. The headline is what you'd say out loud; each bullet is a short reason ("Nap ended at 14:10", "No fish this week").
Base what you say on the family's data below (quote the real times, dates and names) and on general knowledge; if little is logged, say your advice is rough.
Now (Europe/Stockholm): ${now}.

${tools.join("\n\n").slice(0, 30000)}`,
      [{ text: q.ask({ kid, evening }) + again }],
    );
    return Response.json(answer);
  } catch (e) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message, budget: true }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
