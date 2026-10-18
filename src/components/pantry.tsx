"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "./family-context";
import { useToast } from "./toast";
import { guessCategory } from "@/lib/categories";
import { fmtDate } from "@/lib/dates";
import { stockOf, type Stock } from "@/lib/restock";

const Pantry3D = dynamic(() => import("./pantry-3d"), { ssr: false });
const DAY = 86_400_000;

// Kitchen → Purchases: the pantry. What we buy regularly as jars on a shelf,
// each as full as what's probably left, soonest due first; tap one for how
// often we buy it and when next, and put it on the shopping list.
export function Pantry({ refreshKey }: { refreshKey?: number }) {
  const { supabase, t } = useFamily();
  const toast = useToast();
  const [rows, setRows] = useState<{ item_name: string; purchased_at: string }[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [flat, setFlat] = useState(false);
  const [now, setNow] = useState(0); // set once loaded (no clock reads while rendering)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 365 * DAY).toISOString();
    const { data } = await supabase.from("purchases").select("item_name, purchased_at").gte("purchased_at", since).order("purchased_at").limit(3000);
    setRows(data ?? []);
    setNow(Date.now());
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const stock = useMemo(() => stockOf(rows ?? [], new Date(now)).slice(0, 12), [rows, now]);
  if (!rows || stock.length === 0) return null;

  const days = (s: Stock) => (s.next ? Math.round((s.next.getTime() - now) / DAY) : null);
  const jars = stock.map((s) => ({ left: s.left, soon: (days(s) ?? 99) <= 3 }));
  const sel = picked !== null ? stock[picked] : null;

  async function addToList(s: Stock) {
    const { data: list } = await supabase.from("lists").select("id").eq("kind", "grocery").order("position").limit(1).maybeSingle();
    if (!list) return;
    await supabase.from("list_items").insert({ list_id: list.id, title: s.name, category: guessCategory(s.name) });
    toast(t("{item} added to the shopping list", { item: s.name }));
  }

  const when = (s: Stock) => {
    const d = days(s);
    if (d === null) return t("Still learning: bought once, on {date}", { date: fmtDate(s.last, { day: "numeric", month: "short" }) });
    const next = d < 0 ? t("{n}d overdue", { n: -d }) : d === 0 ? t("today") : t("in {n}d", { n: d });
    return `${t("About every {n} days", { n: Math.round(s.interval!) })} · ${t("next: {when}", { when: next })}${s.confidence === "low" ? ` · ${t("a rough guess so far")}` : ""}`;
  };

  return (
    <section className="card flex flex-col gap-2 p-0">
      {!flat && (
        <div className="relative w-full" style={{ aspectRatio: `4 / ${1.4 + Math.min(3, Math.ceil(stock.length / 4)) * 0.75}` }}>
          <Pantry3D jars={jars} names={stock.map((s) => s.name)} onPick={setPicked} onFail={() => setFlat(true)} />
        </div>
      )}
      <div className="flex flex-col gap-2 px-4 pb-4">
        {sel ? (
          <>
            <p className="font-semibold">{sel.name}</p>
            <p className="text-sm text-muted">{when(sel)}</p>
            <button className="btn self-start" onClick={() => addToList(sel)}>+ {t("Shopping list")}</button>
          </>
        ) : flat ? (
          <ul className="divide-y divide-border text-sm">
            {stock.map((s, i) => (
              <li key={s.key}>
                <button className="flex w-full justify-between gap-3 py-1.5 text-left" onClick={() => setPicked(i)}>
                  <span>{s.name}</span>
                  <span className="text-muted">{days(s) === null ? "…" : when(s).split(" · ")[1]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("Each jar is as full as what's probably left. Tap one to see how often you buy it.")}</p>
        )}
      </div>
    </section>
  );
}
