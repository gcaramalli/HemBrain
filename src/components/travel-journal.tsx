"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "./family-context";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { fmtDate } from "@/lib/dates";
import { planTrip } from "@/lib/trips";
import type { JournalEntry, Trip } from "@/lib/types";

type Draft = { id?: string; kind: "stay" | "day"; date: string; to: string; title: string; place: string; city: string; body: string };

const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (s: string) => new Date(`${s}T12:00:00`);
const days = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86400000);

// The trip notebook: where we sleep, and a few lines each day. Written here or by Claude through
// the connector (add_journal). Shared by the family.
export function TravelJournal({ country = "TH" }: { country?: string }) {
  const { supabase, members, t } = useFamily();
  const toast = useToast();
  const [rows, setRows] = useState<JournalEntry[] | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("journal_entries").select("*").eq("country", country).order("entry_date").order("created_at");
    setRows((data ?? []) as JournalEntry[]);
  }, [supabase, country]);
  useEffect(() => {
    load();
  }, [load]);

  const stays = useMemo(() => (rows ?? []).filter((r) => r.kind === "stay"), [rows]);
  const notes = useMemo(() => (rows ?? []).filter((r) => r.kind === "day").reverse(), [rows]);
  const start = rows?.[0]?.entry_date;
  const today = ymd();
  const here = stays.filter((s) => s.entry_date <= today && (!s.end_date || s.end_date >= today)).at(-1);
  const dayNo = (d: string) => (start ? days(start, d) + 1 : 1);

  const draft = (kind: Draft["kind"]): Draft => ({ kind, date: today, to: "", title: "", place: "", city: here?.city ?? "", body: "" });

  async function save(d: Draft) {
    const row = {
      country,
      kind: d.kind,
      entry_date: d.date,
      end_date: d.kind === "stay" && d.to && d.to >= d.date ? d.to : null,
      title: d.title.trim() || null,
      place: d.place.trim() || null,
      city: d.city.trim() || null,
      body: d.body.trim() || null,
    };
    const { error } = d.id ? await supabase.from("journal_entries").update(row).eq("id", d.id) : await supabase.from("journal_entries").insert(row);
    if (error) return toast(error.message);
    await putOnTimeline(d.date);
    setEdit(null);
    load();
  }

  // The first note in a month puts the trip on the timeline (and ticks the country on the map).
  async function putOnTimeline(date: string) {
    const { data } = await supabase.from("trips").select("id, country, start_month, end_month, lived").eq("country", country);
    const plan = planTrip((data ?? []) as Trip[], country, date);
    if (plan.action === "extend") await supabase.from("trips").update({ end_month: plan.end_month }).eq("id", plan.id);
    if (plan.action === "insert") await supabase.from("trips").insert({ country, start_month: plan.start_month, member_ids: members.map((m) => m.id) });
  }

  async function remove(d: Draft) {
    const row = rows?.find((r) => r.id === d.id);
    if (!row) return;
    await supabase.from("journal_entries").delete().eq("id", row.id);
    setEdit(null);
    load();
    toast(t("Entry deleted"), async () => {
      await supabase.from("journal_entries").insert(row);
      load();
    });
  }

  const open = (r: JournalEntry) =>
    setEdit({ id: r.id, kind: r.kind, date: r.entry_date, to: r.end_date ?? "", title: r.title ?? "", place: r.place ?? "", city: r.city ?? "", body: r.body ?? "" });
  const when = (s: string) => fmtDate(day(s), { weekday: "short", day: "numeric", month: "short" });

  if (rows === null) return <div className="card h-40" />;
  return (
    <>
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("Travel journal")}</div>
            <div className="text-lg font-bold leading-tight">
              {start ? t("Day {n}", { n: dayNo(today) }) : t("Not started yet")}
              {here && <span className="font-medium text-muted"> · {here.city || here.title || here.place}</span>}
            </div>
          </div>
          <div className="text-3xl" aria-hidden>📓</div>
        </div>
        <div className="flex gap-2">
          <button className="btn grow" onClick={() => setEdit(draft("day"))}>+ {t("Today's note")}</button>
          <button className="btn-ghost" onClick={() => setEdit(draft("stay"))}>+ {t("Stay")}</button>
        </div>
        <p className="text-xs text-muted">{t("Tell Claude “we're at the Silq hotel in Bangkok since 12 Nov” or “today we visited Wat Pho” and it lands here.")}</p>
      </section>

      {stays.length > 0 && (
        <section className="card flex flex-col gap-1 p-4">
          <h3 className="font-bold">{t("Where we sleep")}</h3>
          <ol className="flex flex-col divide-y divide-border">
            {stays.map((s) => (
              <li key={s.id}>
                <button className="flex min-h-14 w-full items-center gap-3 py-2 text-left" onClick={() => open(s)}>
                  <span aria-hidden className="text-xl">🛏️</span>
                  <span className="min-w-0 grow">
                    <span className="block font-semibold leading-tight">{s.title || s.place}</span>
                    <span className="block text-xs text-muted">
                      {[s.city, `${when(s.entry_date)} → ${s.end_date ? when(s.end_date) : t("now")}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {s === here && <span className="chip text-xs">{t("here")}</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {notes.length === 0 ? (
        <p className="card p-4 text-sm text-muted">{t("Nothing written yet. A few lines a day make a good travel book.")}</p>
      ) : (
        notes.map((n) => (
          <button key={n.id} className="card flex flex-col gap-1 p-4 text-left" onClick={() => open(n)}>
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
              <span>{t("Day {n}", { n: dayNo(n.entry_date) })} · {when(n.entry_date)}</span>
              <span>{[n.place, n.city].filter(Boolean).join(" · ")}</span>
            </div>
            {n.title && <div className="font-bold leading-snug">{n.title}</div>}
            {n.body && <p className="whitespace-pre-line text-sm">{n.body}</p>}
          </button>
        ))
      )}

      {edit && (
        <Sheet open onClose={() => setEdit(null)} title={edit.kind === "stay" ? t("Stay") : t("Day note")}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save(edit);
            }}
          >
            <div className="flex gap-2">
              <div className="grow">
                <span className="label">{edit.kind === "stay" ? t("Arrival") : t("Date")}</span>
                <input type="date" required className="input" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
              </div>
              {edit.kind === "stay" && (
                <div className="grow">
                  <span className="label">{t("Departure")}</span>
                  <input type="date" className="input" value={edit.to} min={edit.date} onChange={(e) => setEdit({ ...edit, to: e.target.value })} />
                </div>
              )}
            </div>
            <input className="input" placeholder={edit.kind === "stay" ? t("Hotel name") : t("A headline (optional)")} maxLength={200} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <div className="flex gap-2">
              <input className="input" placeholder={t("City or area")} maxLength={100} value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
              {edit.kind === "day" && <input className="input" placeholder={t("Place")} maxLength={200} value={edit.place} onChange={(e) => setEdit({ ...edit, place: e.target.value })} />}
            </div>
            <textarea className="input min-h-32" placeholder={edit.kind === "stay" ? t("Notes (optional)") : t("What did we do today?")} maxLength={4000} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            <button className="btn" disabled={edit.kind === "day" && !edit.title.trim() && !edit.body.trim()}>{t("Save")}</button>
            {edit.id && (
              <button type="button" className="btn-ghost text-danger" onClick={() => remove(edit)}>
                {t("Delete")}
              </button>
            )}
          </form>
        </Sheet>
      )}
    </>
  );
}
