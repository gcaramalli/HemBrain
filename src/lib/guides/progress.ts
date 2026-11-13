"use client";

import { useCallback, useEffect, useState } from "react";
import type { Guide, L } from "./index";

// A player's progress in the Thailand guide. Kept in this browser (localStorage, one
// entry per account), so it is a per-person game: each of us learns at our own pace.
export type Progress = {
  cards: string[]; // cards read
  words: string[]; // words known
  places: string[]; // places visited or eaten
  quests: string[]; // quests done
  quiz: Record<string, boolean>; // question → answered right the first time
};

const EMPTY: Progress = { cards: [], words: [], places: [], quests: [], quiz: {} };
const key = (code: string, who: string) => `guide-${code.toLowerCase()}:${who}`;

export const XP = { card: 5, word: 2, place: 15, quest: 20, quiz: 10 } as const;

export function xpOf(p: Progress) {
  return (
    p.cards.length * XP.card +
    p.words.length * XP.word +
    p.places.length * XP.place +
    p.quests.length * XP.quest +
    Object.values(p.quiz).filter(Boolean).length * XP.quiz
  );
}

export const maxXp = (g: Guide) =>
  g.cards.length * XP.card + g.words.length * XP.word + g.cities.reduce((n, c) => n + c.places.length + c.eat.length, 0) * XP.place + g.quests.length * XP.quest + g.questions.length * XP.quiz;

export function levelOf(xp: number, levels: Guide["levels"]) {
  let i = 0;
  while (i + 1 < levels.length && xp >= levels[i + 1].at) i++;
  const next = levels[i + 1];
  return { index: i, level: levels[i], next, from: levels[i].at, to: next?.at ?? null };
}

const rightAnswers = (p: Progress) => Object.values(p.quiz).filter(Boolean).length;
const placesDone = (p: Progress, g: Guide, i: number) => {
  const c = g.cities[i];
  return c ? c.places.concat(c.eat).filter((x) => p.places.includes(x.id)).length : 0;
};

export function badgesFor(g: Guide): { id: string; emoji: string; name: L; test: (p: Progress) => boolean }[] {
  return [
    { id: "talker", emoji: "🗣️", name: { en: "Talker: 10 words", fr: "Bavard : 10 mots" }, test: (p) => p.words.length >= 10 },
    { id: "polyglot", emoji: "🎓", name: { en: "Polyglot: all words", fr: "Polyglotte : tous les mots" }, test: (p) => p.words.length >= g.words.length },
    { id: "scholar", emoji: "📚", name: { en: "Scholar: all cards", fr: "Érudit : toutes les fiches" }, test: (p) => p.cards.length >= g.cards.length },
    { id: "quizzer", emoji: "🧠", name: { en: "Quiz ace: 10 right", fr: "As du quiz : 10 bonnes" }, test: (p) => rightAnswers(p) >= 10 },
    ...g.cities.map((c, i) => ({ id: `city-${c.id}`, emoji: c.emoji, name: { en: `${c.name}: 6 places`, fr: `${c.name} : 6 lieux` }, test: (p: Progress) => placesDone(p, g, i) >= 6 })),
    { id: "quests", emoji: "🎯", name: { en: "Adventurer: 10 quests", fr: "Aventurier : 10 défis" }, test: (p) => p.quests.length >= 10 },
  ];
}

export function useGuideProgress(code: string, who: string | undefined) {
  const [p, setP] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!who) return;
    try {
      const raw = localStorage.getItem(key(code, who));
      if (raw) setP({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, [code, who]);

  const save = useCallback(
    (fn: (p: Progress) => Progress) =>
      setP((cur) => {
        const next = fn(cur);
        try {
          if (who) localStorage.setItem(key(code, who), JSON.stringify(next));
        } catch {}
        return next;
      }),
    [code, who],
  );

  const toggle = useCallback(
    (field: "cards" | "words" | "places" | "quests", id: string) =>
      save((cur) => ({ ...cur, [field]: cur[field].includes(id) ? cur[field].filter((x) => x !== id) : [...cur[field], id] })),
    [save],
  );

  // A question counts once: the first answer decides.
  const answer = useCallback((id: string, right: boolean) => save((cur) => (id in cur.quiz ? cur : { ...cur, quiz: { ...cur.quiz, [id]: right } })), [save]);
  const reset = useCallback(() => save(() => EMPTY), [save]);

  return { p, ready, toggle, answer, reset };
}
