import type { Memory, Occasion, Person } from "./types";

// The family's memory of people (Brain → People, connector remember / recall / get_person).
// No Supabase and no React here: the app and the connector share it.

export const CIRCLES = [
  { id: "relative", label: "Family" },
  { id: "friend", label: "Friend" },
  { id: "child", label: "Child" },
  { id: "other", label: "Other" },
] as const;
export const CIRCLE_IDS = CIRCLES.map((c) => c.id) as [Person["circle"], ...Person["circle"][]];

// In the order a person's page shows them: what helps for a gift first.
export const MEMORY_KINDS = [
  { id: "like", label: "Likes" },
  { id: "dislike", label: "Doesn't like" },
  { id: "gift_idea", label: "Gift ideas" },
  { id: "gift_given", label: "Gifts given" },
  { id: "size", label: "Sizes" },
  { id: "allergy", label: "Allergies" },
  { id: "fact", label: "Good to know" },
  { id: "moment", label: "Moments" },
] as const;
export const MEMORY_KIND_IDS = MEMORY_KINDS.map((k) => k.id) as [Memory["kind"], ...Memory["kind"][]];

// Lower case, no accents: "Léo" is found by "leo".
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Every word of the query appears somewhere in the text.
export function matches(text: string, query: string) {
  const hay = fold(text);
  return fold(query).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

// A person by name: the exact name, else the only one with that word in their name
// ("Paul" → "Paul Martin", not "Pauline"), else the only one starting with it, else the only one containing it.
export function findPerson<T extends { name: string }>(rows: T[], name: string): T | undefined {
  const n = fold(name);
  if (!n) return undefined;
  const only = (list: T[]) => (list.length === 1 ? list[0] : undefined);
  const exact = rows.find((r) => fold(r.name) === n);
  if (exact) return exact;
  const word = rows.filter((r) => fold(r.name).split(/\s+/).includes(n));
  if (word.length) return only(word);
  const starts = rows.filter((r) => fold(r.name).startsWith(n));
  if (starts.length) return only(starts);
  return only(rows.filter((r) => fold(r.name).includes(n)));
}

// Dates about this person: linked to them, or naming them as a whole word ("Paul & Anna", not "Pauline" or "Jean-Paul").
export function occasionsOf<O extends Pick<Occasion, "title" | "person_ids">>(person: Pick<Person, "id" | "name">, occasions: O[]): O[] {
  const first = fold(person.name).split(/\s+/)[0];
  const word = new RegExp(`(^|[^a-z0-9-])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`);
  return occasions.filter((o) => (o.person_ids ?? []).includes(person.id) || (first.length > 1 && word.test(fold(o.title))));
}

// Memories grouped by kind, in MEMORY_KINDS order, newest first inside each.
export function byKind<M extends Pick<Memory, "kind" | "created_at">>(memories: M[]) {
  return MEMORY_KINDS.map((k) => ({
    kind: k,
    items: memories.filter((m) => m.kind === k.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  })).filter((g) => g.items.length > 0);
}
