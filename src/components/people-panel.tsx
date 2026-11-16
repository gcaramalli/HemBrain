"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "./family-context";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { fmtDate } from "@/lib/dates";
import { daysAway, fetchOccasions, nextAnniversary, OCCASION_EMOJI, occasionLabel } from "@/lib/occasions";
import { whenLabel } from "./occasions-panel";
import { byKind, CIRCLES, matches, MEMORY_KINDS, occasionsOf } from "@/lib/people";
import type { Memory, Occasion, Person } from "@/lib/types";

// Who the sheet is about: someone around the family, or one of its members.
type Open = { person: Person } | { memberId: string } | { draft: true };

// The people around the family and what we know about them: who they are to
// us, tastes, gift ideas, what we gave. Mostly filled by talking to Hem
// (connector `remember`); here to read, correct and add by hand.
export function PeoplePanel() {
  const { supabase, members, memberById, t } = useFamily();
  const toast = useToast();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Open | null>(null);

  const load = useCallback(async () => {
    const [p, m, o] = await Promise.all([
      supabase.from("people").select("*").order("name"),
      supabase.from("memories").select("*").order("created_at", { ascending: false }),
      fetchOccasions(supabase),
    ]);
    setPeople((p.data ?? []) as Person[]);
    setMemories((m.data ?? []) as Memory[]);
    setOccasions(o);
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  const about = useCallback(
    (o: Open) => ("person" in o ? memories.filter((m) => m.person_ids.includes(o.person.id)) : "memberId" in o ? memories.filter((m) => m.member_ids.includes(o.memberId)) : []),
    [memories],
  );
  // Search looks at who they are and at everything remembered about them.
  const shown = useMemo(
    () => (people ?? []).filter((p) => !q || matches(`${p.name} ${p.relation ?? ""} ${p.notes ?? ""} ${about({ person: p }).map((m) => m.body).join(" ")}`, q)),
    [people, q, about],
  );
  // The sheet follows the list: a person saved or a memory added shows at once.
  const current: Open | null = open && "person" in open ? ((people ?? []).some((p) => p.id === open.person.id) ? { person: people!.find((p) => p.id === open.person.id)! } : null) : open;

  async function removePerson(p: Person) {
    await supabase.from("people").delete().eq("id", p.id);
    setOpen(null);
    load();
    toast(t("{name} removed", { name: p.name }), async () => {
      await supabase.from("people").insert(p);
      load();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder={t("Search a name, a taste…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn shrink-0" onClick={() => setOpen({ draft: true })}>+ {t("Person")}</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button key={m.id} className="chip-toggle" onClick={() => setOpen({ memberId: m.id })}>
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
            {m.name}
            {about({ memberId: m.id }).length > 0 && <span className="text-muted"> · {about({ memberId: m.id }).length}</span>}
          </button>
        ))}
      </div>

      {people && people.length === 0 ? (
        <p className="card text-sm text-muted">
          {t("Friends, relatives, their children: who they are to you, what they like, what you gave them. Tell Hem in passing (“Anna loves ceramics”) or add them here.")}
        </p>
      ) : (
        <ul className="card divide-y divide-border py-1">
          {shown.map((p) => {
            const n = about({ person: p }).length;
            return (
              <li key={p.id}>
                <button className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left" onClick={() => setOpen({ person: p })}>
                  <span className="min-w-0">
                    <span className="block font-medium">{p.name}</span>
                    {p.relation && <span className="block truncate text-sm text-muted">{p.relation}</span>}
                  </span>
                  {n > 0 && <span className="shrink-0 text-sm tabular-nums text-muted">{n}</span>}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="py-2.5 text-sm text-muted">{t("Nobody matches.")}</li>}
        </ul>
      )}

      <Sheet
        open={!!current}
        onClose={() => setOpen(null)}
        title={current && "person" in current ? current.person.name : current && "memberId" in current ? memberById(current.memberId)?.name ?? "" : t("New person")}
      >
        {current && "draft" in current && (
          <PersonForm
            people={people ?? []}
            onDone={(p) => {
              load();
              setOpen(p ? { person: p } : null);
            }}
          />
        )}
        {current && !("draft" in current) && (
          <div className="flex flex-col gap-5">
            {"person" in current && <Dates person={current.person} occasions={occasions} />}
            <Memories who={"person" in current ? { person_ids: [current.person.id] } : { member_ids: [current.memberId] }} items={about(current)} onChange={load} />
            {"person" in current && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold">{t("Who they are")}</summary>
                <div className="mt-3">
                  <PersonForm key={current.person.id} initial={current.person} people={people ?? []} onDone={() => load()} onDelete={() => removePerson(current.person)} />
                </div>
              </details>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Dates({ person, occasions }: { person: Person; occasions: Occasion[] }) {
  const { t } = useFamily();
  const list = occasionsOf(person, occasions).filter((o) => !o.ended);
  if (list.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {list.map((o) => {
        const { day, years } = nextAnniversary(o.date);
        return (
          <li key={o.id}>
            {OCCASION_EMOJI[o.kind]} {o.title} · {years > 0 ? `${occasionLabel(t, o.kind, years)} · ` : ""}
            <span className="text-muted">{whenLabel(t, daysAway(day), day)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// What we know, grouped by kind, with one line to add more.
function Memories({ who, items, onChange }: { who: { person_ids: string[] } | { member_ids: string[] }; items: Memory[]; onChange: () => void }) {
  const { supabase, t } = useFamily();
  const toast = useToast();
  const [kind, setKind] = useState<Memory["kind"]>("like");
  const [body, setBody] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await supabase.from("memories").insert({ kind, body: body.trim(), ...who });
    setBody("");
    onChange();
  }

  async function remove(m: Memory) {
    await supabase.from("memories").delete().eq("id", m.id);
    onChange();
    toast(t("Deleted"), async () => {
      await supabase.from("memories").insert(m);
      onChange();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {byKind(items).map((g) => (
        <section key={g.kind.id}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t(g.kind.label)}</h3>
          <ul className="divide-y divide-border">
            {g.items.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  {m.body}
                  {m.happened_on && <span className="text-sm text-muted"> · {fmtDate(m.happened_on + "T12:00:00", { month: "short", year: "numeric" })}</span>}
                </span>
                <button className="shrink-0 text-muted" aria-label={t("Delete")} onClick={() => remove(m)}>✕</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {items.length === 0 && <p className="text-sm text-muted">{t("Nothing written down yet.")}</p>}
      <form onSubmit={add} className="flex flex-col gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {MEMORY_KINDS.map((k) => (
            <button type="button" key={k.id} onClick={() => setKind(k.id)} className={`chip-toggle shrink-0 ${kind === k.id ? "chip-on" : ""}`}>
              {t(k.label)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder={t("e.g. loves ceramics")} value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn shrink-0" disabled={!body.trim()}>{t("Add")}</button>
        </div>
      </form>
    </div>
  );
}

function PersonForm({ initial, people, onDone, onDelete }: { initial?: Person; people: Person[]; onDone: (p: Person | null) => void; onDelete?: () => void }) {
  const { supabase, t } = useFamily();
  const [d, setD] = useState({
    name: initial?.name ?? "",
    relation: initial?.relation ?? "",
    circle: initial?.circle ?? ("friend" as Person["circle"]),
    parent_ids: initial?.parent_ids ?? [],
    language: initial?.language ?? "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const others = people.filter((p) => p.id !== initial?.id && p.circle !== "child");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      name: d.name.trim(),
      relation: d.relation.trim() || null,
      circle: d.circle,
      parent_ids: d.circle === "child" ? d.parent_ids : [],
      language: d.language.trim() || null,
      notes: d.notes.trim() || null,
    };
    const { data, error } = initial
      ? await supabase.from("people").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", initial.id).select("*").single()
      : await supabase.from("people").insert(fields).select("*").single();
    if (error) return setError(error.code === "23505" ? t("Someone already has this name.") : error.message);
    onDone(data as Person);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <input className="input" placeholder={t("Name")} required maxLength={120} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      <input className="input" placeholder={t("Who are they to you? e.g. my best man")} maxLength={200} value={d.relation} onChange={(e) => setD({ ...d, relation: e.target.value })} />
      <div className="grid grid-cols-4 gap-2">
        {CIRCLES.map((c) => (
          <button type="button" key={c.id} onClick={() => setD({ ...d, circle: c.id })} className={`chip-toggle justify-center ${d.circle === c.id ? "chip-on" : ""}`}>
            {t(c.label)}
          </button>
        ))}
      </div>
      {d.circle === "child" && others.length > 0 && (
        <div>
          <span className="label">{t("Their parents")}</span>
          <div className="flex flex-wrap gap-2">
            {others.map((p) => {
              const on = d.parent_ids.includes(p.id);
              return (
                <button type="button" key={p.id} onClick={() => setD({ ...d, parent_ids: on ? d.parent_ids.filter((x) => x !== p.id) : [...d.parent_ids, p.id] })} className={`chip-toggle ${on ? "chip-on" : ""}`}>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <input className="input" placeholder={t("Language to write to them in")} maxLength={40} value={d.language} onChange={(e) => setD({ ...d, language: e.target.value })} />
      <textarea className="input min-h-20" placeholder={t("Notes")} maxLength={4000} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1">{t("Save")}</button>
        {onDelete && <button type="button" className="btn-ghost text-danger" onClick={onDelete}>{t("Delete")}</button>}
      </div>
    </form>
  );
}
