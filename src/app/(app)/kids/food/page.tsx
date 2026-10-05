"use client";

import { ThinkingDots } from "@/components/thinking-dots";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/family-context";
import { useKid } from "@/components/kid-context";
import { MealForm, type MealDraft } from "@/components/meals-panel";
import { PageHeader } from "@/components/page-header";
import { Sheet } from "@/components/sheet";
import { addDays, dayKey, fmtDate, startOfDay } from "@/lib/dates";
import { FOOD_GROUPS, groupCounts, MEAL_SLOTS, REACTIONS, slotNow } from "@/lib/meals";
import type { Meal, Recipe } from "@/lib/types";

const DAYS = 14;
// Likes and refusals are remembered over a longer stretch.
const TASTE_DAYS = 90;

// What the kid ate (their own meals and the family's), how it went down, and
// what they love or refuse, so Claude can suggest what to cook for them.
// The reaction is stored on the meal: with several kids eating the same
// family meal it is the one set last.
export default function KidFoodPage() {
  const { supabase, t } = useFamily();
  const { kid } = useKid();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [recipes, setRecipes] = useState<Pick<Recipe, "id" | "title">[]>([]);
  const [editing, setEditing] = useState<MealDraft | null>(null);
  const kidId = kid?.id;

  const load = useCallback(async () => {
    if (!kidId) return;
    const since = dayKey(addDays(startOfDay(new Date()), -(TASTE_DAYS - 1)));
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase
        .from("meals")
        .select("*")
        .or(`member_ids.cs.{${kidId}},member_ids.eq.{}`)
        .gte("eaten_on", since)
        .order("eaten_on", { ascending: false })
        .order("created_at"),
      supabase.from("recipes").select("id, title").order("title"),
    ]);
    setMeals((m ?? []) as Meal[]);
    setRecipes((r ?? []) as Pick<Recipe, "id" | "title">[]);
  }, [supabase, kidId]);

  useEffect(() => {
    load();
  }, [load]);

  const recent = meals.filter((m) => m.eaten_on >= dayKey(addDays(startOfDay(new Date()), -(DAYS - 1))));
  const byDay = useMemo(() => {
    const map = new Map<string, Meal[]>();
    for (const m of recent) map.set(m.eaten_on, [...(map.get(m.eaten_on) ?? []), m]);
    for (const list of map.values()) list.sort((a, b) => MEAL_SLOTS.findIndex((s) => s.id === a.slot) - MEAL_SLOTS.findIndex((s) => s.id === b.slot));
    return [...map.entries()];
  }, [recent]);

  if (!kid) return null;

  const week = meals.filter((m) => m.eaten_on >= dayKey(addDays(startOfDay(new Date()), -6)));
  const counts = groupCounts(week);
  const titles = (reaction: string) => [...new Set(meals.filter((m) => m.reaction === reaction).map((m) => m.title))].slice(0, 12);
  const loved = titles("loved");
  const refused = titles("refused");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("Food")}
        module="food"
        back="/kids"
        backLabel={`${kid.emoji} ${kid.name}`}
        action={
          <button
            className="btn"
            onClick={() => setEditing({ eaten_on: dayKey(new Date()), slot: slotNow(), title: "", recipe_id: null, food_groups: [], place: "home", member_ids: [kid.id], notes: null, reaction: null })}
          >
            + {t("Meal")}
          </button>
        }
      />

      {week.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold">{t("Last 7 days")} <span className="font-normal text-muted">· {week.length === 1 ? t("1 meal") : t("{n} meals", { n: week.length })}</span></h2>
          <div className="flex flex-wrap gap-1">
            {FOOD_GROUPS.filter((g) => counts[g.id]).map((g) => (
              <span key={g.id} className="chip">{g.emoji} {t(g.label)} × {counts[g.id]}</span>
            ))}
          </div>
        </section>
      )}

      {(loved.length > 0 || refused.length > 0) && (
        <section className="card flex flex-col gap-2">
          {loved.length > 0 && <Tastes label={`😋 ${t("Loves")}`} items={loved} />}
          {refused.length > 0 && <Tastes label={`🙅 ${t("Refuses")}`} items={refused} />}
        </section>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm">
        <span className="mt-1.5 shrink-0"><ThinkingDots size={6} still /></span>
        <span>{t("Ask Hem “what should {name} eat tonight?”: it sees what {name} ate and liked here.", { name: kid.name })}</span>
      </p>

      {byDay.length === 0 && <p className="card text-center text-muted">{t("Nothing logged yet. Family meals count too; mark here how {name} took them.", { name: kid.name })}</p>}

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
                    <span className="block text-sm text-muted">
                      {m.food_groups.map((g) => FOOD_GROUPS.find((x) => x.id === g)?.emoji).join(" ")}
                      {m.member_ids.length === 0 && ` · ${t("Family meal")}`}
                    </span>
                  </span>
                  <span className="text-xl" aria-label={m.reaction ? t(REACTIONS.find((r) => r.id === m.reaction)!.label) : undefined}>
                    {REACTIONS.find((r) => r.id === m.reaction)?.emoji ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit meal") : t("What did {name} eat?", { name: kid.name })}>
        {editing && (
          <MealForm
            initial={editing}
            recipes={recipes}
            kid={kid.name}
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

function Tastes({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((i) => <span key={i} className="chip">{i}</span>)}
      </div>
    </div>
  );
}
