"use client";

import { useEffect, useRef, useState } from "react";
import { useFamily } from "./family-context";
import { ThinkingDots } from "./thinking-dots";

export type AskTopic = "bedtime" | "nap" | "kid_food" | "dinner" | "today";
type Answer = { headline: string; details: string[] };
type Turn = { question: string; answer: Answer; at: string };

// The brand mark as Hem's face: the three dots on night blue.
export function HemAvatar({ thinking }: { thinking?: boolean }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#111722", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.08)" }} aria-hidden>
      <ThinkingDots size={5} still={!thinking} />
    </span>
  );
}

function HemBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="hem-in flex items-end gap-2">
      <HemAvatar />
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-sm" style={{ boxShadow: "var(--lift)" }}>
        {children}
      </div>
    </div>
  );
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Today's part of the day, so a cached answer goes stale at noon and in the evening.
function period(per: "day" | "part") {
  const d = new Date();
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  if (per === "day") return day;
  const h = d.getHours();
  return `${day}-${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}`;
}

function load(key: string): Turn[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as Turn[];
  } catch {
    return [];
  }
}

function save(key: string, turns: Turn[]) {
  try {
    localStorage.setItem(key, JSON.stringify(turns.slice(-3)));
  } catch {
    // Private mode: the answer just won't be remembered.
  }
}

// A little conversation with Hem: Hem offers, you tap the question in your own
// words, Hem thinks (the bouncing dots) and answers line by line. The day's
// answers stay on this device, so coming back shows what Hem said earlier.
// Without an AI key on the server, `hint` says to ask Hem from Claude instead.
export function AskHem({
  topic,
  kidId,
  intro,
  question,
  more,
  hint,
  per = "day",
  fold,
}: {
  topic: AskTopic;
  kidId?: string;
  intro: string;
  question: string;
  more?: { label: string; topic?: AskTopic };
  hint: string;
  per?: "day" | "part";
  // Answers from an earlier visit come back folded to their first line (Home).
  fold?: boolean;
}) {
  const { ai, t, profile } = useFamily();
  const key = `hem:${profile.id}:${topic}:${kidId ?? ""}:${period(per)}`;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [earlier, setEarlier] = useState(0); // how many turns came from an earlier visit
  const [asking, setAsking] = useState<string | null>(null);
  const [shown, setShown] = useState(Infinity); // lines of the last answer revealed so far
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const saved = load(key);
    setTurns(saved);
    setEarlier(saved.length);
    return () => {
      alive.current = false;
    };
  }, [key]);

  if (!ai) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm">
        <span className="mt-1.5 shrink-0"><ThinkingDots size={6} still /></span>
        <span>{hint}</span>
      </p>
    );
  }

  async function ask(q: string, which: AskTopic) {
    setAsking(q);
    setError(null);
    const started = Date.now();
    let answer: Answer | null = null;
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: which, kidId, previous: turns.map((x) => x.answer.headline) }),
      });
      if (res.status === 402) setError(t("I've used up this month's budget. I'll be back on the 1st."));
      else if (!res.ok) setError(t("Sorry, I couldn't think straight just now. Try me again in a moment?"));
      else answer = (await res.json()) as Answer;
    } catch {
      setError(t("Sorry, I couldn't think straight just now. Try me again in a moment?"));
    }
    // Hem takes a breath before answering: a fast model shouldn't feel like a form.
    const quick = reducedMotion();
    if (!quick) await wait(Math.max(0, 1200 + Math.random() * 600 - (Date.now() - started)));
    if (!alive.current) return;
    setAsking(null);
    if (!answer) return;
    const next = [...turns, { question: q, answer, at: new Date().toISOString() }];
    setTurns(next);
    save(key, next);
    if (quick) return setShown(Infinity);
    // Then the answer comes line by line, as if typed.
    for (let i = 1; i <= answer.details.length + 1; i++) {
      setShown(i);
      await wait(i === 1 ? 450 : 260);
      if (!alive.current) return;
    }
    setShown(Infinity);
  }

  const last = turns.length - 1;
  const busy = asking !== null || (shown !== Infinity && turns.length > 0);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(profile.locale, { hour: "2-digit", minute: "2-digit" });

  if (fold && !open && earlier > 0 && turns.length === earlier && asking === null) {
    const turn = turns[last];
    return (
      <button onClick={() => setOpen(true)} className="hem-in flex items-end gap-2 text-left" aria-expanded={false}>
        <HemAvatar />
        <span className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-sm" style={{ boxShadow: "var(--lift)" }}>
          <span className="block text-xs text-muted">{t("Earlier, at {time}", { time: time(turn.at) })}</span>
          <span className="font-semibold">{turn.answer.headline}</span> <span className="text-muted">{t("More")} ›</span>
        </span>
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <HemBubble>{intro}</HemBubble>

      {turns.map((turn, i) => {
        const lines = i === last ? shown : Infinity;
        return (
          <div key={turn.at} className="flex flex-col gap-2">
            {i === 0 && earlier > 0 && <p className="text-center text-xs text-muted">{t("Earlier, at {time}", { time: time(turn.at) })}</p>}
            {i === earlier && earlier > 0 && i > 0 && <p className="text-center text-xs text-muted">{t("Now")}</p>}
            <MyBubble text={turn.question} />
            <HemBubble>
              <p className="font-semibold">{turn.answer.headline}</p>
              {lines > 1 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {turn.answer.details.slice(0, lines - 1).map((d) => (
                    <li key={d} className="hem-in flex gap-2">
                      <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-muted" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </HemBubble>
          </div>
        );
      })}

      {asking !== null && (
        <>
          <MyBubble text={asking} />
          {/* Hem's face is the dots: they bounce while Hem thinks, no second set in a bubble. */}
          <div className="hem-in flex items-center gap-2" role="status" aria-label={t("Hem is thinking")}>
            <HemAvatar thinking />
          </div>
        </>
      )}

      {error && <HemBubble>{error}</HemBubble>}

      {!busy && (
        <div className="flex flex-wrap justify-end gap-2">
          {turns.length === 0 ? (
            <Chip onClick={() => ask(question, topic)}>{question}</Chip>
          ) : (
            more && <Chip onClick={() => ask(more.label, more.topic ?? topic)}>{more.label}</Chip>
          )}
          {turns.length > 0 && !more && <Chip onClick={() => ask(question, topic)}>{t("Ask again")}</Chip>}
        </div>
      )}
    </section>
  );
}

function MyBubble({ text }: { text: string }) {
  return (
    <div className="hem-in flex justify-end">
      <p className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background">{text}</p>
    </div>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="hem-in rounded-full border border-foreground/20 bg-surface px-4 py-2 text-sm font-medium" style={{ boxShadow: "var(--lift)" }}>
      {children}
    </button>
  );
}
