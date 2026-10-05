"use client";

import { Utensils } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "./family-context";
import { KitchenHeader } from "./page-header";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { addDays, dayKey, fmtDate, startOfDay } from "@/lib/dates";
import { FOOD_GROUPS, groupCounts, MEAL_PLACES, MEAL_SLOTS, REACTIONS, slotNow, type MealPlace, type MealSlot } from "@/lib/meals";
import type { Meal, Recipe } from "@/lib/types";

export type MealDraft = Omit<Meal, "id" | "created_at"> & { id?: string };
type Draft = MealDraft;

// Groups whose absence is worth pointing out over a week.
const WATCH = ["vegetables", "fish", "legumes"];
const DAYS = 14;

// Who ate: everyone (all), a meal with the kids, or the parents on their own.
type Who = "all" | "kids" | "parents";

// What we ate, day by day, and how the last week looks. Mostly filled in by
// Claude ("we had salmon and potatoes tonight"); editable here.
export function MealsPanel() {
  const { supabase, kids, t } = useFamily();
  const [all, setAll] = useState<Meal[]>([]);
  const [who, setWho] = useState<Who>("all");
  const [recipes, setRecipes] = useState<Pick<Recipe, "id" | "title">[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const since = dayKey(addDays(startOfDay(new Date()), -(DAYS - 1)));
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from("meals").select("*").gte("eaten_on", since).order("eaten_on", { ascending: false }).order("created_at"),
      supabase.from("recipes").select("id, title").order("title"),
    ]);
    setAll((m ?? []) as Meal[]);
    setRecipes((r ?? []) as Pick<Recipe, "id" | "title">[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // No member_ids = everyone, so the kids too; parents only = only adults listed.
  const meals = useMemo(() => {
    if (who === "all" || !kids.length) return all;
    const kidIds = new Set(kids.map((k) => k.id));
    const withKids = (m: Meal) => m.member_ids.length === 0 || m.member_ids.some((id) => kidIds.has(id));
    return all.filter((m) => (who === "kids" ? withKids(m) : !withKids(m)));
  }, [all, who, kids]);

  const weekStart = dayKey(addDays(startOfDay(new Date()), -6));
  const week = meals.filter((m) => m.eaten_on >= weekStart);
  const counts = groupCounts(week);
  const missing = FOOD_GROUPS.filter((g) => WATCH.includes(g.id) && !counts[g.id]);
  const byDay = useMemo(() => {
    const map = new Map<string, Meal[]>();
    for (const m of meals) map.set(m.eaten_on, [...(map.get(m.eaten_on) ?? []), m]);
    for (const list of map.values()) list.sort((a, b) => MEAL_SLOTS.findIndex((s) => s.id === a.slot) - MEAL_SLOTS.findIndex((s) => s.id === b.slot));
    return [...map.entries()];
  }, [meals]);

  const blank = (): Draft => ({ eaten_on: dayKey(new Date()), slot: slotNow(), title: "", recipe_id: null, food_groups: [], place: "home", member_ids: [], notes: null });

  return (
    <div className="flex flex-col gap-4">
      <KitchenHeader action={<button className="btn" onClick={() => setEditing(blank())}>+ {t("Meal")}</button>} />

      {kids.length > 0 && all.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            ["all", t("All")],
            ["kids", kids.length === 1 ? t("With {name}", { name: kids[0].name }) : t("With the kids")],
            ["parents", t("Parents only")],
          ] as [Who, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setWho(id)} aria-pressed={who === id} className={`chip-toggle ${who === id ? "chip-on" : ""}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {meals.length === 0 && all.length > 0 ? (
        <p className="card text-center text-sm text-muted">{t("No meals here in the last two weeks.")}</p>
      ) : meals.length === 0 ? (
        <div className="card text-center text-muted">
          <Utensils size={28} className="mx-auto" />
          <p className="mt-2">{t("Nothing logged yet. Tell Hem “we had salmon and potatoes tonight”, or add it here. After a week you'll see how balanced it was.")}</p>
        </div>
      ) : (
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold">{t("Last 7 days")} <span className="font-normal text-muted">· {week.length === 1 ? t("1 meal") : t("{n} meals", { n: week.length })}</span></h2>
          <div className="flex flex-wrap gap-1">
            {FOOD_GROUPS.filter((g) => counts[g.id]).map((g) => (
              <span key={g.id} className="chip">{g.emoji} {t(g.label)} × {counts[g.id]}</span>
            ))}
          </div>
          {missing.length > 0 && week.length >= 3 && (
            <p className="text-sm text-muted">{t("Not this week: {groups}", { groups: missing.map((g) => `${g.emoji} ${t(g.label)}`).join(", ") })}</p>
          )}
        </section>
      )}

      {byDay.map(([day, list]) => (
        <section key={day}>
          <h3 className="text-sm font-medium capitalize text-muted">{fmtDate(new Date(day + "T12:00:00"), { weekday: "long", day: "numeric", month: "short" })}</h3>
          <ul className="divide-y divide-border">
            {list.map((m) => (
              <li key={m.id}>
                <button className="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => setEditing(m)}>
                  <span className="text-xl">{MEAL_SLOTS.find((s) => s.id === m.slot)?.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.title}</span>
                    <span className="block text-sm">
                      {m.food_groups.map((g) => FOOD_GROUPS.find((x) => x.id === g)?.emoji).join(" ")}
                      {m.place !== "home" && <span className="text-muted"> · {t(MEAL_PLACES.find((p) => p.id === m.place)!.label)}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit meal") : t("What did we eat?")}>
        {editing && (
          <MealForm
            initial={editing}
            recipes={recipes}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

// `kid` (kid tab → Food): also asks how the kid took it.
export function MealForm({ initial, recipes, onDone, kid }: { initial: Draft; recipes: Pick<Recipe, "id" | "title">[]; onDone: () => void; kid?: string }) {
  const { supabase, members, t } = useFamily();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const recipe = recipes.find((r) => r.title.toLowerCase() === d.title.trim().toLowerCase());
    const fields = {
      eaten_on: d.eaten_on,
      slot: d.slot,
      title: d.title.trim(),
      recipe_id: recipe?.id ?? (recipes.some((r) => r.id === d.recipe_id) && d.title === initial.title ? d.recipe_id : null),
      food_groups: d.food_groups,
      place: d.place,
      member_ids: d.member_ids,
      notes: d.notes?.trim() || null,
      reaction: d.reaction ?? null,
    };
    const { error } = d.id ? await supabase.from("meals").update(fields).eq("id", d.id) : await supabase.from("meals").insert(fields);
    if (error) setError(error.message);
    else onDone();
  }

  async function remove() {
    if (!d.id) return;
    const { data: before } = await supabase.from("meals").select("*").eq("id", d.id).single();
    await supabase.from("meals").delete().eq("id", d.id);
    onDone();
    toast(t("Meal deleted"), async () => {
      if (before) await supabase.from("meals").insert(before);
      onDone();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <input className="input" list="meal-recipes" placeholder={t("e.g. Salmon, potatoes, green beans")} required value={d.title} onChange={(e) => set("title", e.target.value)} />
      <datalist id="meal-recipes">
        {recipes.map((r) => <option key={r.id} value={r.title} />)}
      </datalist>
      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <input className="input" type="date" required value={d.eaten_on} onChange={(e) => set("eaten_on", e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {MEAL_SLOTS.map((s) => (
            <button type="button" key={s.id} onClick={() => set("slot", s.id as MealSlot)} className={`chip-toggle ${d.slot === s.id ? "chip-on" : ""}`} aria-label={t(s.label)} title={t(s.label)}>
              {s.emoji}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">{t("On the plate")}</span>
        <div className="flex flex-wrap gap-1.5">
          {FOOD_GROUPS.map((g) => (
            <button type="button" key={g.id} onClick={() => set("food_groups", toggle(d.food_groups, g.id))} className={`chip-toggle ${d.food_groups.includes(g.id) ? "chip-on" : ""}`}>
              {g.emoji} {t(g.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MEAL_PLACES.map((p) => (
          <button type="button" key={p.id} onClick={() => set("place", p.id as MealPlace)} className={`chip-toggle ${d.place === p.id ? "chip-on" : ""}`}>
            {p.emoji} {t(p.label)}
          </button>
        ))}
      </div>
      <div>
        <span className="label">{t("Who ate (nobody selected = everyone)")}</span>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <button type="button" key={m.id} onClick={() => set("member_ids", toggle(d.member_ids, m.id))} className={`chip-toggle ${d.member_ids.includes(m.id) ? "chip-on" : ""}`}>
              {m.emoji} {m.name}
            </button>
          ))}
        </div>
      </div>
      {kid && (
        <div>
          <span className="label">{t("How did {name} like it?", { name: kid })}</span>
          <div className="flex flex-wrap gap-1.5">
            {REACTIONS.map((r) => (
              <button type="button" key={r.id} onClick={() => set("reaction", d.reaction === r.id ? null : r.id)} className={`chip-toggle ${d.reaction === r.id ? "chip-on" : ""}`}>
                {r.emoji} {t(r.label)}
              </button>
            ))}
          </div>
        </div>
      )}
      <input className="input" placeholder={t("Note (optional): loved it, too salty…")} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1">{t("Save")}</button>
        {d.id && <button type="button" className="btn-ghost text-danger" onClick={remove}>{t("Delete")}</button>}
      </div>
    </form>
  );
}
