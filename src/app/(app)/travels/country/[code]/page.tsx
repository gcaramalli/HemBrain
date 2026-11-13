"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/family-context";
import { TravelsHeader } from "@/components/page-header";
import { TravelJournal } from "@/components/travel-journal";
import { countryName, flag, whoWent } from "@/lib/countries";
import { badgesFor, levelOf, maxXp, useGuideProgress, XP, xpOf, type Progress } from "@/lib/guides/progress";
import { guideFor, type City, type Guide, type L, type Place } from "@/lib/guides";

type Tab = "journal" | "guide" | "play";

// One country: the family's journal and timeline for it and, where there is one, a mini Lonely Planet
// with a game on top (XP, levels, quests, quiz). Progress is per person, in this browser.
export default function CountryPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = String(raw ?? "").toUpperCase();
  const { supabase, me, members, locale, t } = useFamily();
  const g = guideFor(code);
  const { p, ready, toggle, answer, reset } = useGuideProgress(code, me?.id);
  const [tab, setTab] = useState<Tab>("journal");
  const [who, setWho] = useState<string[]>([]);
  const tx = (l: L) => (locale === "fr" ? l.fr : l.en);
  const tabs: { id: Tab; label: string }[] = g
    ? [
        { id: "journal", label: t("Journal") },
        { id: "guide", label: t("Guide") },
        { id: "play", label: t("Play") },
      ]
    : [];

  // Who has been (map ticks), shown as dots next to the name.
  useEffect(() => {
    supabase
      .from("visited_countries")
      .select("country, member_id")
      .eq("country", code)
      .then(({ data }) => setWho([...(whoWent(data ?? []).get(code) ?? [])]));
  }, [supabase, code]);

  return (
    <div className="flex flex-col gap-4">
      <TravelsHeader back="/travels" backLabel={t("Travels")} />
      <section className="card flex items-center gap-3 p-4">
        <span className="text-4xl" aria-hidden>{flag(code)}</span>
        <div className="min-w-0 grow">
          <h1 className="text-xl font-bold leading-tight">{countryName(code, locale)}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            {members.filter((m) => who.includes(m.id)).map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 text-xs font-medium">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                {m.name}
              </span>
            ))}
          </div>
        </div>
        <Link href="/travels/timeline" className="chip-toggle shrink-0">{t("Timeline")}</Link>
      </section>

      {tabs.length > 0 && (
        <div className="grid grid-cols-3 rounded-full bg-accent-soft p-1 text-sm">
          {tabs.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} aria-pressed={tab === x.id} className={`min-h-9 rounded-full px-3 ${tab === x.id ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
              {x.label}
            </button>
          ))}
        </div>
      )}

      {tab === "journal" || !g ? (
        <TravelJournal country={code} />
      ) : !ready ? (
        <div className="card h-40" />
      ) : tab === "guide" ? (
        <GuideTab g={g} p={p} tx={tx} toggle={toggle} />
      ) : (
        <>
          <Play g={g} p={p} tx={tx} toggle={toggle} reset={reset} />
          <Fold emoji="🧠" title={t("Quiz")} sub={t("{a} of {b} right", { a: Object.values(p.quiz).filter(Boolean).length, b: g.questions.length })}>
            <Quiz g={g} p={p} tx={tx} answer={answer} />
          </Fold>
        </>
      )}
    </div>
  );
}

type Tx = (l: L) => string;
type Toggle = (field: "cards" | "words" | "places" | "quests", id: string) => void;

// One page, folds instead of more tabs: the country in cards, the words, then each city.
function GuideTab({ g, p, tx, toggle }: { g: Guide; p: Progress; tx: Tx; toggle: Toggle }) {
  const { t } = useFamily();
  return (
    <>
      <Fold emoji="📜" title={t("The country in cards")} sub={t("{a} of {b} read", { a: p.cards.length, b: g.cards.length })}>
        <Cards g={g} p={p} tx={tx} toggle={toggle} />
      </Fold>
      <Fold emoji="🗣️" title={t("Words")} sub={t("{a} of {b} words learned", { a: p.words.length, b: g.words.length })}>
        <Words g={g} p={p} tx={tx} toggle={toggle} />
      </Fold>
      {g.cities.map((c) => (
        <Fold key={c.id} emoji={c.emoji} title={c.name} sub={t("{a} of {b} places done", { a: c.places.concat(c.eat).filter((x) => p.places.includes(x.id)).length, b: c.places.length + c.eat.length })}>
          <CityView city={c} p={p} tx={tx} toggle={toggle} />
        </Fold>
      ))}
    </>
  );
}

function Fold({ emoji, title, sub, children }: { emoji: string; title: string; sub?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <button className="card flex min-h-16 items-center gap-3 p-4 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-3xl" aria-hidden>{emoji}</span>
        <span className="min-w-0 grow">
          <span className="block text-lg font-bold leading-tight">{title}</span>
          {sub && <span className="block text-sm text-muted">{sub}</span>}
        </span>
        <span aria-hidden className="text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && children}
    </section>
  );
}


function Play({ g, p, tx, toggle, reset }: { g: Guide; p: Progress; tx: Tx; toggle: Toggle; reset: () => void }) {
  const { t } = useFamily();
  const xp = xpOf(p);
  const lv = levelOf(xp, g.levels);
  const pct = lv.to === null ? 100 : Math.round(((xp - lv.from) / (lv.to - lv.from)) * 100);
  const [scope, setScope] = useState<string>("all");
  const quests = g.quests.filter((q) => scope === "all" || !q.where || q.where === scope);
  const done = quests.filter((q) => p.quests.includes(q.id)).length;

  return (
    <>
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>{lv.level.emoji}</span>
          <div className="min-w-0 grow">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("Level {n}", { n: lv.index + 1 })}</div>
            <div className="text-lg font-bold leading-tight">{tx(lv.level.name)}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{xp}</div>
            <div className="text-xs text-muted">XP</div>
          </div>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-accent-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[var(--foreground)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted">
          {lv.next ? t("{n} XP to become {name}", { n: lv.to! - xp, name: `${lv.next.emoji} ${tx(lv.next.name)}` }) : t("Top level. Khop khun khrap/kha!")}
        </p>
        <p className="text-xs text-muted">
          {t("Read a card +{a}, learn a word +{b}, visit a place +{c}, do a quest +{d}, right answer +{e}.", { a: XP.card, b: XP.word, c: XP.place, d: XP.quest, e: XP.quiz })} {t("Max {n} XP.", { n: maxXp(g) })}
        </p>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="font-bold">{t("Badges")}</h2>
        <ul className="grid grid-cols-2 gap-2">
          {badgesFor(g).map((b) => {
            const on = b.test(p);
            return (
              <li key={b.id} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm ${on ? "bg-accent-soft font-semibold" : "text-muted opacity-60"}`}>
                <span aria-hidden className={on ? "" : "grayscale"}>{b.emoji}</span>
                {tx(b.name)}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{t("Quests")}</h2>
          <span className="text-sm text-muted">{done} / {quests.length}</span>
        </div>
        <div className="flex gap-2">
          {["all", ...g.cities.map((c) => c.id)].map((s) => (
            <button key={s} className={`chip-toggle ${scope === s ? "chip-on" : ""}`} onClick={() => setScope(s)}>
              {s === "all" ? t("All") : g.cities.find((c) => c.id === s)!.name}
            </button>
          ))}
        </div>
        <ul className="flex flex-col">
          {quests.map((q) => (
            <CheckRow key={q.id} on={p.quests.includes(q.id)} onClick={() => toggle("quests", q.id)} emoji={q.emoji} title={tx(q.title)} sub={q.hint ? tx(q.hint) : undefined} xp={XP.quest} />
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-muted">
        {t("Your progress lives in this browser, for you only.")}{" "}
        <button className="underline" onClick={() => { if (p.cards.length + p.words.length + p.places.length + p.quests.length + Object.keys(p.quiz).length === 0) return; reset(); }}>
          {t("Start over")}
        </button>
      </p>
    </>
  );
}

function CheckRow({ on, onClick, emoji, title, sub, xp }: { on: boolean; onClick: () => void; emoji: string; title: string; sub?: string; xp: number }) {
  return (
    <li>
      <button onClick={onClick} aria-pressed={on} className="flex min-h-12 w-full items-center gap-3 py-1.5 text-left">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${on ? "border-transparent bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)]"}`}>{on ? "✓" : ""}</span>
        <span aria-hidden>{emoji}</span>
        <span className="min-w-0 grow">
          <span className={on ? "text-muted line-through" : ""}>{title}</span>
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
        <span className="text-xs font-medium text-muted">+{xp}</span>
      </button>
    </li>
  );
}

function Cards({ g, p, tx, toggle }: { g: Guide; p: Progress; tx: Tx; toggle: Toggle }) {
  const { t } = useFamily();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {g.cards.map((c) => {
        const isOpen = open === c.id;
        const read = p.cards.includes(c.id);
        return (
          <section key={c.id} className="card p-0">
            <button className="flex min-h-14 w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
              <span className="text-2xl" aria-hidden>{c.emoji}</span>
              <span className="min-w-0 grow font-bold">{tx(c.title)}</span>
              {read && <span className="text-xs text-muted">✓</span>}
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <p className="font-medium">{tx(c.lead)}</p>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
                  {c.points.map((x, i) => (
                    <li key={i}>{tx(x)}</li>
                  ))}
                </ul>
                <button className={read ? "btn-ghost" : "btn"} onClick={() => toggle("cards", c.id)}>
                  {read ? t("Read ✓ (tap to undo)") : t("Got it, +{n} XP", { n: XP.card })}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function Words({ g, p, tx, toggle }: { g: Guide; p: Progress; tx: Tx; toggle: Toggle }) {
  const { t } = useFamily();
  const [quiz, setQuiz] = useState(false); // flashcards: hide the meaning until tapped
  const [shown, setShown] = useState<string[]>([]);
  const known = p.words.length;
  return (
    <>
      <section className="card flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{t("{a} of {b} words learned", { a: known, b: g.words.length })}</h2>
          <button className={`chip-toggle ${quiz ? "chip-on" : ""}`} aria-pressed={quiz} onClick={() => { setQuiz(!quiz); setShown([]); }}>
            {t("Flashcards")}
          </button>
        </div>
        <p className="text-xs text-muted">{t("Thai has 5 tones, so the spelling in Latin letters is only a guide: say it, smile, and people will help you.")}</p>
      </section>
      {g.wordGroups.map((grp) => (
        <section key={grp.id} className="card flex flex-col gap-1 p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{tx(grp.label)}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {g.words.filter((w) => w.group === grp.id).map((w) => {
              const on = p.words.includes(w.id);
              const reveal = !quiz || shown.includes(w.id);
              return (
                <li key={w.id} className="flex min-h-14 items-center gap-3 py-2">
                  <button className="min-w-0 grow text-left" onClick={() => quiz && setShown(reveal ? shown.filter((x) => x !== w.id) : [...shown, w.id])}>
                    <span className="block text-lg font-semibold leading-tight">{w.thai}</span>
                    <span className="block text-sm text-muted">{w.say}</span>
                    {reveal ? <span className="mt-0.5 block text-sm">{tx({ en: w.en, fr: w.fr })}</span> : <span className="mt-0.5 block text-sm text-muted">{t("Tap to see the meaning")}</span>}
                  </button>
                  <button className={`chip-toggle shrink-0 ${on ? "chip-on" : ""}`} aria-pressed={on} onClick={() => toggle("words", w.id)}>
                    {on ? "✓" : `+${XP.word}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

function CityView({ city, p, tx, toggle }: { city: City; p: Progress; tx: Tx; toggle: Toggle }) {
  const { t } = useFamily();
  const [kids, setKids] = useState(false);
  const all = [...city.places, ...city.eat];
  const seen = all.filter((x) => p.places.includes(x.id)).length;
  const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${q} ${city.center}`)}`;
  const list = (items: Place[]) => items.filter((x) => !kids || x.kids);
  return (
    <>
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>{city.emoji}</span>
          <div>
            <h2 className="text-xl font-bold leading-tight">{city.name}</h2>
            <div className="text-sm text-muted">{city.thai}</div>
          </div>
        </div>
        <p className="text-sm">{tx(city.intro)}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {city.facts.map((f, i) => (
            <div key={i} className="rounded-2xl bg-accent-soft px-3 py-2">
              <dt className="text-xs text-muted">{tx(f.label)}</dt>
              <dd className="font-medium">{tx(f.value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h3 className="font-bold">{t("Where to stay or wander")}</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {city.areas.map((a) => (
            <li key={a.name}>
              <span className="font-semibold">{a.name}.</span> {tx(a.what)}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-sm text-muted">{t("{a} of {b} places done", { a: seen, b: all.length })}</span>
        <button className={`chip-toggle ${kids ? "chip-on" : ""}`} aria-pressed={kids} onClick={() => setKids(!kids)}>
          👶 {t("With Charlie")}
        </button>
      </div>

      {[
        { title: t("To see and do"), items: list(city.places) },
        { title: t("To eat"), items: list(city.eat) },
      ].map((sec) => (
        <section key={sec.title} className="card flex flex-col gap-1 p-4">
          <h3 className="font-bold">{sec.title}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {sec.items.map((x) => {
              const on = p.places.includes(x.id);
              return (
                <li key={x.id} className="flex gap-3 py-3">
                  <span className="text-2xl" aria-hidden>{x.emoji}</span>
                  <div className="flex min-w-0 grow flex-col gap-1">
                    <div className="font-semibold leading-tight">
                      {x.name} {x.kids && <span title={t("Fine with a toddler")} aria-label={t("Fine with a toddler")}>👶</span>}
                    </div>
                    {x.area && <div className="text-xs text-muted">{x.area}</div>}
                    <p className="text-sm">{tx(x.what)}</p>
                    {x.tip && <p className="text-sm text-muted">💡 {tx(x.tip)}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button className={`chip-toggle ${on ? "chip-on" : ""}`} aria-pressed={on} onClick={() => toggle("places", x.id)}>
                        {on ? t("Been there ✓") : t("Been there? +{n} XP", { n: XP.place })}
                      </button>
                      <a className="chip-toggle" href={maps(x.name)} target="_blank" rel="noreferrer">{t("Open in Maps")}</a>
                    </div>
                  </div>
                </li>
              );
            })}
            {sec.items.length === 0 && <li className="py-3 text-sm text-muted">{t("Nothing here for little ones.")}</li>}
          </ul>
        </section>
      ))}

      <section className="card flex flex-col gap-2 p-4">
        <h3 className="font-bold">{t("Good to know")}</h3>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          {city.tips.map((x, i) => (
            <li key={i}>{tx(x)}</li>
          ))}
        </ul>
      </section>
      <p className="px-1 text-xs text-muted">{t("Prices, hours and rules change: check on the spot.")}</p>
    </>
  );
}

function Quiz({ g, p, tx, answer }: { g: Guide; p: Progress; tx: Tx; answer: (id: string, right: boolean) => void }) {
  const { t } = useFamily();
  const total = g.questions.length;
  const answeredIds = Object.keys(p.quiz);
  const nextIndex = useMemo(() => {
    const i = g.questions.findIndex((q) => !(q.id in p.quiz));
    return i === -1 ? total : i;
    // The question stays on screen after being answered until "Next": track it locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [idx, setIdx] = useState(nextIndex);
  const [picked, setPicked] = useState<number | null>(null);
  const right = Object.values(p.quiz).filter(Boolean).length;
  const q = g.questions[idx];

  if (!q)
    return (
      <section className="card flex flex-col items-center gap-3 p-6 text-center">
        <div className="text-5xl" aria-hidden>🏆</div>
        <h2 className="text-lg font-bold">{t("{a} of {b} right", { a: right, b: total })}</h2>
        <p className="text-sm text-muted">{answeredIds.length === total ? t("Each question counts once, on the first try.") : ""}</p>
        <button className="btn" onClick={() => { setIdx(0); setPicked(null); }}>{t("Look at the questions again")}</button>
      </section>
    );

  const done = picked !== null;
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{t("Question {a} of {b}", { a: idx + 1, b: total })}</span>
        <span>{t("{n} right", { n: right })}</span>
      </div>
      <h2 className="text-lg font-bold leading-snug">{tx(q.q)}</h2>
      <ul className="flex flex-col gap-2">
        {q.options.map((o, i) => {
          const state = !done ? "" : i === q.answer ? "border-green-500 bg-green-500/10" : i === picked ? "border-red-500 bg-red-500/10" : "opacity-60";
          return (
            <li key={i}>
              <button
                disabled={done}
                className={`min-h-12 w-full rounded-2xl border-2 px-4 py-2 text-left ${state || "border-[var(--border)] active:scale-[0.99]"}`}
                onClick={() => { setPicked(i); answer(q.id, i === q.answer); }}
              >
                {tx(o)}
              </button>
            </li>
          );
        })}
      </ul>
      {done && (
        <>
          <p className="text-sm">
            <span className="font-semibold">{picked === q.answer ? t("Right!") : t("Not quite.")}</span> {tx(q.why)}
          </p>
          <button className="btn" onClick={() => { setIdx(idx + 1); setPicked(null); }}>
            {idx + 1 < total ? t("Next") : t("See my score")}
          </button>
        </>
      )}
    </section>
  );
}
