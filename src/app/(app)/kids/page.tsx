"use client";

import { Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { HubTile } from "@/components/hub-tile";
import { useKid, useKidAge } from "@/components/kid-context";
import { KidSettingsSheet } from "@/components/kid-settings";
import { PageHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";
import { BoardView } from "@/components/private-space";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { formatTime } from "@/lib/dates";
import { fmtDuration, minutesBetween, sleepState } from "@/lib/sleep";
import type { KidBoard, KidItem, KidSleep, Meal } from "@/lib/types";

type Draft = Pick<KidBoard, "emoji" | "title" | "kind">;

// The kid tab: one tile per part of the kid's life (preschool, clothes,
// sleep, food), plus the family's own list and note tiles.
export default function KidPage() {
  const { supabase, kids, t } = useFamily();
  const { kid, setKidId } = useKid();
  const age = useKidAge();
  const toast = useToast();
  const [sleep, setSleep] = useState<KidSleep[]>([]);
  const [toBuy, setToBuy] = useState(0);
  const [clothes, setClothes] = useState<number | null>(null);
  const [lastMeal, setLastMeal] = useState<Meal | null>(null);
  const [boards, setBoards] = useState<KidBoard[]>([]);
  const [items, setItems] = useState<KidItem[]>([]);
  const [settings, setSettings] = useState(false);
  const [creating, setCreating] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const kidId = kid?.id;

  const load = useCallback(async () => {
    if (!kidId) return;
    const [s, c, all, m, b] = await Promise.all([
      supabase.from("kid_sleep").select("*").eq("kid_id", kidId).order("starts_at", { ascending: false }).limit(10),
      supabase.from("kid_clothes").select("id", { count: "exact", head: true }).eq("kid_id", kidId).eq("status", "need"),
      supabase.from("kid_clothes").select("id", { count: "exact", head: true }).eq("kid_id", kidId),
      supabase.from("meals").select("*").or(`member_ids.cs.{${kidId}},member_ids.eq.{}`).order("eaten_on", { ascending: false }).order("created_at", { ascending: false }).limit(1),
      supabase.from("kid_boards").select("*").eq("kid_id", kidId).order("position").order("created_at"),
    ]);
    const ids = (b.data ?? []).map((x) => x.id);
    const i = ids.length ? await supabase.from("kid_items").select("*").in("board_id", ids).order("created_at") : { data: [] };
    setSleep((s.data ?? []) as KidSleep[]);
    setToBuy(c.count ?? 0);
    setClothes(all.count ?? 0);
    setLastMeal(((m.data ?? []) as Meal[])[0] ?? null);
    setBoards((b.data ?? []) as KidBoard[]);
    setItems((i.data ?? []) as KidItem[]);
  }, [supabase, kidId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("kid-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "kid_sleep" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  if (!kid) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="h1">{t("Kids")}</h1>
        <p className="card text-muted">{t("Add your children in Me → Family settings (they don't need an account) to plan drop-offs and pick-ups here.")}</p>
      </div>
    );
  }

  const state = sleepState(sleep);
  const sleepSub = !state
    ? t("Naps, nights, wakings")
    : state.asleep
      ? t("Asleep since {time} ({duration})", { time: formatTime(state.since), duration: fmtDuration(minutesBetween(state.since, new Date())) })
      : t("Awake since {time} ({duration})", { time: formatTime(state.since), duration: fmtDuration(minutesBetween(state.since, new Date())) });
  const sizes = [kid.clothing_size && t("Size {size}", { size: kid.clothing_size }), kid.shoe_size && t("Shoes {size}", { size: kid.shoe_size })].filter(Boolean);
  const wardrobeSub = [...sizes, toBuy ? (toBuy === 1 ? t("1 to buy") : t("{n} to buy", { n: toBuy })) : null].filter(Boolean).join(" · ") || t("Sizes, clothes, what's missing");
  const open = boards.find((b) => b.id === openId) ?? null;
  // Tiles nobody has filled in yet are drawn dashed: they show what is there to use.
  const loaded = clothes !== null;
  const noPreschool = !kid.care_place && !kid.care_days?.length;
  const noSleep = loaded && sleep.length === 0;
  const noWardrobe = loaded && clothes === 0 && sizes.length === 0;
  const noFood = loaded && !lastMeal;

  async function create(d: Draft) {
    const title = d.title.trim();
    if (!title || !kid) return;
    const position = boards.reduce((m, b) => Math.max(m, b.position + 1), 0);
    const { data } = await supabase.from("kid_boards").insert({ ...d, title, kid_id: kid.id, position }).select().single();
    setCreating(null);
    await load();
    if (data) setOpenId(data.id);
  }

  async function removeBoard(board: KidBoard) {
    const kept = items.filter((i) => i.board_id === board.id);
    await supabase.from("kid_boards").delete().eq("id", board.id);
    setOpenId(null);
    load();
    toast(t("Tile deleted"), async () => {
      await supabase.from("kid_boards").insert(board);
      if (kept.length) await supabase.from("kid_items").insert(kept);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <span className="flex flex-col">
            <span>{kid.emoji} {kid.name}</span>
            {age(kid) && <span className="text-sm font-normal tracking-normal text-muted">{age(kid)}</span>}
          </span>
        }
        action={<button className="btn-ghost" onClick={() => setSettings(true)} aria-label={t("Settings for {name}", { name: kid.name })}><Settings size={18} /></button>}
      />

      <PageHem topic="kid_week" kid={kid} />

      {kids.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {kids.map((k) => (
            <button key={k.id} onClick={() => setKidId(k.id)} className={`chip-toggle ${k.id === kid.id ? "chip-on" : ""}`}>
              {k.emoji} {k.name}
            </button>
          ))}
        </div>
      )}

      <nav className="grid grid-cols-2 gap-3">
        <HubTile href="/kids/preschool" module="preschool" title={t("Preschool")} sub={kid.care_place || t("Drop-offs and pick-ups")} empty={noPreschool} />
        <HubTile href="/kids/sleep" module="sleep" title={t("Sleep")} sub={sleepSub} empty={noSleep} />
        <HubTile href="/kids/wardrobe" module="wardrobe" title={t("Wardrobe")} sub={wardrobeSub} empty={noWardrobe} />
        <HubTile href="/kids/food" module="food" title={t("Food")} sub={lastMeal ? t("Last: {meal}", { meal: lastMeal.title }) : t("What {name} eats and likes", { name: kid.name })} empty={noFood} />
        {boards.map((b) => {
          const left = items.filter((i) => i.board_id === b.id && !i.done).length;
          return (
            <button key={b.id} onClick={() => setOpenId(b.id)} className="card flex min-h-32 flex-col justify-between gap-3 p-4 text-left transition-transform active:scale-[0.98]">
              <span className="min-w-0">
                <span className="line-clamp-2 block text-[1.05rem] font-bold leading-tight">{b.title}</span>
                {b.kind === "list" && left > 0 && <span className="text-sm tabular-nums text-muted">{left}</span>}
              </span>
              <span className="self-end text-3xl leading-none">{b.emoji}</span>
            </button>
          );
        })}
        <button
          onClick={() => setCreating({ emoji: "📝", title: "", kind: "list" })}
          className="flex min-h-32 flex-col justify-between gap-3 rounded-[22px] border border-dashed border-border p-4 text-left text-muted"
        >
          <span className="font-bold">+ {t("Tile")}</span>
          <span className="text-sm">{t("Vaccinations, activities, first words…")}</span>
        </button>
      </nav>

      <KidSettingsSheet kid={kid} open={settings} onClose={() => setSettings(false)} />

      <Sheet open={!!creating} onClose={() => setCreating(null)} title={t("New tile")}>
        {creating && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create(creating);
            }}
          >
            <div className="flex gap-2">
              <input
                className="input w-16 text-center text-xl"
                value={creating.emoji}
                onChange={(e) => setCreating({ ...creating, emoji: e.target.value })}
                aria-label={t("Emoji")}
                maxLength={16}
              />
              <input
                className="input"
                autoFocus
                placeholder={t("e.g. Vaccinations")}
                value={creating.title}
                onChange={(e) => setCreating({ ...creating, title: e.target.value })}
                maxLength={80}
              />
            </div>
            <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
              {(["list", "note"] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setCreating({ ...creating, kind: k })}
                  className={`min-h-9 rounded-full ${creating.kind === k ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}
                >
                  {k === "list" ? t("List") : t("Note")}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{t("Shared with the family.")}</p>
            <button className="btn" disabled={!creating.title.trim()}>{t("Create")}</button>
          </form>
        )}
      </Sheet>

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? `${open.emoji} ${open.title}` : ""}>
        {open && (
          <BoardView
            key={open.id}
            board={open}
            items={items.filter((i) => i.board_id === open.id)}
            onChanged={load}
            onDelete={() => removeBoard(open)}
            tables={{ boards: "kid_boards", items: "kid_items" }}
          />
        )}
      </Sheet>
    </div>
  );
}
