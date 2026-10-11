import { z } from "zod";
import { aiEnabled, BudgetExceededError, extract } from "@/lib/ai";
import { PAPER_CATEGORIES, PAPER_CATEGORY_IDS, PERIOD_IDS } from "@/lib/papers";
import { getSession } from "@/lib/session";

const day = () => z.string().nullable().describe("YYYY-MM-DD, or null if not in the document");

const Paper = z.object({
  category: z.enum(PAPER_CATEGORY_IDS).describe(PAPER_CATEGORIES.map((c) => `${c.id} = ${c.label}`).join("; ")),
  title: z.string().describe("Short name the family would use, e.g. 'Home insurance', 'Charlie's passport', 'Dishwasher'"),
  provider: z.string().nullable().describe("Company or authority, e.g. 'Folksam', 'Polisen', 'Elgiganten'"),
  reference: z.string().nullable().describe("Policy, contract, customer or document number"),
  covers: z.array(z.string()).describe("First names of the family members it covers or concerns; empty = the whole household"),
  amount: z.number().nullable().describe("Price per period (premium, monthly fee) or the price paid for a receipt"),
  currency: z.string().nullable().describe("ISO code, e.g. SEK, EUR"),
  period: z.enum(PERIOD_IDS).nullable().describe("How often the amount is paid; once for a purchase"),
  starts_on: day(),
  renews_on: day().describe("Next renewal or end of the binding period (YYYY-MM-DD), or null"),
  notice_days: z.number().int().nullable().describe("Notice period (uppsägningstid) in days, e.g. 1 month = 30"),
  expires_on: day().describe("Expiry of an ID or a fixed-term contract (YYYY-MM-DD), or null"),
  warranty_until: day().describe("End of warranty for a purchase (YYYY-MM-DD), or null"),
  summary: z.string().describe("3 to 6 short lines: what it covers or is for, and the limits that matter"),
  details: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe("Key terms worth comparing later: deductible (självrisk), coverage amounts, binding period, price changes, exclusions"),
});

const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const LANGUAGES = { en: "English", fr: "French", sv: "Swedish" } as const;

// A contract, policy, ID or receipt (PDF or photo) → fields to review before saving.
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "not configured" }, { status: 501 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return Response.json({ error: "too large" }, { status: 413 });
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const image = IMAGES.find((t) => t === file.type);
  if (!image && file.type !== "application/pdf") return Response.json({ error: "Use a PDF or a photo." }, { status: 400 });

  const { data: members } = await session.supabase.from("members").select("name");
  const names = (members ?? []).map((m) => m.name).join(", ");
  const language = LANGUAGES[session.profile.locale] ?? "English";

  try {
    const paper = await extract(
      { familyId: session.profile.family_id, profileId: session.profile.id, feature: "paper" },
      Paper,
      `You read a family's paperwork (often Swedish: insurance policies, electricity and phone contracts, loans, IDs, receipts kept for the warranty) and file it.
Family members: ${names || "unknown"}. Today is ${new Date().toISOString().slice(0, 10)}.
Only use dates and amounts that are in the document. For a purchase receipt, warranty_until = the stated warranty, else the purchase date + 3 years (Swedish reklamationsrätt).
Write title, summary and detail labels in ${language}; keep provider names and Swedish terms (självrisk, uppsägningstid) as they are when useful.`,
      [
        { file: { mimeType: image ?? "application/pdf", data } },
        { text: "File this document." },
      ],
    );
    return Response.json(paper);
  } catch (e) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message, budget: true }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
