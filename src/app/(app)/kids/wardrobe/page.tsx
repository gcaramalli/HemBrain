"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { useKid } from "@/components/kid-context";
import { PageHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { ageInMonths, dayKey, fmtDate } from "@/lib/dates";
import type { KidClothes } from "@/lib/types";
import { CLOTHES_CATEGORIES, CLOTHES_STATUSES, missingEssentials, probablyTooSmall } from "@/lib/wardrobe";


// The wardrobe plate in 3D; three.js loads after the page.
const Wardrobe3D = dynamic(() => import("@/components/kid-3d").then((m) => m.Wardrobe3D), { ssr: false });
type Draft = Pick<KidClothes, "title" | "category" | "size" | "status" | "notes"> & { id?: string };

// The kid's sizes, what's in the drawer, what to buy, and the season's
// essentials still missing (rain gear, overall, mittens…).
export default function WardrobePage() {
  const { supabase, t } = useFamily();
  const { kid } = useKid();
  const toast = useToast();
  const [clothes, setClothes] = useState<KidClothes[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [sizes, setSizes] = useState(false);
  const [showOutgrown, setShowOutgrown] = useState(false);
  const [flat, setFlat] = useState(false);
  const kidId = kid?.id;

  const load = useCallback(async () => {
    if (!kidId) return;
    const { data } = await supabase.from("kid_clothes").select("*").eq("kid_id", kidId).order("created_at");
    setClothes((data ?? []) as KidClothes[]);
  }, [supabase, kidId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!kid) return null;

  const need = clothes.filter((c) => c.status === "need");
  const have = clothes.filter((c) => c.status === "have");
  const outgrown = clothes.filter((c) => c.status === "outgrown");
  const missing = missingEssentials(clothes, t);
  const age = kid.birthdate ? ageInMonths(kid.birthdate) : null;
  const sizeFor = (category: string) => (category === "shoes" ? kid.shoe_size : kid.clothing_size);
  const blank = (status: Draft["status"], title = "", category = "other"): Draft => ({ title, category, size: sizeFor(category), status, notes: null });

  async function setStatus(c: KidClothes, status: KidClothes["status"]) {
    await supabase.from("kid_clothes").update({ status, updated_at: new Date().toISOString() }).eq("id", c.id);
    load();
    toast(status === "have" ? t("Bought: {item}", { item: c.title }) : t("Moved to too small"), async () => {
      await supabase.from("kid_clothes").update({ status: c.status }).eq("id", c.id);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("Wardrobe")}
        module="wardrobe"
        back="/kids"
        backLabel={`${kid.emoji} ${kid.name}`}
        action={<button className="btn" onClick={() => setEditing(blank("have"))}>+ {t("Clothes")}</button>}
      />

      <PageHem topic="wardrobe" kid={kid} />

      {/* One plot per category in use: folded clothes, a ghost for what to buy, a box for what's too small. */}
      {!flat && clothes.length > 0 && (() => {
        const cats = CLOTHES_CATEGORIES.filter((c) => clothes.some((x) => x.category === c.id));
        const count = (id: string, status: string) => clothes.filter((x) => x.category === id && x.status === status).length;
        return (
          <div className="card relative aspect-[4/3] overflow-hidden p-0">
            <Wardrobe3D
              rails={cats.map((c) => ({ have: count(c.id, "have"), need: count(c.id, "need"), outgrown: count(c.id, "outgrown") }))}
              names={cats.map((c) => `${c.emoji} ${t(c.label).split(",")[0]}`)}
              color={kid.color}
              onPick={(i) => (document.getElementById(`wardrobe-${cats[i].id}`) ?? document.getElementById("wardrobe-need"))?.scrollIntoView({ behavior: "smooth", block: "start" })}
              onFail={() => setFlat(true)}
            />
          </div>
        );
      })()}

      <button className="card grid grid-cols-2 gap-2 text-left" onClick={() => setSizes(true)}>
        <span>
          <span className="block text-xs text-muted">{t("Clothing size")}</span>
          <span className="text-2xl font-bold tabular-nums">{kid.clothing_size || "–"}</span>
        </span>
        <span>
          <span className="block text-xs text-muted">{t("Shoe size")}</span>
          <span className="text-2xl font-bold tabular-nums">{kid.shoe_size || "–"}</span>
        </span>
        <span className="col-span-2 text-xs text-muted">
          {kid.sizes_updated_on ? t("Updated {date}", { date: fmtDate(kid.sizes_updated_on + "T12:00:00", { day: "numeric", month: "short", year: "numeric" }) }) : t("Tap to add the sizes")}
        </span>
      </button>

      <section id="wardrobe-need" className="flex scroll-mt-20 flex-col gap-1">
        <h2 className="h2">{t("To buy")}</h2>
        <ul className="divide-y divide-border">
          {need.map((c) => (
            <li key={c.id} className="flex min-h-12 items-center gap-3">
              <button
                onClick={() => setStatus(c, "have")}
                aria-label={t("Mark as bought")}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-border"
              />
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(c)}>
                <span className="break-words">{c.title}</span>
                {c.size && <span className="ml-2 chip">{c.size}</span>}
              </button>
            </li>
          ))}
          {!need.length && <li className="py-2 text-sm text-muted">{t("Nothing to buy.")}</li>}
        </ul>
        <button className="self-start text-sm text-muted underline" onClick={() => setEditing(blank("need"))}>+ {t("Something to buy")}</button>
      </section>

      {missing.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold">{t("Maybe missing this season")}</h2>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((e) => (
              <button key={e.title} className="chip-toggle" onClick={() => setEditing(blank("need", t(e.title), e.category))}>
                + {t(e.title)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t("Tap to add it to the list, or switch it to “Has” if it’s already there.")}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="h2">{t("Has")}</h2>
        {!have.length && <p className="text-sm text-muted">{t("Note what {name} has, with the size: you'll see what's getting too small.", { name: kid.name })}</p>}
        {CLOTHES_CATEGORIES.map((cat) => {
          const list = have.filter((c) => c.category === cat.id);
          if (!list.length) return null;
          return (
            <div key={cat.id} id={`wardrobe-${cat.id}`} className="scroll-mt-20">
              <h3 className="border-b border-border pb-1 text-sm font-semibold">{cat.emoji} {t(cat.label)}</h3>
              <ul className="divide-y divide-border">
                {list.map((c) => {
                  const small = probablyTooSmall(c.size, sizeFor(c.category), age, c.category === "shoes");
                  return (
                    <li key={c.id} className="flex min-h-12 items-center gap-2">
                      <button className="min-w-0 flex-1 py-2 text-left" onClick={() => setEditing(c)}>
                        <span className="break-words">{c.title}</span>
                        {c.size && <span className={`ml-2 chip ${small ? "text-danger" : ""}`}>{c.size}</span>}
                      </button>
                      {small && <button className="btn-ghost min-h-9 text-xs" onClick={() => setStatus(c, "outgrown")}>{t("Too small?")}</button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      {outgrown.length > 0 && (
        <section>
          <button className="text-sm text-muted underline" onClick={() => setShowOutgrown(!showOutgrown)}>
            {showOutgrown ? t("Hide too small") : t("Too small ({n})", { n: outgrown.length })}
          </button>
          {showOutgrown && (
            <ul className="mt-1 divide-y divide-border">
              {outgrown.map((c) => (
                <li key={c.id}>
                  <button className="flex min-h-11 w-full items-center gap-2 text-left text-muted" onClick={() => setEditing(c)}>
                    <span className="min-w-0 flex-1 break-words">{c.title}</span>
                    {c.size && <span className="chip">{c.size}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit") : editing?.status === "need" ? t("To buy") : t("Clothes")}>
        {editing && (
          <ClothesForm
            initial={editing}
            sizeFor={sizeFor}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Sheet>

      <Sheet open={sizes} onClose={() => setSizes(false)} title={t("Sizes")}>
        {sizes && <SizesForm onDone={() => setSizes(false)} />}
      </Sheet>
    </div>
  );
}

function ClothesForm({ initial, sizeFor, onDone }: { initial: Draft; sizeFor: (category: string) => string | null; onDone: () => void }) {
  const { supabase, t } = useFamily();
  const { kid } = useKid();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!kid) return;
    const fields = { title: d.title.trim(), category: d.category, size: d.size?.trim() || null, status: d.status, notes: d.notes?.trim() || null, updated_at: new Date().toISOString() };
    const { error } = d.id
      ? await supabase.from("kid_clothes").update(fields).eq("id", d.id)
      : await supabase.from("kid_clothes").insert({ ...fields, kid_id: kid.id });
    if (error) setError(error.message);
    else onDone();
  }

  async function remove() {
    if (!d.id) return;
    const { data: before } = await supabase.from("kid_clothes").select("*").eq("id", d.id).single();
    await supabase.from("kid_clothes").delete().eq("id", d.id);
    onDone();
    toast(t("Deleted"), async () => {
      if (before) await supabase.from("kid_clothes").insert(before);
      onDone();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <input className="input" autoFocus={!d.title} required placeholder={t("e.g. Rain trousers, 3 bodysuits")} value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
      <div className="grid grid-cols-3 rounded-full bg-accent-soft p-1 text-sm">
        {CLOTHES_STATUSES.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => set("status", s.id)}
            className={`min-h-9 rounded-full ${d.status === s.id ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}
          >
            {t(s.label)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CLOTHES_CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => setD((x) => ({ ...x, category: c.id, size: x.size && x.size !== sizeFor(x.category) ? x.size : sizeFor(c.id) }))}
            className={`chip-toggle ${d.category === c.id ? "chip-on" : ""}`}
          >
            {c.emoji} {t(c.label)}
          </button>
        ))}
      </div>
      <label>
        <span className="label">{t("Size")}</span>
        <input className="input" placeholder={t("e.g. 92 or 23")} value={d.size ?? ""} onChange={(e) => set("size", e.target.value)} maxLength={20} />
      </label>
      <input className="input" placeholder={t("Note (optional): brand, where to buy, from grandma…")} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={!d.title.trim()}>{t("Save")}</button>
        {d.id && <button type="button" className="btn-ghost text-danger" onClick={remove}>{t("Delete")}</button>}
      </div>
    </form>
  );
}

function SizesForm({ onDone }: { onDone: () => void }) {
  const { supabase, t } = useFamily();
  const { kid } = useKid();
  const router = useRouter();
  const [clothing, setClothing] = useState(kid?.clothing_size ?? "");
  const [shoes, setShoes] = useState(kid?.shoe_size ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!kid) return;
    await supabase
      .from("members")
      .update({ clothing_size: clothing.trim() || null, shoe_size: shoes.trim() || null, sizes_updated_on: dayKey(new Date()) })
      .eq("id", kid.id);
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">{t("Clothing size")}</span>
          <input className="input" inputMode="numeric" placeholder="92" value={clothing} onChange={(e) => setClothing(e.target.value)} maxLength={20} />
        </label>
        <label>
          <span className="label">{t("Shoe size")}</span>
          <input className="input" inputMode="numeric" placeholder="23" value={shoes} onChange={(e) => setShoes(e.target.value)} maxLength={20} />
        </label>
      </div>
      <p className="text-xs text-muted">{t("Clothes in centimetres (86, 92, 98…), shoes in EU sizes.")}</p>
      <button className="btn">{t("Save")}</button>
    </form>
  );
}
