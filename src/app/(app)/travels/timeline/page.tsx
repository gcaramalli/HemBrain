"use client";

import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { TravelsHeader } from "@/components/page-header";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { countryName, findCountry, flag, tripWhen } from "@/lib/countries";
import Link from "next/link";
import type { JournalEntry, Trip } from "@/lib/types";

type Draft = { id?: string; place: string; start: string; end: string; lived: boolean; note: string; member_ids: string[] };

// Each person's trips, year by year (mine first, opened from Me). A trip ticks
// its country on the travellers' map (trigger on trips).
export default function TimelinePage() {
  const { supabase, members, me, locale, t } = useFamily();
  const toast = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [person, setPerson] = useState<string | null>(me?.id ?? null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [journal, setJournal] = useState<Pick<JournalEntry, "country" | "kind" | "entry_date">[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("trips").select("*").order("start_month", { ascending: false, nullsFirst: false }).order("created_at");
    setTrips((data ?? []) as Trip[]);
  }, [supabase]);

  useEffect(() => {
    load();
    supabase
      .from("journal_entries")
      .select("country, kind, entry_date")
      .then(({ data }) => setJournal((data ?? []) as typeof journal));
  }, [load, supabase]);

  const mine = trips.filter((x) => !person || x.member_ids.includes(person));
  // The first trip to each country gets a "first time" mark.
  const firsts = new Set<string>();
  const seen = new Set<string>();
  for (const x of [...mine].reverse()) {
    if (!x.start_month || seen.has(x.country)) continue;
    seen.add(x.country);
    firsts.add(x.id);
  }
  const years = new Map<string, Trip[]>();
  for (const x of mine) {
    const y = x.start_month?.slice(0, 4) ?? "";
    years.set(y, [...(years.get(y) ?? []), x]);
  }
  const countries = new Set(mine.map((x) => x.country)).size;

  const blank = (): Draft => ({ place: "", start: "", end: "", lived: false, note: "", member_ids: person ? [person] : me ? [me.id] : [] });
  const edit = (x: Trip): Draft => ({
    id: x.id,
    place: countryName(x.country, locale),
    start: x.start_month?.slice(0, 7) ?? "",
    end: x.end_month?.slice(0, 7) ?? "",
    lived: x.lived,
    note: x.note ?? "",
    member_ids: x.member_ids,
  });

  async function remove(x: Trip) {
    await supabase.from("trips").delete().eq("id", x.id);
    setEditing(null);
    load();
    toast(t("Trip deleted"), async () => {
      await supabase.from("trips").insert(x);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <TravelsHeader back="/" backLabel={t("Home")} action={<button className="btn" onClick={() => setEditing(blank())}>+ {t("Trip")}</button>} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {members.map((m) => (
          <button key={m.id} className={`chip-toggle ${person === m.id ? "chip-on" : ""}`} onClick={() => setPerson(m.id)}>
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
            {m.name}
          </button>
        ))}
        <button className={`chip-toggle ${person === null ? "chip-on" : ""}`} onClick={() => setPerson(null)}>
          {t("Everyone")}
        </button>
      </div>

      <p className="text-sm text-muted">
        {mine.length === 1 ? t("1 trip") : t("{n} trips", { n: mine.length })} · {countries === 1 ? t("1 country") : t("{n} countries", { n: countries })}
      </p>

      {[...years].map(([year, list]) => (
        <section key={year}>
          <h2 className="h2 mb-2">{year || t("Year unknown")}</h2>
          <ul className="card divide-y divide-border p-0">
            {list.map((x) => {
              const others = x.member_ids.filter((id) => id !== person).map((id) => members.find((m) => m.id === id)).filter((m) => !!m);
              return (
                <li key={x.id}>
                  <button className="flex w-full items-start gap-3 px-4 py-3 text-left" onClick={() => setEditing(edit(x))}>
                    <span aria-hidden className="text-xl leading-6">{flag(x.country)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{countryName(x.country, locale)}</span>
                        {x.lived && <span className="chip">{t("Lived there")}</span>}
                        {firsts.has(x.id) && !x.lived && <span className="chip">{t("First time")}</span>}
                      </span>
                      {x.note && <span className="mt-0.5 block text-sm text-muted">{x.note}</span>}
                      {others.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-2">
                          {others.map((m) => (
                            <span key={m.id} className="inline-flex items-center gap-1.5 text-xs font-medium">
                              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                              {m.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm capitalize text-muted">{tripWhen(x, locale, t)}</span>
                  </button>
                  <JournalLine trip={x} entries={journal} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {mine.length === 0 && <p className="card text-sm text-muted">{t("Add your trips: where, when, with whom. Each one ticks the country on the map.")}</p>}

      <TripSheet draft={editing} setDraft={setEditing} onSaved={load} onDelete={(id) => remove(trips.find((x) => x.id === id)!)} />
    </div>
  );
}

function TripSheet({ draft, setDraft, onSaved, onDelete }: { draft: Draft | null; setDraft: (d: Draft | null) => void; onSaved: () => void; onDelete: (id: string) => void }) {
  const { supabase, members, locale, t } = useFamily();
  const toast = useToast();
  if (!draft) return null;
  const code = findCountry(draft.place);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !code || !draft.member_ids.length) return;
    const end = draft.start && draft.end && draft.end >= draft.start ? `${draft.end}-01` : null;
    const row = {
      country: code,
      start_month: draft.start ? `${draft.start}-01` : null,
      end_month: end,
      lived: draft.lived,
      note: draft.note.trim() || null,
      member_ids: draft.member_ids,
    };
    const { error } = draft.id ? await supabase.from("trips").update(row).eq("id", draft.id) : await supabase.from("trips").insert(row);
    if (error) return toast(error.message);
    setDraft(null);
    onSaved();
  }

  return (
    <Sheet open onClose={() => setDraft(null)} title={draft.id ? t("Edit trip") : t("New trip")}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div>
          <input className="input" placeholder={t("Country")} required autoFocus={!draft.id} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} />
          {draft.place && (
            <p className={`mt-1 text-sm ${code ? "" : "text-danger"}`}>{code ? `${flag(code)} ${countryName(code, locale)}` : t("Not recognised: {items}", { items: draft.place })}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">{t("From")}</span>
            <input type="month" className="input" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </label>
          <label>
            <span className="label">{t("To (optional)")}</span>
            <input type="month" className="input" min={draft.start || undefined} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </label>
        </div>
        <div>
          <span className="label">{t("Who went?")}</span>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = draft.member_ids.includes(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  className={`chip-toggle ${on ? "chip-on" : ""}`}
                  onClick={() => setDraft({ ...draft, member_ids: on ? draft.member_ids.filter((id) => id !== m.id) : [...draft.member_ids, m.id] })}
                >
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
        <input className="input" placeholder={t("What was it? (wedding in Bristol, with Alex…)")} maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.lived} onChange={(e) => setDraft({ ...draft, lived: e.target.checked })} /> {t("Lived there (studies, work…)")}
        </label>
        <div className="flex gap-2">
          <button className="btn flex-1" disabled={!code || !draft.member_ids.length}>{t("Save")}</button>
          {draft.id && <button type="button" className="btn-ghost text-danger" onClick={() => onDelete(draft.id!)}>{t("Delete")}</button>}
        </div>
      </form>
    </Sheet>
  );
}

// "3 days written · 2 stays": what the trip's journal holds, one tap away.
function JournalLine({ trip, entries }: { trip: Trip; entries: Pick<JournalEntry, "country" | "kind" | "entry_date">[] }) {
  const { t } = useFamily();
  if (!trip.start_month) return null;
  const from = trip.start_month.slice(0, 7);
  const to = (trip.end_month ?? trip.start_month).slice(0, 7);
  const mine = entries.filter((e) => e.country === trip.country && e.entry_date.slice(0, 7) >= from && e.entry_date.slice(0, 7) <= to);
  if (!mine.length) return null;
  const days = mine.filter((e) => e.kind === "day").length;
  const stays = mine.filter((e) => e.kind === "stay").length;
  return (
    <Link href={`/travels/country/${trip.country}`} className="mb-2 ml-12 flex w-fit items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium">
      📓 {[days ? (days === 1 ? t("1 day written") : t("{n} days written", { n: days })) : "", stays ? (stays === 1 ? t("1 stay") : t("{n} stays", { n: stays })) : ""].filter(Boolean).join(" · ")}
    </Link>
  );
}
