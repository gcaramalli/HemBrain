"use client";

import { useCallback, useEffect, useState } from "react";
import { CITIES, QUESTS, QUESTIONS, WORDS, CARDS, type L } from "./thailand";

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
const key = (who: string) => `guide-th:${who}`;

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

export const MAX_XP =
  CARDS.length * XP.card + WORDS.length * XP.word + CITIES.reduce((n, c) => n + c.places.length + c.eat.length, 0) * XP.place + QUESTS.length * XP.quest + QUESTIONS.length * XP.quiz;

export const LEVELS: { at: number; emoji: string; name: L }[] = [
  { at: 0, emoji: "🎒", name: { en: "Fresh farang", fr: "Farang tout neuf" } },
  { at: 40, emoji: "🛺", name: { en: "Tuk-tuk rider", fr: "Pilote de tuk-tuk" } },
  { at: 120, emoji: "🍜", name: { en: "Street food hunter", fr: "Chasseur de street food" } },
  { at: 250, emoji: "🛕", name: { en: "Temple wanderer", fr: "Flâneur de temples" } },
  { at: 450, emoji: "🐘", name: { en: "Friend of the elephant", fr: "Ami de l'éléphant" } },
  { at: 700, emoji: "👑", name: { en: "Honorary Thai", fr: "Thaï d'honneur" } },
];

export function levelOf(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].at) i++;
  const next = LEVELS[i + 1];
  return { index: i, level: LEVELS[i], next, from: LEVELS[i].at, to: next?.at ?? null };
}

export const BADGES: { id: string; emoji: string; name: L; test: (p: Progress) => boolean }[] = [
  { id: "talker", emoji: "🗣️", name: { en: "Talker: 10 words", fr: "Bavard : 10 mots" }, test: (p) => p.words.length >= 10 },
  { id: "polyglot", emoji: "🎓", name: { en: "Polyglot: all words", fr: "Polyglotte : tous les mots" }, test: (p) => p.words.length >= WORDS.length },
  { id: "scholar", emoji: "📚", name: { en: "Scholar: all cards", fr: "Érudit : toutes les fiches" }, test: (p) => p.cards.length >= CARDS.length },
  { id: "quizzer", emoji: "🧠", name: { en: "Quiz ace: 10 right", fr: "As du quiz : 10 bonnes" }, test: (p) => Object.values(p.quiz).filter(Boolean).length >= 10 },
  { id: "bkk", emoji: "🏙️", name: { en: "Bangkok: 6 places", fr: "Bangkok : 6 lieux" }, test: (p) => CITIES[0].places.concat(CITIES[0].eat).filter((x) => p.places.includes(x.id)).length >= 6 },
  { id: "pkt", emoji: "🏝️", name: { en: "Phuket: 6 places", fr: "Phuket : 6 lieux" }, test: (p) => CITIES[1].places.concat(CITIES[1].eat).filter((x) => p.places.includes(x.id)).length >= 6 },
  { id: "quests", emoji: "🎯", name: { en: "Adventurer: 10 quests", fr: "Aventurier : 10 défis" }, test: (p) => p.quests.length >= 10 },
];

export function useGuideProgress(who: string | undefined) {
  const [p, setP] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!who) return;
    try {
      const raw = localStorage.getItem(key(who));
      if (raw) setP({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, [who]);

  const save = useCallback(
    (fn: (p: Progress) => Progress) =>
      setP((cur) => {
        const next = fn(cur);
        try {
          if (who) localStorage.setItem(key(who), JSON.stringify(next));
        } catch {}
        return next;
      }),
    [who],
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
