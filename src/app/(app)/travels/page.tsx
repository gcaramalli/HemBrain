"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/family-context";
import { TravelsHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { WorldMap } from "@/components/world-map";
import { countryName, flag, parseCountries, REGIONS, whoWent, type Region } from "@/lib/countries";
import type { Member, VisitedCountry } from "@/lib/types";

// Where each of us has been: a map coloured by person, and one column per
// person to tick countries off. Pasting a list ("Allemagne, Japon…") adds many at once.
export default function TravelsPage() {
  const { supabase, members, locale, t } = useFamily();
  const toast = useToast();
  const [visits, setVisits] = useState<VisitedCountry[]>([]);
  const [region, setRegion] = useState<Region>("world");
  const [focus, setFocus] = useState<string | null>(null); // one person, or everyone
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("visited_countries").select("*");
    setVisits((data ?? []) as VisitedCountry[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const who = useMemo(() => whoWent(visits), [visits]);
  const name = (code: string) => countryName(code, locale);
  const shown = focus ? members.filter((m) => m.id === focus) : members;
  const countries = [...who.keys()].filter((c) => who.get(c)!.some((id) => shown.some((m) => m.id === id)));
  countries.sort((a, b) => name(a).localeCompare(name(b), locale));
  const count = (m: Member) => visits.filter((v) => v.member_id === m.id).length;

  async function toggle(member: Member, code: string) {
    const row = visits.find((v) => v.member_id === member.id && v.country === code);
    if (!row) {
      await supabase.from("visited_countries").insert({ member_id: member.id, country: code });
      return load();
    }
    await supabase.from("visited_countries").delete().eq("id", row.id);
    load();
    toast(t("{name}: {country} removed", { name: member.name, country: name(code) }), async () => {
      await supabase.from("visited_countries").insert(row);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <TravelsHeader back="/" backLabel={t("Home")} action={<button className="btn" onClick={() => setAdding(true)}>+ {t("Countries")}</button>} />
      <PageHem topic="travels" />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button className={`chip-toggle ${focus === null ? "chip-on" : ""}`} onClick={() => setFocus(null)}>
          {t("Everyone")} · {who.size}
        </button>
        {members.map((m) => (
          <button key={m.id} className={`chip-toggle ${focus === m.id ? "chip-on" : ""}`} onClick={() => setFocus(focus === m.id ? null : m.id)}>
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
            {m.name} · {count(m)}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden p-2">
        <WorldMap who={who} people={shown} region={region} onPick={setPicked} />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-full bg-accent-soft p-1 text-sm">
        {REGIONS.map((r) => (
          <button key={r} onClick={() => setRegion(r)} className={`min-h-9 shrink-0 grow rounded-full px-3 ${region === r ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
            {regionLabel(r, t)}
          </button>
        ))}
      </div>

      {focus === null && members.filter((m) => m.profile_id).length > 1 && (
        <p className="text-xs text-muted">{t("Each person has their colour; ink = we've both been there.")}</p>
      )}

      <section className="card p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">{t("{n} countries", { n: countries.length })}</th>
              {shown.map((m) => (
                <th key={m.id} className="w-16 px-1 py-3 text-center text-xs font-medium">
                  <span aria-hidden className="mx-auto mb-1 block h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                  {m.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-t border-border">
            {countries.map((c) => (
              <tr key={c}>
                <td className="px-4 py-1.5">
                  <button className="flex min-h-9 items-center gap-2 text-left" onClick={() => setPicked(c)}>
                    <span aria-hidden>{flag(c)}</span>
                    {name(c)}
                  </button>
                </td>
                {shown.map((m) => (
                  <td key={m.id} className="text-center">
                    <Tick member={m} on={who.get(c)!.includes(m.id)} onClick={() => toggle(m, c)} label={`${m.name} · ${name(c)}`} />
                  </td>
                ))}
              </tr>
            ))}
            {countries.length === 0 && (
              <tr>
                <td colSpan={shown.length + 1} className="px-4 py-4 text-muted">{t("Paste the list of countries you've been to, in any language.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <CountrySheet code={picked} visits={visits} onClose={() => setPicked(null)} onToggle={toggle} onSaved={load} />
      <AddCountries open={adding} onClose={() => setAdding(false)} onAdded={load} />
    </div>
  );
}

function regionLabel(r: Region, t: (k: string) => string) {
  return { world: t("World"), europe: t("Europe"), americas: t("Americas"), asia: t("Asia"), africa: t("Africa"), oceania: t("Oceania") }[r];
}

function Tick({ member, on, onClick, label }: { member: Member; on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={on} aria-label={label} className="inline-flex h-9 w-9 items-center justify-center">
      <span
        className="h-5 w-5 rounded-full border-2 transition-colors"
        style={{ borderColor: on ? member.color : "var(--border)", background: on ? member.color : "transparent" }}
      />
    </button>
  );
}

// One country: who has been, since when, a word about it.
function CountrySheet({
  code,
  visits,
  onClose,
  onToggle,
  onSaved,
}: {
  code: string | null;
  visits: VisitedCountry[];
  onClose: () => void;
  onToggle: (m: Member, code: string) => Promise<void>;
  onSaved: () => void;
}) {
  const { supabase, members, locale, t } = useFamily();
  if (!code) return null;
  const save = async (row: VisitedCountry, fields: Partial<VisitedCountry>) => {
    await supabase.from("visited_countries").update(fields).eq("id", row.id);
    onSaved();
  };
  return (
    <Sheet open onClose={onClose} title={`${flag(code)} ${countryName(code, locale)}`}>
      <ul className="flex flex-col gap-3">
        {members.map((m) => {
          const row = visits.find((v) => v.member_id === m.id && v.country === code);
          return (
            <li key={m.id} className="flex flex-col gap-2">
              <button className="flex min-h-10 items-center gap-3 text-left" onClick={() => onToggle(m, code)} aria-pressed={!!row}>
                <span className="h-5 w-5 shrink-0 rounded-full border-2" style={{ borderColor: row ? m.color : "var(--border)", background: row ? m.color : "transparent" }} />
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-muted">{row ? t("has been") : t("not yet")}</span>
              </button>
              {row && (
                <div className="ml-8 flex gap-2">
                  <input
                    key={`y${row.id}`}
                    className="input w-24"
                    inputMode="numeric"
                    placeholder={t("Year")}
                    defaultValue={row.first_year ?? ""}
                    onBlur={(e) => {
                      const y = parseInt(e.target.value, 10);
                      const first_year = y >= 1900 && y <= 2100 ? y : null;
                      if (first_year !== row.first_year) save(row, { first_year });
                    }}
                  />
                  <input
                    key={`n${row.id}`}
                    className="input"
                    placeholder={t("A word about it")}
                    defaultValue={row.note ?? ""}
                    maxLength={500}
                    onBlur={(e) => {
                      const note = e.target.value.trim() || null;
                      if (note !== row.note) save(row, { note });
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// Paste or type countries for one or several of us.
function AddCountries({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { supabase, members, me, locale, t } = useFamily();
  const toast = useToast();
  const [text, setText] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const chosen = people.length ? people : me ? [me.id] : [];
  const { codes, unknown } = parseCountries(text);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!codes.length || !chosen.length) return;
    setBusy(true);
    const rows = chosen.flatMap((member_id) => codes.map((country) => ({ member_id, country })));
    const { error } = await supabase.from("visited_countries").upsert(rows, { onConflict: "member_id,country", ignoreDuplicates: true });
    setBusy(false);
    if (error) return toast(error.message);
    toast(codes.length === 1 ? t("1 country added") : t("{n} countries added", { n: codes.length }));
    setText("");
    setPeople([]);
    onAdded();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("Add countries")}>
      <form onSubmit={add} className="flex flex-col gap-3">
        <div>
          <span className="label">{t("Who has been there?")}</span>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = chosen.includes(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  className={`chip-toggle ${on ? "chip-on" : ""}`}
                  onClick={() => setPeople(on ? chosen.filter((id) => id !== m.id) : [...chosen, m.id])}
                >
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
        <textarea
          className="input min-h-36"
          placeholder={t("Japan\nItaly, Portugal\none per line, or paste a whole list")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {codes.length > 0 && (
          <p className="text-sm">{codes.map((c) => `${flag(c)} ${countryName(c, locale)}`).join(" · ")}</p>
        )}
        {unknown.length > 0 && <p className="text-sm text-danger">{t("Not recognised: {items}", { items: unknown.join(", ") })}</p>}
        <button className="btn" disabled={busy || !codes.length || !chosen.length}>
          {codes.length === 1 ? t("Add 1 country") : t("Add {n} countries", { n: codes.length })}
        </button>
      </form>
    </Sheet>
  );
}
