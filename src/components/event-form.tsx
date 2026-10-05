"use client";

import { ThinkingDots } from "@/components/thinking-dots";
import { useState } from "react";
import { useFamily } from "./family-context";
import { MemberSelect } from "./member-select";
import { useToast } from "./toast";
import { dayKey, toLocalInput } from "@/lib/dates";
import { RECURRENCES, type Recurrence } from "@/lib/recurrence";
import { notifyAssignment } from "@/lib/push-client";
import type { CalendarEvent, Member } from "@/lib/types";

// An event being created or edited. When it comes from the calendar it is one
// occurrence: `occurrence_start` is that day's start, `starts_at` the series'.
export type Draft = Omit<CalendarEvent, "id"> & { id?: string; occurrence_start?: string; occurrence_end?: string | null };

const MINUTES = [15, 30, 60, 120];

export function newEventDraft(day?: Date, me?: Member): Draft {
  const start = day ? new Date(day) : new Date();
  if (day) {
    start.setHours(9, 0, 0, 0);
  } else {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }
  return {
    title: "",
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 3600000).toISOString(),
    all_day: false,
    location: null,
    notes: null,
    responsible_member_id: me?.id ?? null,
    for_member_id: null,
    recurrence: null,
    recurrence_until: null,
    care: null,
    skip_dates: [],
  };
}

// Columns written to the database (drops occurrence-only keys).
function row(d: Draft) {
  return {
    title: d.title.trim(),
    starts_at: d.starts_at,
    ends_at: d.ends_at,
    all_day: d.all_day,
    location: d.location,
    notes: d.notes,
    responsible_member_id: d.responsible_member_id,
    for_member_id: d.for_member_id,
    recurrence: d.recurrence,
    recurrence_until: d.recurrence ? d.recurrence_until : null,
    care: d.care ?? null,
  };
}

type Scope = "one" | "all";

export function EventForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const { supabase, t, me, ai, members, memberById } = useFamily();
  const toast = useToast();
  // Edit the occurrence that was tapped, not the first one of the series.
  const [d, setD] = useState<Draft>(() =>
    initial.occurrence_start ? { ...initial, starts_at: initial.occurrence_start, ends_at: initial.occurrence_end ?? null } : initial,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<"save" | "delete" | null>(null);
  const [quick, setQuick] = useState("");
  const [thinking, setThinking] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const isSeries = Boolean(initial.id && initial.recurrence);
  const occDate = dayKey(initial.occurrence_start ?? initial.starts_at);
  const duration = d.ends_at ? Math.round((new Date(d.ends_at).getTime() - new Date(d.starts_at).getTime()) / 60000) : null;

  function setStart(iso: string) {
    // Moving the start keeps the duration.
    const shift = new Date(iso).getTime() - new Date(d.starts_at).getTime();
    setD((x) => ({ ...x, starts_at: iso, ends_at: x.ends_at ? new Date(new Date(x.ends_at).getTime() + shift).toISOString() : null }));
  }

  // "Jenny picks up Charlie Thursday 16:00" → fill the form.
  async function fillFromText(e: React.FormEvent) {
    e.preventDefault();
    if (!quick.trim()) return;
    setThinking(true);
    setError(null);
    const now = new Date();
    const res = await fetch("/api/ai/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: quick, now: `${toLocalInput(now)} (${now.toLocaleDateString("en-GB", { weekday: "long" })})` }),
    }).catch(() => null);
    setThinking(false);
    if (res?.status === 402) return setError(t("This month's AI budget is used up. It resets on the 1st."));
    if (!res?.ok) return setError(t("Couldn't understand that. Fill in the form below instead."));
    const x = (await res.json()) as {
      title: string; start: string; end: string | null; all_day: boolean; location: string | null;
      responsible: string | null; for_whom: string | null; care: Draft["care"]; repeats: Recurrence | null;
    };
    const byName = (n: string | null) => (n ? members.find((m) => m.name.toLowerCase().startsWith(n.toLowerCase()))?.id ?? null : null);
    const start = new Date(x.all_day ? `${x.start.slice(0, 10)}T00:00` : x.start);
    const end = x.end ? new Date(x.all_day ? `${x.end.slice(0, 10)}T23:59` : x.end) : null;
    if (isNaN(start.getTime())) return setError(t("Couldn't understand that. Fill in the form below instead."));
    setD((cur) => ({
      ...cur,
      title: x.title,
      starts_at: start.toISOString(),
      ends_at: end && !isNaN(end.getTime()) ? end.toISOString() : null,
      all_day: x.all_day,
      location: x.location ?? cur.location,
      responsible_member_id: byName(x.responsible) ?? cur.responsible_member_id,
      for_member_id: byName(x.for_whom),
      care: x.care,
      recurrence: x.repeats,
    }));
    setQuick("");
  }

  async function save(scope?: Scope) {
    if (isSeries && !scope) return setAsk("save");
    setAsk(null);
    setBusy(true);
    const fields = row(d);
    let res;
    if (!initial.id) {
      res = await supabase.from("events").insert(fields);
    } else if (isSeries && scope === "one") {
      // Take this day out of the series and make it its own event.
      res = await supabase.from("events").update({ skip_dates: [...(initial.skip_dates ?? []), occDate] }).eq("id", initial.id);
      if (!res.error) res = await supabase.from("events").insert({ ...fields, recurrence: null, recurrence_until: null });
    } else if (isSeries) {
      // Apply the change to the whole series: shift its first date by as much as this one moved.
      const shift = new Date(d.starts_at).getTime() - new Date(initial.occurrence_start ?? initial.starts_at).getTime();
      const seriesStart = new Date(new Date(initial.starts_at).getTime() + shift);
      const length = d.ends_at ? new Date(d.ends_at).getTime() - new Date(d.starts_at).getTime() : null;
      res = await supabase
        .from("events")
        .update({ ...fields, starts_at: seriesStart.toISOString(), ends_at: length !== null ? new Date(seriesStart.getTime() + length).toISOString() : null })
        .eq("id", initial.id);
    } else {
      res = await supabase.from("events").update(fields).eq("id", initial.id);
    }
    setBusy(false);
    if (res.error) return setError(res.error.message);
    if (d.responsible_member_id !== initial.responsible_member_id || !initial.id) notifyAssignment(memberById(d.responsible_member_id), me, d);
    toast(initial.id ? t("Saved") : t("Added to the calendar"));
    onDone();
  }

  async function remove(scope?: Scope) {
    if (!initial.id) return;
    if (isSeries && !scope) return setAsk("delete");
    setAsk(null);
    const original = { ...row(initial), id: initial.id, skip_dates: initial.skip_dates ?? [] };
    if (isSeries && scope === "one") {
      await supabase.from("events").update({ skip_dates: [...original.skip_dates, occDate] }).eq("id", initial.id);
      toast(t("Deleted this one"), async () => {
        await supabase.from("events").update({ skip_dates: original.skip_dates }).eq("id", original.id);
      });
    } else {
      // Put back the series' own dates, not the tapped occurrence's.
      original.starts_at = initial.starts_at;
      original.ends_at = initial.ends_at;
      await supabase.from("events").delete().eq("id", initial.id);
      toast(t("Deleted"), async () => {
        await supabase.from("events").insert(original);
      });
    }
    onDone();
  }

  if (ask) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted">{t("This event repeats.")}</p>
        <button className="btn" onClick={() => (ask === "save" ? save("one") : remove("one"))}>
          {ask === "save" ? t("Change only this one") : t("Delete only this one")}
        </button>
        <button className={ask === "save" ? "btn-ghost py-3" : "btn-ghost py-3 text-danger"} onClick={() => (ask === "save" ? save("all") : remove("all"))}>
          {ask === "save" ? t("Change all of them") : t("Delete all of them")}
        </button>
        <button className="py-2 text-sm text-muted" onClick={() => setAsk(null)}>{t("Back")}</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {ai && !initial.id && (
        <form onSubmit={fillFromText} className="flex gap-2">
          <input
            className="input"
            placeholder={t("Type it: Jenny picks up Charlie Thursday 16:00")}
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            enterKeyHint="go"
          />
          <button className="btn-ghost shrink-0" disabled={thinking || !quick.trim()} aria-label={t("Fill in")}>
            {thinking ? <ThinkingDots size={6} /> : "✨"}
          </button>
        </form>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-3"
      >
        <input className="input" placeholder={t("What? e.g. Preschool pick-up")} required value={d.title} onChange={(e) => set("title", e.target.value)} autoFocus={!ai || Boolean(initial.id)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.all_day} onChange={(e) => set("all_day", e.target.checked)} /> {t("All day")}
        </label>
        <div>
          <span className="label">{t("Starts")}</span>
          <input
            className="input"
            type={d.all_day ? "date" : "datetime-local"}
            required
            value={d.all_day ? toLocalInput(d.starts_at).slice(0, 10) : toLocalInput(d.starts_at)}
            onChange={(e) => e.target.value && setStart(new Date(d.all_day ? e.target.value + "T00:00" : e.target.value).toISOString())}
          />
        </div>
        {!d.all_day && (
          <div className="flex flex-wrap gap-2">
            {MINUTES.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => set("ends_at", new Date(new Date(d.starts_at).getTime() + m * 60000).toISOString())}
                className={`min-h-9 rounded-full border px-3 text-sm ${duration === m ? "border-foreground bg-foreground text-background" : "border-border"}`}
              >
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </button>
            ))}
          </div>
        )}
        <div>
          <span className="label">{d.all_day ? t("Last day (optional)") : t("Ends (optional)")}</span>
          <input
            className="input"
            type={d.all_day ? "date" : "datetime-local"}
            value={d.ends_at ? (d.all_day ? toLocalInput(d.ends_at).slice(0, 10) : toLocalInput(d.ends_at)) : ""}
            onChange={(e) => set("ends_at", e.target.value ? new Date(d.all_day ? e.target.value + "T23:59" : e.target.value).toISOString() : null)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="label">{t("Who's responsible")}</span>
            <MemberSelect value={d.responsible_member_id} onChange={(v) => set("responsible_member_id", v)} placeholder={t("Nobody")} />
          </div>
          <div>
            <span className="label">{t("For whom")}</span>
            <MemberSelect value={d.for_member_id} onChange={(v) => set("for_member_id", v)} placeholder={t("Everyone")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="label">{t("Repeats")}</span>
            <select className="input" value={d.recurrence ?? ""} onChange={(e) => set("recurrence", (e.target.value || null) as Recurrence | null)}>
              <option value="">{t("Never")}</option>
              {RECURRENCES.map((r) => (
                <option key={r.id} value={r.id}>{t(r.label)}</option>
              ))}
            </select>
          </div>
          {d.recurrence && (
            <div>
              <span className="label">{t("Until (optional)")}</span>
              <input className="input" type="date" value={d.recurrence_until ?? ""} onChange={(e) => set("recurrence_until", e.target.value || null)} />
            </div>
          )}
        </div>
        <input className="input" placeholder={t("Where?")} value={d.location ?? ""} onChange={(e) => set("location", e.target.value || null)} />
        <textarea className="input min-h-20" placeholder={t("Notes")} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button className="btn flex-1" disabled={busy}>{initial.id ? t("Save") : t("Add to calendar")}</button>
          {initial.id && <button type="button" className="btn-ghost text-danger" onClick={() => remove()}>{t("Delete")}</button>}
        </div>
      </form>
    </div>
  );
}
