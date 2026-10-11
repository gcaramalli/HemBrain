"use client";

import { useState } from "react";
import { useFamily } from "./family-context";
import { ThinkingDots } from "./thinking-dots";

type Answer = { headline: string; details: string[] };

// "Ask Hem" button: the in-app model reads the family's data (as the connector
// would) and answers here. Without an AI key on the server, `hint` says to ask
// Hem from Claude or ChatGPT instead.
export function AskHem({ topic, kidId, question, hint }: { topic: "bedtime" | "kid_food" | "dinner"; kidId?: string; question: string; hint: string }) {
  const { ai, t } = useFamily();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!ai) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm">
        <span className="mt-1.5 shrink-0"><ThinkingDots size={6} still /></span>
        <span>{hint}</span>
      </p>
    );
  }

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, kidId }) });
      if (res.status === 402) setError(t("This month's AI budget is used up. It resets on the 1st."));
      else if (!res.ok) setError(t("Hem couldn't answer right now. Try again in a moment."));
      else setAnswer(await res.json());
    } catch {
      setError(t("Hem couldn't answer right now. Try again in a moment."));
    }
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm">
      <button className="flex items-center gap-2 text-left font-medium" onClick={ask} disabled={busy}>
        <span className="shrink-0"><ThinkingDots size={6} still={!busy} label={busy ? t("Hem is thinking") : undefined} /></span>
        <span>{answer ? t("Ask again") : question}</span>
      </button>
      {error && <p className="text-muted">{error}</p>}
      {answer && !busy && (
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">{answer.headline}</p>
          <ul className="list-disc pl-5">
            {answer.details.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
