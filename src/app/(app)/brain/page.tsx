"use client";

import { Pin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { OccasionsPanel } from "@/components/occasions-panel";
import { PageHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import type { Note } from "@/lib/types";

type Draft = Pick<Note, "title" | "body" | "pinned"> & { id?: string; tags: string };

// Free-form family facts: kindergarten address and pickup rules, allergies,
// doctor, sizes, Wi-Fi... Also the context Claude reads before acting.
export default function BrainPage() {
  const { supabase, t } = useFamily();
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [tab, setTab] = useState<"notes" | "dates">("notes");

  // Deep link from reminders and the calendar: /brain?tab=dates
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "dates") setTab("dates");
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase.from("notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false });
    setNotes((data ?? []) as Note[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = notes.filter((n) => !q || `${n.title} ${n.body} ${n.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const fields = {
      title: editing.title,
      body: editing.body,
      pinned: editing.pinned,
      tags: editing.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      updated_at: new Date().toISOString(),
    };
    if (editing.id) await supabase.from("notes").update(fields).eq("id", editing.id);
    else await supabase.from("notes").insert(fields);
    setEditing(null);
    load();
  }

  async function remove() {
    if (!editing?.id) return;
    const before = notes.find((n) => n.id === editing.id);
    await supabase.from("notes").delete().eq("id", editing.id);
    setEditing(null);
    load();
    toast(t("Note deleted"), async () => {
      if (before) await supabase.from("notes").insert(before);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader module="brain"
        back="/"
        backLabel={t("Home")}
        title={t("Family brain")}
        action={tab === "notes" && <button className="btn" onClick={() => setEditing({ title: "", body: "", pinned: false, tags: "" })}>+ {t("Note")}</button>}
      />
      <PageHem topic="brain" />
      <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
        {(["notes", "dates"] as const).map((x) => (
          <button key={x} onClick={() => setTab(x)} className={`min-h-9 rounded-full ${tab === x ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
            {x === "notes" ? t("Notes") : t("Dates")}
          </button>
        ))}
      </div>
      {tab === "dates" ? <OccasionsPanel /> : <>
      <input className="input" placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} />

      <ul className="grid gap-3">
        {filtered.map((n) => (
          <li key={n.id}>
            <button className="card w-full text-left" onClick={() => setEditing({ id: n.id, title: n.title, body: n.body, pinned: n.pinned, tags: n.tags.join(", ") })}>
              <div className="flex items-center gap-1.5 font-semibold">{n.pinned && <Pin size={14} className="shrink-0" aria-label={t("Pinned")} />}{n.title}</div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
              {n.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">{n.tags.map((x) => <span key={x} className="chip">{x}</span>)}</div>
              )}
            </button>
          </li>
        ))}
        {notes.length === 0 && <li className="card text-sm text-muted">{t("Start with “Preschool”: address, opening hours, who is allowed to pick up the kids.")}</li>}
      </ul>

      </>}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit note") : t("New note")}>
        {editing && (
          <form onSubmit={save} className="flex flex-col gap-3">
            <input className="input" placeholder={t("Title")} required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <textarea className="input min-h-40" placeholder={t("Details")} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            <input className="input" placeholder={t("Tags (charlie, health, school)")} value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.pinned} onChange={(e) => setEditing({ ...editing, pinned: e.target.checked })} /> {t("Pin to top")}
            </label>
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
