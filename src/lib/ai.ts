import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_MONTHLY_LIMIT_USD, monthStart } from "@/lib/ai-budget";

// In-app AI features (receipt scan, "add in plain words", reading papers) need
// an Anthropic or a Gemini API key on the server, and the service-role key to
// meter them against the family's budget; without both the app hides them.
// Anthropic wins when both keys are set.
type Provider = "anthropic" | "gemini";
const provider = (): Provider | null =>
  process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.GEMINI_API_KEY ? "gemini" : null;

export const aiEnabled = () =>
  Boolean(provider() && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));

// The cheapest models: in-app calls are small extractions (a receipt, one
// sentence → an event). Advice (sleep, meals) comes from the family's own
// Claude through the connector, which costs Hembrain nothing.
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// $ per million tokens (input, output). Claude cache reads cost 0.1× input,
// cache writes 1.25×; Gemini thinking tokens are billed as output. A model
// missing here is priced high, to stay on the safe side.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "gemini-3.6-flash": [1.5, 7.5],
  "gemini-3.8-flash": [1.5, 7.5],
};
const UNKNOWN_PRICE: [number, number] = [5, 25];

let anthropic: Anthropic | null = null;
let gemini: GoogleGenAI | null = null;

// Who pays for a call: the family's monthly budget (ai_budgets, 0020).
export type AiCaller = { familyId: string; profileId: string; feature: string };

// What a call reads: text, or a photo / PDF as base64.
export type AiPart = { text: string } | { file: { mimeType: string; data: string } };

type Usage = { input: number; output: number; cost: number };

// Thrown before calling the model when the family's month is used up.
export class BudgetExceededError extends Error {
  constructor() {
    super("This month's AI budget is used up. It resets on the 1st.");
  }
}

async function assertBudget(familyId: string) {
  const admin = createAdminClient();
  const [{ data: budget }, { data: rows }] = await Promise.all([
    admin.from("ai_budgets").select("monthly_limit_usd").eq("family_id", familyId).maybeSingle(),
    admin.from("ai_usage").select("cost_usd").eq("family_id", familyId).gte("created_at", monthStart().toISOString()),
  ]);
  const limit = budget ? Number(budget.monthly_limit_usd) : FREE_MONTHLY_LIMIT_USD;
  const spent = (rows ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0);
  if (spent >= limit) throw new BudgetExceededError();
}

async function logUsage(caller: AiCaller, model: string, usage: Usage) {
  await createAdminClient().from("ai_usage").insert({
    family_id: caller.familyId,
    profile_id: caller.profileId,
    feature: caller.feature,
    model,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cost_usd: usage.cost,
  });
}

async function callAnthropic<S extends z.ZodType>(schema: S, system: string, parts: AiPart[]) {
  anthropic ??= new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = parts.map((p) =>
    "text" in p
      ? { type: "text", text: p.text }
      : p.file.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.file.data } }
        : {
            type: "image",
            source: { type: "base64", media_type: p.file.mimeType as "image/jpeg", data: p.file.data },
          },
  );
  const response = await anthropic.beta.messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    output_config: { format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content }],
  });
  const u = response.usage;
  const [inPrice, outPrice] = PRICES[response.model] ?? UNKNOWN_PRICE;
  const written = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const usage: Usage = {
    input: u.input_tokens + written + read,
    output: u.output_tokens,
    cost: (u.input_tokens * inPrice + written * inPrice * 1.25 + read * inPrice * 0.1 + u.output_tokens * outPrice) / 1_000_000,
  };
  const output = () => {
    if (response.stop_reason === "refusal") throw new Error("The AI declined this request.");
    if (response.parsed_output == null) throw new Error("The AI's answer could not be read.");
    return response.parsed_output as z.infer<S>;
  };
  return { model: response.model, usage, output };
}

// Gemini reads a subset of JSON Schema; the "$schema" header is not part of it.
function jsonSchema(schema: z.ZodType) {
  const json: Record<string, unknown> = z.toJSONSchema(schema);
  delete json.$schema;
  return json;
}

async function callGemini<S extends z.ZodType>(schema: S, system: string, parts: AiPart[]) {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: parts.map((p) => ("text" in p ? { text: p.text } : { inlineData: p.file })) }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema(schema),
      maxOutputTokens: 16000,
    },
  });
  const u = response.usageMetadata;
  const [inPrice, outPrice] = PRICES[GEMINI_MODEL] ?? UNKNOWN_PRICE;
  const input = u?.promptTokenCount ?? 0;
  const out = (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
  const usage: Usage = { input, output: out, cost: (input * inPrice + out * outPrice) / 1_000_000 };
  const output = () => {
    const text = response.text;
    if (!text) throw new Error("The AI declined this request.");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("The AI's answer could not be read.");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new Error("The AI's answer could not be read.");
    return parsed.data as z.infer<S>;
  };
  return { model: response.modelVersion || GEMINI_MODEL, usage, output };
}

// One structured-output call: returns data matching `schema`, or throws.
// Refused up front when the caller's family is over its monthly budget.
export async function extract<S extends z.ZodType>(
  caller: AiCaller,
  schema: S,
  system: string,
  parts: AiPart[],
): Promise<z.infer<S>> {
  await assertBudget(caller.familyId);
  const call = provider() === "gemini" ? callGemini : callAnthropic;
  const { model, usage, output } = await call(schema, system, parts);
  // Logging must not lose the answer the family already paid for.
  await logUsage(caller, model, usage).catch((e) => console.error("ai_usage", e));
  return output();
}
