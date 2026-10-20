"use client";

import { Check, Clapperboard, Tv } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { PageHeader } from "@/components/page-header";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import type { WatchItem } from "@/lib/types";

type Draft = Pick<WatchItem, "kind" | "title" | "recommended_by" | "platform" | "notes"> & { id?: string };

const blank: Draft = { kind: "film", title: "", recommended_by: "", platform: "", notes: "" };

// Films and series people recommend to us: add them one by one, tick them off once watched.
export default function WatchPage() {
  const { supabase, t } = useFamily();
  const toast = useToast();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [tab, setTab] = useState<"to_watch" | "watched">("to_watch");
  const [kind, setKind] = useState<"all" | WatchItem["kind"]>("all");
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("watchlist").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as WatchItem[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = (items ?? []).filter((i) => i.status === tab && (kind === "all" || i.kind === kind));
  const count = (s: WatchItem["status"]) => (items ?? []).filter((i) => i.status === s).length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const fields = {
      kind: editing.kind,
      title: editing.title.trim(),
      recommended_by: editing.recommended_by?.trim() || null,
      platform: editing.platform?.trim() || null,
      notes: editing.notes?.trim() || null,
    };
    if (editing.id) await supabase.from("watchlist").update(fields).eq("id", editing.id);
    else await supabase.from("watchlist").insert(fields);
    setEditing(null);
    load();
  }

  async function setStatus(i: WatchItem, status: WatchItem["status"]) {
    await supabase.from("watchlist").update({ status, watched_on: status === "watched" ? new Date().toLocaleDateString("sv") : null }).eq("id", i.id);
    load();
  }

  async function remove() {
    if (!editing?.id) return;
    const before = items?.find((i) => i.id === editing.id);
    await supabase.from("watchlist").delete().eq("id", editing.id);
    setEditing(null);
    load();
    toast(t("Removed"), async () => {
      if (before) await supabase.from("watchlist").insert(before);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        module="watch"
        back="/"
        backLabel={t("Home")}
        title={t("Films & series")}
        action={<button className="btn" onClick={() => setEditing(blank)}>+ {t("Add")}</button>}
      />
      <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
        {(["to_watch", "watched"] as const).map((x) => (
          <button key={x} onClick={() => setTab(x)} className={`min-h-9 rounded-full ${tab === x ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
            {x === "to_watch" ? t("To watch") : t("Watched")} · {count(x)}
          </button>
        ))}
      </div>
      <div className="flex gap-2 text-sm">
        {(["all", "film", "series"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`chip-toggle ${kind === k ? "chip-on" : ""}`}>
            {k === "all" ? t("All") : k === "film" ? t("Films") : t("Series")}
          </button>
        ))}
      </div>

      <ul className="grid gap-3">
        {shown.map((i) => (
          <li key={i.id} className="card flex items-start gap-3">
            <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => setEditing({ id: i.id, kind: i.kind, title: i.title, recommended_by: i.recommended_by ?? "", platform: i.platform ?? "", notes: i.notes ?? "" })}>
              {i.kind === "film" ? <Clapperboard size={18} className="mt-0.5 shrink-0 text-muted" aria-label={t("Film")} /> : <Tv size={18} className="mt-0.5 shrink-0 text-muted" aria-label={t("Series")} />}
              <span className="min-w-0">
                <span className="block font-semibold">{i.title}</span>
                {(i.recommended_by || i.platform) && (
                  <span className="mt-0.5 block text-sm text-muted">
                    {[i.recommended_by && t("Recommended by {name}", { name: i.recommended_by }), i.platform].filter(Boolean).join(" · ")}
                  </span>
                )}
                {i.notes && <span className="mt-1 line-clamp-2 block whitespace-pre-wrap text-sm text-muted">{i.notes}</span>}
              </span>
            </button>
            <button
              className="btn-ghost flex h-11 w-11 shrink-0 items-center justify-center"
              onClick={() => setStatus(i, i.status === "watched" ? "to_watch" : "watched")}
              aria-label={i.status === "watched" ? t("Back to the list") : t("Mark as watched")}
            >
              <Check size={18} className={i.status === "watched" ? "text-accent" : "text-muted"} />
            </button>
          </li>
        ))}
        {items !== null && shown.length === 0 && (
          <li className="card text-sm text-muted">{tab === "to_watch" ? t("Nothing to watch yet. Add what people recommend to you, one by one.") : t("Nothing watched yet.")}</li>
        )}
      </ul>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit") : t("New film or series")}>
        {editing && (
          <form onSubmit={save} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
              {(["film", "series"] as const).map((k) => (
                <button type="button" key={k} onClick={() => setEditing({ ...editing, kind: k })} className={`min-h-9 rounded-full ${editing.kind === k ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
                  {k === "film" ? t("Film") : t("Series")}
                </button>
              ))}
            </div>
            <input className="input" placeholder={t("Title")} required autoFocus value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <input className="input" placeholder={t("Recommended by")} value={editing.recommended_by ?? ""} onChange={(e) => setEditing({ ...editing, recommended_by: e.target.value })} />
            <input className="input" placeholder={t("Where to watch (Netflix, SVT Play…)")} value={editing.platform ?? ""} onChange={(e) => setEditing({ ...editing, platform: e.target.value })} />
            <textarea className="input min-h-24" placeholder={t("Notes")} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            <div className="flex gap-2">
              <button className="btn flex-1">{t("Save")}</button>
              {editing.id && <button type="button" className="btn-ghost text-danger" onClick={remove}>{t("Delete")}</button>}
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
