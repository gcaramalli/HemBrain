"use client";

import { Dices, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/family-context";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { KitchenHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";
import { guessCategory } from "@/lib/categories";
import { slotNow } from "@/lib/meals";
import { dayKey } from "@/lib/dates";
import type { Recipe } from "@/lib/types";

type Draft = Omit<Recipe, "id"> & { id?: string };

const emptyRecipe: Draft = {
  title: "",
  description: null,
  ingredients: [],
  steps: null,
  tags: [],
  prep_minutes: null,
  servings: null,
  source_url: null,
  favorite: false,
  kid_friendly: false,
};

// Kitchen → Recipes: the family cookbook. What we ate lives in /meals.
export default function RecipesPage() {
  return <RecipesPanel />;
}

function RecipesPanel() {
  const { supabase, t } = useFamily();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Recipe | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("recipes").select("*").order("favorite", { ascending: false }).order("title");
    setRecipes((data ?? []) as Recipe[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort(), [recipes]);
  const filtered = recipes.filter((r) => {
    const hay = [r.title, r.description ?? "", ...r.ingredients, ...r.tags].join(" ").toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (!tag || r.tags.includes(tag));
  });

  function surprise() {
    const pool = filtered.length ? filtered : recipes;
    if (pool.length) setViewing(pool[Math.floor(Math.random() * pool.length)]);
  }

  return (
    <div className="flex flex-col gap-4">
      <KitchenHeader action={<button className="btn" onClick={() => setEditing({ ...emptyRecipe })}>+ {t("Recipe")}</button>} />
      <PageHem topic="recipes" />

      <div className="flex gap-2">
        <input className="input" placeholder={t("Search by name, ingredient, tag…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost shrink-0" onClick={surprise} disabled={!recipes.length} aria-label={t("Idea")}><Dices size={18} /></button>
      </div>

      {tags.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {tags.map((x) => (
            <button key={x} onClick={() => setTag(tag === x ? null : x)} className={`chip-toggle ${tag === x ? "chip-on" : ""}`}>
              {x}
            </button>
          ))}
        </div>
      )}

      {recipes.length === 0 ? (
        <div className="card text-center text-muted">
          <p className="text-3xl">🍲</p>
          <p className="mt-2">{t("No recipes yet. Add the family classics first: the kids' favourites, the weeknight 20-minute dinners.")}</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <button className="card w-full text-left" onClick={() => setViewing(r)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{r.title}</span>
                  <span>{r.favorite ? "⭐" : ""}{r.kid_friendly ? "👶" : ""}</span>
                </div>
                {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.prep_minutes && <span className="chip">⏱ {r.prep_minutes} min</span>}
                  {r.tags.map((x) => <span key={x} className="chip">{x}</span>)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? ""}>
        {viewing && (
          <RecipeView
            recipe={viewing}
            onEdit={() => {
              setEditing(viewing);
              setViewing(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit recipe") : t("New recipe")}>
        {editing && (
          <RecipeForm
            initial={editing}
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

function RecipeView({ recipe, onEdit }: { recipe: Recipe; onEdit: () => void }) {
  const { supabase, t } = useFamily();
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const [ate, setAte] = useState(false);

  async function weAteThis() {
    const { data, error } = await supabase
      .from("meals")
      .insert({ eaten_on: dayKey(new Date()), slot: slotNow(), title: recipe.title, recipe_id: recipe.id })
      .select("id")
      .single();
    if (error || !data) return toast(t("Could not save"));
    setAte(true);
    toast(t("Logged in what we ate"), async () => {
      await supabase.from("meals").delete().eq("id", data.id);
      setAte(false);
    });
  }

  async function addToGroceries() {
    const { data: list } = await supabase.from("lists").select("id").eq("kind", "grocery").order("position").limit(1).single();
    if (!list) return toast(t("Create a shopping list first."));
    await supabase.from("list_items").insert(recipe.ingredients.map((title) => ({ list_id: list.id, title, notes: t("for {recipe}", { recipe: recipe.title }), category: guessCategory(title) })));
    setAdded(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {recipe.description && <p className="text-muted">{recipe.description}</p>}
      <div className="flex flex-wrap gap-1">
        {recipe.prep_minutes && <span className="chip">⏱ {recipe.prep_minutes} min</span>}
        {recipe.servings && <span className="chip inline-flex items-center gap-1"><Users size={12} /> {recipe.servings}</span>}
        {recipe.tags.map((x) => <span key={x} className="chip">{x}</span>)}
      </div>
      {recipe.ingredients.length > 0 && (
        <div>
          <h3 className="font-semibold">{t("Ingredients")}</h3>
          <ul className="mt-1 list-disc pl-5">
            {recipe.ingredients.map((i, n) => <li key={n}>{i}</li>)}
          </ul>
          <button className="btn-ghost mt-2" onClick={addToGroceries} disabled={added}>
            {added ? `✓ ${t("Added to groceries")}` : t("Add all to groceries")}
          </button>
        </div>
      )}
      {recipe.steps && (
        <div>
          <h3 className="font-semibold">{t("Steps")}</h3>
          <p className="mt-1 whitespace-pre-wrap">{recipe.steps}</p>
        </div>
      )}
      {recipe.source_url && (
        <a href={recipe.source_url} target="_blank" rel="noreferrer" className="text-sm text-accent underline">{t("Original recipe")}</a>
      )}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={weAteThis} disabled={ate}>{ate ? `✓ ${t("Logged")}` : t("We ate this")}</button>
        <button className="btn-ghost" onClick={onEdit}>{t("Edit")}</button>
      </div>
    </div>
  );
}

function RecipeForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const { supabase, t } = useFamily();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [ingredients, setIngredients] = useState(initial.ingredients.join("\n"));
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      title: d.title,
      description: d.description,
      steps: d.steps,
      prep_minutes: d.prep_minutes,
      servings: d.servings,
      source_url: d.source_url,
      favorite: d.favorite,
      kid_friendly: d.kid_friendly,
      ingredients: ingredients.split("\n").map((s) => s.trim()).filter(Boolean),
      tags: tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    };
    const { error } = d.id ? await supabase.from("recipes").update(fields).eq("id", d.id) : await supabase.from("recipes").insert(fields);
    if (error) setError(error.message);
    else onDone();
  }

  async function remove() {
    if (!d.id) return;
    const { data: before } = await supabase.from("recipes").select("*").eq("id", d.id).single();
    await supabase.from("recipes").delete().eq("id", d.id);
    toast(t("Recipe deleted"), async () => {
      if (before) await supabase.from("recipes").insert(before);
      onDone();
    });
    onDone();
  }

  const num = (v: string) => (v ? Number(v) : null);

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <input className="input" placeholder={t("Name")} required value={d.title} onChange={(e) => set("title", e.target.value)} />
      <textarea className="input" placeholder={t("Short description")} value={d.description ?? ""} onChange={(e) => set("description", e.target.value || null)} />
      <div>
        <span className="label">{t("Ingredients (one per line)")}</span>
        <textarea className="input min-h-28" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder={t("400 g pasta\n2 carrots")} />
      </div>
      <div>
        <span className="label">{t("Steps")}</span>
        <textarea className="input min-h-28" value={d.steps ?? ""} onChange={(e) => set("steps", e.target.value || null)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="input" type="number" inputMode="numeric" placeholder={t("Minutes")} value={d.prep_minutes ?? ""} onChange={(e) => set("prep_minutes", num(e.target.value))} />
        <input className="input" type="number" inputMode="numeric" placeholder={t("Servings")} value={d.servings ?? ""} onChange={(e) => set("servings", num(e.target.value))} />
      </div>
      <input className="input" placeholder={t("Tags, comma separated (vegetarian, quick, batch)")} value={tags} onChange={(e) => setTags(e.target.value)} />
      <input className="input" type="url" placeholder={t("Link (optional)")} value={d.source_url ?? ""} onChange={(e) => set("source_url", e.target.value || null)} />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.favorite} onChange={(e) => set("favorite", e.target.checked)} /> ⭐ {t("Favourite")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.kid_friendly} onChange={(e) => set("kid_friendly", e.target.checked)} /> 👶 {t("Kid-friendly")}</label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1">{t("Save")}</button>
        {d.id && <button type="button" className="btn-ghost text-danger" onClick={remove}>{t("Delete")}</button>}
      </div>
    </form>
  );
}
