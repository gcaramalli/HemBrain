import { createLucideIcon, Wallet, Apple, Earth, Gauge, Lightbulb, SlidersHorizontal, Baby, Backpack, Bell, Brain, BriefcaseBusiness, FileText, CalendarDays, ChartColumn, ChefHat, CookingPot, ListChecks, Lock, Moon, Receipt, Settings, Shirt, ShoppingCart, UserRound, Utensils, type LucideIcon } from "lucide-react";

// Hembrain's own mark as a line icon (the Home tab): the house that is also a
// speech bubble, with the three dots (the family, and Claude thinking).
const HemHome = createLucideIcon("hem-home", [
  ["path", { d: "M12 3.5 4 9.8v10.7l3.2-2.1H19a1 1 0 0 0 1-1V9.8z", key: "house" }],
  ["circle", { cx: "8.9", cy: "13.4", r: "1.35", fill: "currentColor", fillOpacity: 1, stroke: "none", key: "a" }],
  ["circle", { cx: "12", cy: "13.4", r: "1.35", fill: "currentColor", fillOpacity: 1, stroke: "none", key: "b" }],
  ["circle", { cx: "15.1", cy: "13.4", r: "1.35", fill: "currentColor", fillOpacity: 1, stroke: "none", key: "c" }],
]);

// Each part of the app has its own hue, used only to find your way (tab icons,
// hub tiles, page titles). Data about people keeps the people's colours.
export const MODULES = {
  today: { color: "#5b8def", Icon: HemHome },
  calendar: { color: "#9b7bf0", Icon: CalendarDays },
  todo: { color: "#3fbf7f", Icon: ListChecks },
  kids: { color: "#f5904a", Icon: Baby },
  preschool: { color: "#f5904a", Icon: Backpack },
  wardrobe: { color: "#e07ab4", Icon: Shirt },
  sleep: { color: "#7d8cf2", Icon: Moon },
  food: { color: "#3fbf7f", Icon: Apple },
  kitchen: { color: "#f2b441", Icon: CookingPot },
  shopping: { color: "#f2b441", Icon: ShoppingCart },
  meals: { color: "#4f9bf5", Icon: Utensils },
  recipes: { color: "#f5904a", Icon: ChefHat },
  purchases: { color: "#3fbf7f", Icon: Receipt },
  brain: { color: "#f0826f", Icon: Brain },
  expenses: { color: "#2fa37a", Icon: Wallet },
  papers: { color: "#5aa9c9", Icon: FileText },
  travels: { color: "#2fa4c9", Icon: Earth },
  me: { color: "#e07ab4", Icon: UserRound },
  private: { color: "#e07ab4", Icon: Lock },
  work: { color: "#c98a4b", Icon: BriefcaseBusiness },
  profile: { color: "#5b8def", Icon: UserRound },
  connections: { color: "#2fc2b0", Icon: Bell },
  family: { color: "#7d8cf2", Icon: Settings },
  stats: { color: "#3fbf7f", Icon: ChartColumn },
  settings: { color: "#8a94a6", Icon: SlidersHorizontal },
  feedback: { color: "#f2b441", Icon: Lightbulb },
  ai: { color: "#9b7bf0", Icon: Gauge },
} satisfies Record<string, { color: string; Icon: LucideIcon }>;

export type ModuleId = keyof typeof MODULES;
