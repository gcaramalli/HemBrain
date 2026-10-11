import { z } from "zod";
import { aiEnabled, BudgetExceededError, extract } from "@/lib/ai";
import { getSession } from "@/lib/session";

const Draft = z.object({
  title: z.string().describe("Short title, e.g. 'Pick up Charlie'"),
  start: z.string().describe("Local time YYYY-MM-DDTHH:MM, or YYYY-MM-DD for an all-day event"),
  end: z.string().nullable().describe("Local time, same format as start, or null"),
  all_day: z.boolean(),
  location: z.string().nullable(),
  responsible: z.string().nullable().describe("First name of who does it, from the family list"),
  for_whom: z.string().nullable().describe("First name of who it is about, from the family list"),
  care: z.enum(["dropoff", "pickup"]).nullable().describe("Taking a child to / fetching a child from preschool or school"),
  repeats: z.enum(["daily", "weekdays", "weekly", "biweekly", "monthly"]).nullable(),
});

// "Jenny picks up Charlie Thursday 16:00" → a pre-filled event form.
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "not configured" }, { status: 501 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { text, now } = (await req.json()) as { text?: string; now?: string };
  if (!text?.trim() || text.length > 500) return Response.json({ error: "empty" }, { status: 400 });

  const [{ data: members }, { data: notes }] = await Promise.all([
    session.supabase.from("members").select("name, profile_id, dropoff_time, pickup_time, care_place"),
    session.supabase.from("notes").select("title, body").eq("pinned", true).limit(10),
  ]);
  const me = members?.find((m) => m.profile_id === session.profile.id)?.name ?? session.profile.display_name;
  const family = (members ?? [])
    .map((m) =>
      m.profile_id
        ? `${m.name} (parent)`
        : `${m.name} (child; usual drop-off ${m.dropoff_time?.slice(0, 5) ?? "?"}, pick-up ${m.pickup_time?.slice(0, 5) ?? "?"}${m.care_place ? `, at ${m.care_place}` : ""})`,
    )
    .join("; ");

  try {
    const draft = await extract(
      { familyId: session.profile.family_id, profileId: session.profile.id, feature: "event" },
      Draft,
      `You turn one sentence into a family calendar event. The family: ${family}. The person typing is ${me}; "I"/"me"/"je"/"jag" means ${me}.
Times are the family's local time (Europe/Stockholm). Resolve relative dates ("Thursday", "tomorrow", "demain", "på torsdag") to the next matching date from now. If no time is given for a drop-off or pick-up, use the child's usual time. Give timed events an end (30 minutes for drop-off/pick-up, 1 hour otherwise) unless one is stated. Use first names exactly as listed. Write the title in the language the sentence is written in.
Family notes: ${(notes ?? []).map((n) => `${n.title}: ${n.body}`).join(" | ").slice(0, 2000) || "none"}`,
      [{ text: `Now: ${now ?? new Date().toISOString()}\n\n${text.trim()}` }],
    );
    return Response.json(draft);
  } catch (e) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message, budget: true }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
