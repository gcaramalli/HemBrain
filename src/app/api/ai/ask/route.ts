import { z } from "zod";
import { aiEnabled, BudgetExceededError, extract } from "@/lib/ai";
import { callTool } from "@/lib/mcp/call-tool";
import { getSession } from "@/lib/session";

const Answer = z.object({
  headline: z.string().describe("The answer in one short line, e.g. 'Bed around 19:15' or 'Salmon with potatoes'"),
  details: z.array(z.string()).describe("2 to 4 short lines: why, and what to do"),
});

const TOPICS = ["bedtime", "kid_food", "dinner"] as const;
type Topic = (typeof TOPICS)[number];
const LANGUAGES = { en: "English", fr: "French (tutoie)", sv: "Swedish" } as const;

// What Hem is asked for each button, and which connector tools it reads first.
const QUESTIONS: Record<Topic, { tools: (kid: string) => [string, Record<string, unknown>][]; ask: (kid: string) => string }> = {
  bedtime: {
    tools: (kid) => [["get_kid_sleep", { kid }]],
    ask: (kid) =>
      `When should ${kid} go to bed tonight? Answer from the last days (wake-up time, nap length and end, awake time since the last nap, wakings) and the usual needs for ${kid}'s age; give a concrete time and say why.`,
  },
  kid_food: {
    tools: (kid) => [["get_meals", { who: kid, days: 14 }]],
    ask: (kid) =>
      `What should ${kid} eat tonight? Use what ${kid} loves and refuses, balance ${kid}'s week, and fit ${kid}'s age. Give 2 or 3 concrete ideas.`,
  },
  dinner: {
    tools: () => [["dinner_ideas", {}], ["get_restock_suggestions", {}]],
    ask: () =>
      `What should we cook tonight? Suggest 2 or 3 dinners: prefer favourites and recipes whose ingredients were bought recently, avoid what was eaten in the last days, and balance the week (fill the food groups it lacks). Say what is missing to buy.`,
  },
};

// The "Ask Hem" buttons: reads what the connector would read, then asks the in-app model.
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "not configured" }, { status: 501 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { topic, kidId } = (await req.json()) as { topic?: Topic; kidId?: string };
  if (!topic || !TOPICS.includes(topic)) return Response.json({ error: "unknown topic" }, { status: 400 });
  const q = QUESTIONS[topic];

  let kid = "";
  if (topic !== "dinner") {
    const { data } = await session.supabase.from("members").select("name").eq("id", kidId ?? "").is("profile_id", null).maybeSingle();
    if (!data) return Response.json({ error: "no kid" }, { status: 400 });
    kid = data.name;
  }

  const ctx = { familyId: session.profile.family_id, familyName: null, speaker: session.profile.display_name || null, profileId: session.profile.id };
  const now = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });
  const language = LANGUAGES[session.profile.locale] ?? "English";

  try {
    const data = await Promise.all(q.tools(kid).map(async ([name, args]) => `## ${name}\n${await callTool(ctx, name, args)}`));
    const answer = await extract(
      { familyId: session.profile.family_id, profileId: session.profile.id, feature: `ask_${topic}` },
      Answer,
      `You are Hem, the assistant of a family app, speaking to ${ctx.speaker ?? "a parent"}. Short, warm and concrete. Write in ${language}.
Only use the family's data below and general knowledge; if little is logged, say the advice is rough.
Now (Europe/Stockholm): ${now}.

${data.join("\n\n").slice(0, 30000)}`,
      [{ text: q.ask(kid) }],
    );
    return Response.json(answer);
  } catch (e) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message, budget: true }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
