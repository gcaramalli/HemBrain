"use client";

import { ArrowUp, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFamily } from "./family-context";
import { ThinkingDots } from "./thinking-dots";

export type AskTopic = "bedtime" | "nap" | "kid_food" | "dinner" | "today";
type Answer = { headline: string; details: string[] };
type Turn = { question: string; answer: Answer; at: string };

// The brand mark as Hem's face: the three dots on night blue (ringed so it
// still shows on the night-blue page in dark mode).
export function HemAvatar({ thinking }: { thinking?: boolean }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#111722", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.15)" }} aria-hidden>
      <ThinkingDots size={5} still={!thinking} />
    </span>
  );
}

// One of Hem's bubbles. Like in Messages, the avatar sits only by the last
// bubble of a run; the others keep its place.
function HemBubble({ children, avatar = true }: { children: React.ReactNode; avatar?: boolean }) {
  return (
    <div className="hem-in flex items-end gap-2">
      {avatar ? <HemAvatar /> : <span className="w-8 shrink-0" />}
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-surface px-4 py-2.5 text-[15px] leading-snug" style={{ boxShadow: "var(--lift)" }}>
        {children}
      </div>
    </div>
  );
}

function MyBubble({ text }: { text: string }) {
  return (
    <div className="hem-in flex justify-end">
      <p className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] leading-snug text-background">{text}</p>
    </div>
  );
}

// A reply Hem offers you: the not-yet-sent version of your own ink bubble, with
// a send arrow. Left, under Hem, like suggested replies; it arrives just after
// Hem has spoken. `secondary` for "check again" / "retry".
function Reply({ onClick, children, secondary }: { onClick: () => void; children: React.ReactNode; secondary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`hem-in hem-offer group inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] bg-transparent py-1.5 pl-4 pr-1.5 text-left text-[15px] font-medium transition-[transform,background-color,color] duration-150 active:scale-[0.96] active:bg-foreground active:text-background ${secondary ? "border-foreground/40" : "border-foreground"}`}
    >
      {children}
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${secondary ? "bg-foreground/10 text-foreground group-active:bg-background/20 group-active:text-background" : "hem-nudge bg-foreground text-background group-active:bg-background group-active:text-foreground"}`}
      >
        {secondary ? <RotateCcw size={15} strokeWidth={2.25} /> : <ArrowUp size={16} strokeWidth={2.5} />}
      </span>
    </button>
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

// A little conversation with Hem: Hem offers, you tap the reply in your own
// words, Hem thinks (its face's dots bounce) and answers: what it would say out
// loud, then why. The day's answers stay on this device, so coming back shows
// what Hem said earlier. Without an AI key on the server, Hem says (`hint`) to
// ask it from Claude instead.
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
  const { ai, t, profile, locale } = useFamily();
  const key = `hem:${profile.id}:${topic}:${kidId ?? ""}:${period(per)}`;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [earlier, setEarlier] = useState(0); // how many turns came from an earlier visit
  const [asking, setAsking] = useState<{ q: string; topic: AskTopic } | null>(null);
  const [slow, setSlow] = useState(false); // Hem says what it's doing after a few seconds
  const [step, setStep] = useState(Infinity); // 0 = headline only, n = n reasons shown
  const [failed, setFailed] = useState<{ q: string; topic: AskTopic; text: string; typed: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(0); // when the saved answers were loaded, for "2 hours ago"
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const saved = load(key);
    setTurns(saved);
    setEarlier(saved.length);
    setNow(Date.now());
    return () => {
      alive.current = false;
    };
  }, [key]);

  if (!ai) {
    if (!hint) return null;
    return (
      <section className="flex flex-col">
        <HemBubble>{hint}</HemBubble>
      </section>
    );
  }

  async function ask(q: string, which: AskTopic, typed = false) {
    setAsking({ q, topic: which });
    setFailed(null);
    setSlow(false);
    const slowTimer = setTimeout(() => alive.current && setSlow(true), 2500);
    const started = Date.now();
    let answer: Answer | null = null;
    let problem: string | null = null;
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: which,
          kidId,
          previous: turns.map((x) => x.answer.headline),
          message: typed ? q : undefined,
          history: turns.slice(-2).map((x) => ({ q: x.question, a: [x.answer.headline, ...x.answer.details].join(" ") })),
        }),
      });
      if (res.status === 429) problem = t("That's a lot of questions for today. Shall we pick this up tomorrow?");
      else if (res.status === 402) problem = t("I've used up this month's budget. I'll be back on the 1st.");
      else if (!res.ok) problem = t("Sorry, I couldn't think straight just now. Try me again in a moment?");
      else answer = (await res.json()) as Answer;
    } catch {
      problem = t("Sorry, I couldn't think straight just now. Try me again in a moment?");
    }
    clearTimeout(slowTimer);
    // Hem takes a breath before answering, a little longer for a longer answer:
    // a fast model shouldn't feel like a form. Never more than 1.5 s on top.
    const quick = reducedMotion();
    if (!quick && answer) {
      const length = answer.headline.length + answer.details.join("").length;
      await wait(Math.min(1500, Math.max(0, 900 + length * 4 - (Date.now() - started))));
    }
    if (!alive.current) return;
    setAsking(null);
    if (!answer) return setFailed({ q, topic: which, text: problem ?? "", typed });
    const next = [...turns, { question: q, answer, at: new Date().toISOString() }];
    setTurns(next);
    save(key, next);
    if (quick) return setStep(Infinity);
    // What Hem would say out loud first, then the reasons, as if typed.
    setStep(0);
    await wait(500);
    for (let i = 1; i <= answer.details.length; i++) {
      if (!alive.current) return;
      setStep(i);
      await wait(280);
    }
    setStep(Infinity);
  }

  const last = turns.length - 1;
  const busy = asking !== null || (step !== Infinity && turns.length > 0);
  const ago = (iso: string) => {
    const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return minutes < 60 ? rtf.format(-Math.max(1, minutes), "minute") : rtf.format(-Math.round(minutes / 60), "hour");
  };

  // Home: an answer from an earlier visit, folded to what Hem said out loud.
  if (fold && !open && earlier > 0 && turns.length === earlier && asking === null) {
    const turn = turns[last];
    return (
      <button onClick={() => setOpen(true)} className="hem-in group flex items-end gap-2 text-left" aria-expanded={false}>
        <HemAvatar />
        <span className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md bg-surface py-2.5 pl-4 pr-2.5 text-[15px] leading-snug transition-transform group-active:scale-[0.98]" style={{ boxShadow: "var(--lift)" }}>
          <span>
            <span className="block text-xs text-muted">{ago(turn.at)}</span>
            {turn.answer.headline}
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" aria-label={t("More")} />
        </span>
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <HemBubble>{intro}</HemBubble>

      {turns.map((turn, i) => {
        const shown = i === last ? step : Infinity;
        const reasons = turn.answer.details.slice(0, shown);
        return (
          <div key={turn.at} className="flex flex-col gap-3">
            {i === 0 && earlier > 0 && <p className="text-center text-xs text-muted">{ago(turn.at)}</p>}
            {i === earlier && earlier > 0 && <p className="text-center text-xs text-muted">{t("Now")}</p>}
            <MyBubble text={turn.question} />
            <div className="flex flex-col gap-1">
              <HemBubble avatar={reasons.length === 0}>{turn.answer.headline}</HemBubble>
              {reasons.length > 0 && (
                <HemBubble>
                  <ul className="flex flex-col gap-1">
                    {reasons.map((d) => (
                      <li key={d} className="hem-in flex gap-2">
                        <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-muted" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </HemBubble>
              )}
            </div>
          </div>
        );
      })}

      {asking && (
        <>
          <MyBubble text={asking.q} />
          {/* Hem's face is the dots: they bounce while Hem thinks, no second set in a bubble. */}
          <div className="hem-in flex items-center gap-2" role="status" aria-label={t("Hem is thinking")}>
            <HemAvatar thinking />
            {slow && <span className="hem-in text-sm text-muted">{t("Let me look…")}</span>}
          </div>
        </>
      )}

      {failed && (
        <>
          <MyBubble text={failed.q} />
          <HemBubble>{failed.text}</HemBubble>
        </>
      )}

      {!busy && (
        <div className="flex flex-wrap gap-2 pl-10">
          {failed ? (
            <Reply secondary onClick={() => ask(failed.q, failed.topic, failed.typed)}>{t("Try again")}</Reply>
          ) : turns.length === 0 ? (
            <Reply onClick={() => ask(question, topic)}>{question}</Reply>
          ) : more ? (
            <Reply onClick={() => ask(more.label, more.topic ?? topic)}>{more.label}</Reply>
          ) : (
            <Reply secondary onClick={() => ask(t("Can you check again?"), topic)}>{t("Can you check again?")}</Reply>
          )}
        </div>
      )}

      {/* Or say it in your own words. The keyboard's mic dictates for free. */}
      {!busy && (
        <form
          className="hem-in hem-offer ml-10 flex items-center gap-1 rounded-full bg-surface py-1 pl-4 pr-1"
          style={{ boxShadow: "var(--lift)" }}
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            setDraft("");
            ask(text, topic, true);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={300}
            enterKeyHint="send"
            autoComplete="off"
            placeholder={t("Or tell me…")}
            aria-label={t("Tell Hem")}
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={t("Send")}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[opacity,transform] active:scale-95 disabled:opacity-25"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </form>
      )}
    </section>
  );
}
