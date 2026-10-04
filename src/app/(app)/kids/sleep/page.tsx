"use client";

import { Moon, Sparkles, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/family-context";
import { useKid } from "@/components/kid-context";
import { PageHeader } from "@/components/page-header";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { addDays, dayKey, fmtDate, formatTime, startOfDay, toLocalInput } from "@/lib/dates";
import { avgClock, fmtDuration, minutesBetween, nightDay, sleepDays, sleepState } from "@/lib/sleep";
import type { KidSleep } from "@/lib/types";

const DAYS = 14;
type Draft = Pick<KidSleep, "kind" | "starts_at" | "ends_at" | "wakings" | "notes"> & { id?: string };

const localDay = (iso: string) => dayKey(new Date(iso));
const minutesOfDay = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

// Naps and nights, logged in one tap ("asleep" / "awake"), so Claude can
// look at the last days and suggest tonight's bedtime.
export default function SleepPage() {
  const { supabase, t } = useFamily();
  const { kid } = useKid();
  const toast = useToast();
  const [entries, setEntries] = useState<KidSleep[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [, tick] = useState(0);
  const kidId = kid?.id;

  const load = useCallback(async () => {
    if (!kidId) return;
    const since = addDays(startOfDay(new Date()), -DAYS).toISOString();
    const { data } = await supabase.from("kid_sleep").select("*").eq("kid_id", kidId).gte("starts_at", since).order("starts_at", { ascending: false });
    setEntries((data ?? []) as KidSleep[]);
  }, [supabase, kidId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("kid-sleep")
      .on("postgres_changes", { event: "*", schema: "public", table: "kid_sleep" }, load)
      .subscribe();
    // "Asleep for 1 h 20" keeps counting.
    const timer = setInterval(() => tick((n) => n + 1), 60000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [supabase, load]);

  const days = useMemo(() => sleepDays(entries, localDay), [entries]);

  if (!kid) return null;

  const state = sleepState(entries);
  const current = state?.asleep ? entries.find((e) => !e.ends_at) : undefined;
  const week = days.filter((d) => d.day >= dayKey(addDays(new Date(), -7)) && d.day < dayKey(new Date()));
  const nights = week.map((d) => d.night).filter((n) => n !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const avgTotal = avg(week.map((d) => d.night_minutes + d.nap_minutes));
  const avgBed = avgClock(nights.map((n) => n.start), minutesOfDay, true);
  const avgWake = avgClock(nights.map((n) => n.end).filter((e) => e !== null), minutesOfDay);

  // Logged mostly after the fact ("last night: 19:00 → 6:00"), prefilled
  // with the usual times and corrected as needed. A night can be saved with
  // only its bedtime and get its wake-up the next morning.
  const evening = new Date().getHours() >= 17 || new Date().getHours() < 5;
  const round5 = (d: Date) => new Date(Math.round(d.getTime() / 300000) * 300000);
  const at = (day: Date, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = startOfDay(day);
    d.setHours(h, m);
    return d;
  };
  const blank = { wakings: 0, notes: null };
  const logNight = () => {
    const today = new Date();
    if (evening) {
      // Tonight's bedtime, the wake-up comes tomorrow.
      const bed = new Date().getHours() < 5 ? at(addDays(today, -1), avgBed ?? "19:00") : at(today, avgBed ?? "19:00");
      setEditing({ kind: "night", starts_at: bed.toISOString(), ends_at: null, ...blank });
    } else {
      const wake = at(today, avgWake ?? "06:30");
      setEditing({ kind: "night", starts_at: at(addDays(today, -1), avgBed ?? "19:00").toISOString(), ends_at: (wake > today ? round5(today) : wake).toISOString(), ...blank });
    }
  };
  // A nap usually gets logged as it starts: now, still asleep. For one already
  // over, "Woke up" in the form adds the end.
  function logNap() {
    setEditing({ kind: "nap", starts_at: round5(new Date()).toISOString(), ends_at: null, ...blank });
  }
  // Wake-up of the sleep in progress, set (and adjustable) in the form.
  const setWakeUp = () => current && setEditing({ ...current, ends_at: round5(new Date()).toISOString() });

  async function asleepNow() {
    if (!kid) return;
    await supabase.from("kid_sleep").insert({ kid_id: kid.id, kind: evening ? "night" : "nap", starts_at: new Date().toISOString() });
    load();
  }

  async function addWaking() {
    if (!current) return;
    await supabase.from("kid_sleep").update({ wakings: current.wakings + 1 }).eq("id", current.id);
    load();
    toast(t("Waking noted"), async () => {
      await supabase.from("kid_sleep").update({ wakings: current.wakings }).eq("id", current.id);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("Sleep")}
        module="sleep"
        back="/kids"
        backLabel={`${kid.emoji} ${kid.name}`}
      />

      <section className="card flex flex-col gap-3">
        {state?.asleep && current ? (
          <>
            <p className="text-lg font-semibold">
              {current.kind === "night" ? "🌙" : "😴"} {t("Asleep since {time}", { time: formatTime(current.starts_at) })}
              <span className="font-normal text-muted"> · {fmtDuration(minutesBetween(current.starts_at, new Date()))}</span>
            </p>
            {current.kind === "night" && current.wakings > 0 && (
              <p className="text-sm text-muted">{current.wakings === 1 ? t("1 waking so far") : t("{n} wakings so far", { n: current.wakings })}</p>
            )}
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={setWakeUp}><Sun size={18} /> {t("Wake-up time")}</button>
              {current.kind === "night" && <button className="btn-ghost" onClick={addWaking}>+1 {t("waking")}</button>}
            </div>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">
              {state ? (
                <>
                  {t("Awake since {time}", { time: formatTime(state.since) })}
                  <span className="font-normal text-muted"> · {fmtDuration(minutesBetween(state.since, new Date()))}</span>
                </>
              ) : (
                t("Log {name}'s nights and naps, even afterwards.", { name: kid.name })
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className={evening ? "btn-ghost" : "btn"} onClick={logNap}>😴 {t("A nap")}</button>
              <button className={evening ? "btn" : "btn-ghost"} onClick={logNight}><Moon size={18} /> {evening ? t("Bedtime") : t("Last night")}</button>
            </div>
            <button className="self-start text-sm text-muted underline" onClick={asleepNow}>{t("Asleep right now")}</button>
          </>
        )}
      </section>

      {week.length > 0 && (
        <section className="card flex flex-col gap-1">
          <h2 className="font-semibold">{t("Last 7 days")}</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={t("Sleep per day")} value={avgTotal !== null ? fmtDuration(avgTotal) : "–"} />
            <Stat label={t("Bedtime")} value={avgBed ?? "–"} />
            <Stat label={t("Wake-up")} value={avgWake ?? "–"} />
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm">
        <Sparkles size={16} className="mt-0.5 shrink-0" />
        <span>{t("Ask Claude “when should {name} go to bed tonight?”: it reads the last days here.", { name: kid.name })}</span>
      </p>

      {/* Newest first, days and the entries within each day alike. */}
      {days.map((d) => (
        <section key={d.day}>
          <h3 className="flex items-baseline justify-between text-sm font-medium text-muted">
            <span className="capitalize">{fmtDate(new Date(d.day + "T12:00:00"), { weekday: "long", day: "numeric", month: "short" })}</span>
            <span className="tabular-nums">{fmtDuration(d.night_minutes + d.nap_minutes)}</span>
          </h3>
          <ul className="divide-y divide-border">
            {entries
              .filter((e) => (e.kind === "night" ? nightDay(e.starts_at, localDay) : localDay(e.starts_at)) === d.day)
              .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
              .map((e) => (
                <li key={e.id}>
                  <button className="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => setEditing(e)}>
                    <span className="text-xl">{e.kind === "night" ? "🌙" : "😴"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium tabular-nums">
                        {formatTime(e.starts_at)} → {e.ends_at ? formatTime(e.ends_at) : "…"}
                      </span>
                      <span className="block text-sm text-muted">
                        {fmtDuration(minutesBetween(e.starts_at, e.ends_at ?? new Date()))}
                        {e.wakings > 0 && ` · ${e.wakings === 1 ? t("1 waking") : t("{n} wakings", { n: e.wakings })}`}
                        {e.notes && ` · ${e.notes}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit") : t("Log sleep")}>
        {editing && (
          <SleepForm
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-accent-soft px-2 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function SleepForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const { supabase, t } = useFamily();
  const { kid } = useKid();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!kid) return;
    if (d.ends_at && d.ends_at <= d.starts_at) return setError(t("The end must be after the start."));
    const fields = { kind: d.kind, starts_at: d.starts_at, ends_at: d.ends_at, wakings: d.wakings, notes: d.notes?.trim() || null };
    const { error } = d.id
      ? await supabase.from("kid_sleep").update(fields).eq("id", d.id)
      : await supabase.from("kid_sleep").insert({ ...fields, kid_id: kid.id });
    if (error) setError(error.message);
    else onDone();
  }

  async function remove() {
    if (!d.id) return;
    const { data: before } = await supabase.from("kid_sleep").select("*").eq("id", d.id).single();
    await supabase.from("kid_sleep").delete().eq("id", d.id);
    onDone();
    toast(t("Deleted"), async () => {
      if (before) await supabase.from("kid_sleep").insert(before);
      onDone();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
        {(["nap", "night"] as const).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => set("kind", k)}
            className={`min-h-9 rounded-full ${d.kind === k ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}
          >
            {k === "nap" ? `😴 ${t("Nap")}` : `🌙 ${t("Night")}`}
          </button>
        ))}
      </div>
      <label>
        <span className="label">{t("Fell asleep")}</span>
        <input className="input" type="datetime-local" required value={toLocalInput(d.starts_at)} onChange={(e) => e.target.value && set("starts_at", new Date(e.target.value).toISOString())} />
      </label>
      {/* A toggle, not an empty field: iPhones can't clear a date-time input
          (their "Reset" puts the old value back). */}
      <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
        {([false, true] as const).map((awake) => (
          <button
            type="button"
            key={String(awake)}
            onClick={() => {
              if (!awake) return set("ends_at", null);
              if (d.ends_at) return;
              // Woke up now, or an hour after the start when that is still to come.
              const now = new Date(Math.round(Date.now() / 300000) * 300000);
              set("ends_at", (now.getTime() > new Date(d.starts_at).getTime() ? now : new Date(new Date(d.starts_at).getTime() + 3600000)).toISOString());
            }}
            className={`min-h-9 rounded-full ${!!d.ends_at === awake ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}
          >
            {awake ? t("Woke up") : t("Still asleep")}
          </button>
        ))}
      </div>
      {d.ends_at && (
        <label>
          <span className="label">{t("Woke up")}</span>
          <input className="input" type="datetime-local" required value={toLocalInput(d.ends_at)} onChange={(e) => e.target.value && set("ends_at", new Date(e.target.value).toISOString())} />
        </label>
      )}
      {d.kind === "night" && (
        <label>
          <span className="label">{t("Night wakings")}</span>
          <input className="input" type="number" min={0} max={30} value={d.wakings} onChange={(e) => set("wakings", Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
        </label>
      )}
      <input className="input" placeholder={t("Note (optional): teething, fever, long waking at 3…")} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1">{t("Save")}</button>
        {d.id && <button type="button" className="btn-ghost text-danger" onClick={remove}>{t("Delete")}</button>}
      </div>
    </form>
  );
}
