"use client";

import { ArrowUp, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFamily } from "./family-context";
import { ThinkingDots } from "./thinking-dots";

// Mirrors ASK_TOPICS in src/app/api/ai/ask/route.ts.
export type AskTopic =
  | "bedtime" | "nap" | "kid_food" | "dinner" | "today"
  | "week" | "todo" | "shopping" | "recipes" | "purchases"
  | "kid_week" | "preschool" | "wardrobe" | "brain" | "papers" | "travels" | "expenses" | "work";
type Answer = { headline: string; details: string[] };
type Turn = { question: string; answer: Answer; at: string };

// The brand mark as Hem's face: the three dots on night blue (ringed so it
// still shows on the night-blue page in dark mode).
export function HemAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#111722", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.15)" }} aria-hidden>
      <ThinkingDots size={5} still />
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

// Hem is writing: its dots bounce in a bubble of their own, as in Messages.
function TypingBubble({ label }: { label: string }) {
  return (
    <div className="hem-in flex items-end gap-2" role="status" aria-label={label}>
      <HemAvatar />
      <div className="flex h-[2.6rem] items-center rounded-2xl rounded-bl-md bg-surface px-4" style={{ boxShadow: "var(--lift)" }}>
        <ThinkingDots size={7} />
      </div>
    </div>
  );
}

// Text Hem writes as you watch, letter by letter. The rest of the text holds
// its place unseen, so the bubble keeps its size and the page doesn't jump.
function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (reducedMotion()) {
      setN(text.length);
      done.current?.();
      return;
    }
    // About 25 ms a letter, a long line never taking much more than 2 s.
    const every = Math.max(8, Math.min(28, 2000 / Math.max(1, text.length)));
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) {
        clearInterval(timer);
        done.current?.();
      }
    }, every);
    return () => clearInterval(timer);
  }, [text]);
  return (
    <>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span aria-hidden className="invisible">{text.slice(n)}</span>
      <span className="sr-only">{text}</span>
    </>
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
  compact,
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
  // At the top of a page: until something is asked, only Hem's line and the
  // reply, no text field, so the page's own content stays close.
  compact?: boolean;
}) {
  const { ai, t, profile, locale } = useFamily();
  const key = `hem:${profile.id}:${topic}:${kidId ?? ""}:${period(per)}`;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [earlier, setEarlier] = useState(0); // how many turns came from an earlier visit
  const [asking, setAsking] = useState<{ q: string; topic: AskTopic } | null>(null);
  const [slow, setSlow] = useState(false); // Hem says what it's doing after a few seconds
  // The answer being written: 0 = the headline, n = the n-th reason; Infinity = all written.
  const [step, setStep] = useState(Infinity);
  // Hem's opening line: "dots" while it's about to speak, "typing", then "done".
  const [opening, setOpening] = useState<"dots" | "typing" | "done">("done");
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
    // Coming back to a conversation: what was said is just there. Otherwise Hem
    // types its opening line first.
    const fresh = saved.length === 0 && !reducedMotion();
    setOpening(fresh ? "dots" : "done");
    const timer = fresh ? setTimeout(() => alive.current && setOpening("typing"), 700) : undefined;
    return () => {
      alive.current = false;
      clearTimeout(timer);
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
    // The dots bounce a moment even when the model is fast: Hem isn't a form.
    const quick = reducedMotion();
    if (!quick) await wait(Math.max(0, 1200 - (Date.now() - started)));
    if (!alive.current) return;
    setAsking(null);
    if (!answer) return setFailed({ q, topic: which, text: problem ?? "", typed });
    const next = [...turns, { question: q, answer, at: new Date().toISOString() }];
    setTurns(next);
    save(key, next);
    // What Hem would say out loud first, then the reasons, each written out.
    setStep(quick ? Infinity : 0);
  }

  // One part of the answer is written: a short pause, then the next one.
  const written = (part: number, parts: number) => {
    setTimeout(() => alive.current && setStep(part + 1 >= parts ? Infinity : part + 1), 250);
  };

  const last = turns.length - 1;
  const busy = asking !== null || opening !== "done" || (step !== Infinity && turns.length > 0);
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
      {opening === "dots" ? (
        <TypingBubble label={t("Hem is thinking")} />
      ) : (
        <HemBubble>{opening === "typing" ? <Typed text={intro} onDone={() => setOpening("done")} /> : intro}</HemBubble>
      )}

      {turns.map((turn, i) => {
        const shown = i === last ? step : Infinity; // the part being written
        const parts = 1 + turn.answer.details.length;
        const reasons = turn.answer.details.slice(0, shown);
        const write = (part: number, text: string) => (part === shown ? <Typed text={text} onDone={() => written(part, parts)} /> : text);
        return (
          <div key={turn.at} className="flex flex-col gap-3">
            {i === 0 && earlier > 0 && <p className="text-center text-xs text-muted">{ago(turn.at)}</p>}
            {i === earlier && earlier > 0 && <p className="text-center text-xs text-muted">{t("Now")}</p>}
            <MyBubble text={turn.question} />
            <div className="flex flex-col gap-1">
              <HemBubble avatar={reasons.length === 0}>{write(0, turn.answer.headline)}</HemBubble>
              {reasons.length > 0 && (
                <HemBubble>
                  <ul className="flex flex-col gap-1">
                    {reasons.map((d, j) => (
                      <li key={d} className="hem-in flex gap-2">
                        <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-muted" />
                        <span>{write(j + 1, d)}</span>
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
          {/* Hem is writing: the dots bounce in its bubble, the avatar stays still. */}
          <div className="flex items-end gap-2">
            <TypingBubble label={t("Hem is thinking")} />
            {slow && <span className="hem-in pb-2.5 text-sm text-muted">{t("Let me look…")}</span>}
          </div>
        </>
      )}

      {failed && (
        <>
          <MyBubble text={failed.q} />
          <HemBubble><Typed text={failed.text} /></HemBubble>
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
      {!busy && !(compact && turns.length === 0 && !failed) && (
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
