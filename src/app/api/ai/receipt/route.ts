import { z } from "zod";
import { aiEnabled, BudgetExceededError, extract } from "@/lib/ai";
import { getSession } from "@/lib/session";

const Receipt = z.object({
  store: z.string().nullable(),
  date: z.string().nullable().describe("Purchase date YYYY-MM-DD, or null if unreadable"),
  items: z.array(
    z.object({
      name: z.string().describe("Plain item name the family would use, e.g. 'Milk' rather than 'MELLANMJ 1,5%'"),
      quantity: z.string().nullable(),
      price: z.number().nullable().describe("Line total in the receipt's currency"),
    }),
  ),
});

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

// Photo of a receipt → items to review before logging them as purchases.
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "not configured" }, { status: 501 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) return Response.json({ error: "no photo" }, { status: 400 });
  const mediaType = TYPES.find((t) => t === file.type);
  if (!mediaType) return Response.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Photo too large (max 5 MB)." }, { status: 400 });

  // The family's usual names, so "MELLANMJ" becomes the "Milk" they already track.
  const [{ data: bought }, { data: listed }] = await Promise.all([
    session.supabase.from("purchases").select("item_name").order("purchased_at", { ascending: false }).limit(300),
    session.supabase.from("list_items").select("title").order("created_at", { ascending: false }).limit(300),
  ]);
  const known = [...new Set([...(bought ?? []).map((b) => b.item_name), ...(listed ?? []).map((l) => l.title)])].slice(0, 300);

  try {
    const receipt = await extract(
      { familyId: session.profile.family_id, profileId: session.profile.id, feature: "receipt" },
      Receipt,
      `You read grocery receipts (often Swedish: ICA, Coop, Willys, Lidl) and list what was bought.
Skip non-items: totals, VAT/moms, discounts/rabatt, deposits/pant, bag fees, payment lines. Merge a discount into its item's price.
Name each item the way the family already does when it is the same product. Their usual names: ${known.join(", ") || "none yet"}.
Otherwise use a short plain name in the language of those usual names (English if there are none).`,
      [
        { file: { mimeType: mediaType, data: Buffer.from(await file.arrayBuffer()).toString("base64") } },
        { text: "List the items on this receipt." },
      ],
    );
    return Response.json(receipt);
  } catch (e) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message, budget: true }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
