// Country guides: a mini Lonely Planet per country, picked by ISO code. Add a country = a content file
// like ./thailand.ts and one line in GUIDES.
import { thailand } from "./thailand";

export type L = { en: string; fr: string };
export type Card = { id: string; emoji: string; title: L; lead: L; points: L[] };
export type Word = { id: string; thai: string; say: string; en: string; fr: string; group: "basics" | "eat" | "move" | "numbers" | "soul" };
export type Place = { id: string; emoji: string; name: string; what: L; tip?: L; kids?: boolean; area?: string };
export type City = {
  id: string;
  emoji: string;
  name: string;
  thai: string;
  intro: L;
  facts: { label: L; value: L }[];
  areas: { name: string; what: L }[];
  places: Place[];
  eat: Place[];
  tips: L[];
  center: string; // for "open in maps"
  timelapse?: string; // sub-page with the city growing in 3D
};
export type Quest = { id: string; emoji: string; title: L; hint?: L; where?: string };
export type Question = { id: string; q: L; options: L[]; answer: number; why: L };
export type Level = { at: number; emoji: string; name: L };
export type Guide = {
  code: string;
  cards: Card[];
  words: Word[];
  wordGroups: { id: Word["group"]; label: L }[];
  cities: City[];
  quests: Quest[];
  questions: Question[];
  levels: Level[];
};

export const GUIDES: Record<string, Guide> = { TH: thailand };
export const guideFor = (code: string): Guide | undefined => GUIDES[code.toUpperCase()];
