"use client";

import { ThinkingDots } from "@/components/thinking-dots";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "./family-context";
import { MemberBadge, MemberSelect } from "./member-select";
import { ConfirmButton } from "./confirm-button";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { CATEGORIES, categoryById, categoryOrder, guessCategory } from "@/lib/categories";
import { daysUntil, fmtDate } from "@/lib/dates";
import type { List, ListItem, RestockSuggestion } from "@/lib/types";

type Known = { title: string; category: string | null; count: number };

// "2 milk" → { quantity: "2", title: "milk" }
function parseLine(line: string) {
  const text = line.trim().replace(/^[-*•]\s*/, "");
  const m = text.match(/^(\d+(?:[.,]\d+)?\s*(?:x|st|kg|g|l|dl|cl|pcs|pack|förp)?)\s+(.+)$/i);
  return m ? { title: m[2].trim(), quantity: m[1].trim() } : { title: text, quantity: null };
}

// A family's lists of one kind: shopping lists (Kitchen, sorted by aisle,
// learns what you buy) or to-do lists (Calendar → To-do, who and by when).
export function ListsView({ kind, header }: { kind: List["kind"]; header: (newList: () => void) => React.ReactNode }) {
  const { supabase, t } = useFamily();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [lists, setLists] = useState<List[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [restock, setRestock] = useState<RestockSuggestion[]>([]);
  const [history, setHistory] = useState<Map<string, Known>>(new Map());
  const [title, setTitle] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [managing, setManaging] = useState<List | null>(null);

  const active = lists.find((l) => l.id === activeId) ?? null;
  const isGrocery = active?.kind === "grocery";

  useEffect(() => {
    supabase
      .from("lists")
      .select("*")
      .eq("kind", kind)
      .order("position")
      .then(({ data }) => {
        const ls = (data ?? []) as List[];
        setLists(ls);
        setActiveId((cur) => cur ?? ls[0]?.id ?? null);
      });
  }, [supabase, kind]);

  const loadItems = useCallback(async () => {
    if (!activeId) return;
    const { data } = await supabase.from("list_items").select("*").eq("list_id", activeId).order("created_at");
    setItems((data ?? []) as ListItem[]);
  }, [supabase, activeId]);

  const loadRestock = useCallback(async () => {
    const { data } = await supabase.from("restock_suggestions").select("*").order("next_due_on");
    setRestock((data ?? []) as RestockSuggestion[]);
  }, [supabase]);

  // Everything the family has put on a list or bought: autocomplete + the
  // category last used for each item.
  const loadHistory = useCallback(async () => {
    const [{ data: past }, { data: bought }] = await Promise.all([
      supabase.from("list_items").select("title, category, created_at").order("created_at", { ascending: false }).limit(600),
      supabase.from("purchases").select("item_name").order("purchased_at", { ascending: false }).limit(400),
    ]);
    const map = new Map<string, Known>();
    for (const r of past ?? []) {
      const k = r.title.trim().toLowerCase();
      const cur = map.get(k);
      if (cur) cur.count++;
      else map.set(k, { title: r.title.trim(), category: r.category, count: 1 });
    }
    for (const r of bought ?? []) {
      const k = r.item_name.trim().toLowerCase();
      const cur = map.get(k);
      if (cur) cur.count++;
      else map.set(k, { title: r.item_name.trim(), category: null, count: 1 });
    }
    setHistory(map);
  }, [supabase]);

  useEffect(() => {
    loadItems();
    loadRestock();
    loadHistory();
    const channel = supabase
      .channel("list_items")
      .on("postgres_changes", { event: "*", schema: "public", table: "list_items" }, () => {
        loadItems();
        loadRestock();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadItems, loadRestock, loadHistory]);

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const onList = useMemo(() => new Set(open.map((i) => i.title.trim().toLowerCase())), [open]);

  // Items the family usually buys that are due within a week and not already on the list.
  const suggestions = useMemo(
    () => restock.filter((r) => daysUntil(r.next_due_on) <= 7 && !onList.has(r.item_key)),
    [restock, onList],
  );

  const autocomplete = useMemo(() => {
    const q = parseLine(title).title.toLowerCase();
    if (!q) return [];
    const all = [...history.values()].filter((h) => !onList.has(h.title.toLowerCase()) && h.title.toLowerCase() !== q);
    const starts = all.filter((h) => h.title.toLowerCase().startsWith(q));
    const contains = all.filter((h) => !h.title.toLowerCase().startsWith(q) && h.title.toLowerCase().includes(q));
    return [...starts, ...contains].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [title, history, onList]);

  const categoryFor = useCallback(
    (t: string) => {
      if (!isGrocery) return null;
      return history.get(t.trim().toLowerCase())?.category ?? guessCategory(t);
    },
    [history, isGrocery],
  );

  async function addLines(lines: string[]) {
    if (!activeId) return;
    const rows = lines
      .map(parseLine)
      .filter((r) => r.title && !onList.has(r.title.toLowerCase()))
      .map((r) => ({ list_id: activeId, title: r.title, quantity: r.quantity, category: categoryFor(r.title) }));
    if (!rows.length) return;
    await supabase.from("list_items").insert(rows);
    loadItems();
    loadHistory();
  }

  async function toggle(item: ListItem) {
    const { data: auth } = await supabase.auth.getUser();
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)));
    await supabase
      .from("list_items")
      .update({ done: !item.done, done_at: item.done ? null : new Date().toISOString(), done_by: item.done ? null : auth.user?.id })
      .eq("id", item.id);
  }

  // Deleting never asks first: it offers "Undo" instead.
  async function restore(rows: ListItem[]) {
    await supabase.from("list_items").insert(rows);
    loadItems();
  }

  async function remove(item: ListItem) {
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    await supabase.from("list_items").delete().eq("id", item.id);
    toast(t("Removed {item}", { item: item.title }), () => restore([item]));
  }

  async function clearDone() {
    if (!activeId || !done.length) return;
    const removed = done;
    setItems((xs) => xs.filter((x) => !x.done));
    await supabase.from("list_items").delete().eq("list_id", activeId).eq("done", true);
    toast(t("Cleared {n} checked items", { n: removed.length }), () => restore(removed));
  }

  async function newList(name: string) {
    const { data } = await supabase.from("lists").insert({ name, kind, position: lists.length }).select().single<List>();
    setCreating(false);
    if (data) {
      setLists((ls) => [...ls, data]);
      setActiveId(data.id);
    }
  }

  // Open items grouped by aisle (shopping lists) or flat (to-do lists).
  const groups = useMemo(() => {
    if (!isGrocery) return [{ id: "all", label: "", emoji: "", items: open }];
    const map = new Map<string, ListItem[]>();
    for (const i of open) {
      const c = categoryById(i.category).id;
      map.set(c, [...(map.get(c) ?? []), i]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b))
      .map(([id, its]) => ({ ...categoryById(id), items: its }));
  }, [open, isGrocery]);

  return (
    <div className="flex flex-col gap-4">
      {header(() => setCreating(true))}

      {lists.length === 0 && (
        <button className="card flex flex-col items-start gap-1 text-left" onClick={() => setCreating(true)}>
          <span className="font-semibold">+ {kind === "todo" ? t("Create a to-do list") : t("Create a shopping list")}</span>
          <span className="text-sm text-muted">{kind === "todo" ? t("With who does it and by when") : t("Sorted by aisle, learns what you buy")}</span>
        </button>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={() => setActiveId(l.id)}
            className={`chip-toggle ${l.id === activeId ? "chip-on" : ""}`}
          >
            {l.name}
          </button>
        ))}
        {active && (
          <button onClick={() => setManaging(active)} className="chip-toggle text-muted" aria-label={t("Rename or delete this list")}>
            ⋯
          </button>
        )}
      </div>

      {active && (
        <>
          <div className="relative">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addLines([title]);
                setTitle("");
              }}
              className="flex gap-2"
            >
              <input
                className="input"
                placeholder={isGrocery ? t("Add item, e.g. 2 milk (paste a whole list too)") : t("Add a to-do")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                  if (lines.length > 1) {
                    e.preventDefault();
                    addLines(lines);
                  }
                }}
              />
              <button className="btn">{t("Add")}</button>
            </form>
            {autocomplete.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {autocomplete.map((h) => (
                  <button
                    key={h.title}
                    className="btn-ghost"
                    onClick={() => {
                      const { quantity } = parseLine(title);
                      addLines([quantity ? `${quantity} ${h.title}` : h.title]);
                      setTitle("");
                    }}
                  >
                    + {h.title}
                  </button>
                ))}
              </div>
            )}
          </div>


          {isGrocery && suggestions.length > 0 && (
            <section className="rounded-[22px] border border-dashed border-border p-4">
              <h2 className="flex items-center gap-1.5 font-semibold"><ThinkingDots size={6} still /> {t("Probably needed soon")}</h2>
              <p className="mb-2 text-xs text-muted">{t("Based on how often you buy these. Tap to add.")}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => {
                  const d = daysUntil(s.next_due_on);
                  return (
                    <button key={s.item_key} className="btn-ghost" onClick={() => addLines([s.item_name])}>
                      + {s.item_name}
                      <span className="text-xs text-muted">{d < 0 ? t("{n}d overdue", { n: -d }) : d === 0 ? t("today") : t("in {n}d", { n: d })}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {open.length === 0 ? (
            <p className="card text-sm text-muted">{t("All done")} 🎉</p>
          ) : (
            <div className="card flex flex-col gap-3 py-3">
              {groups.map((g) => (
                <section key={g.id}>
                  {g.label && (
                    <h3 className="eyebrow pt-1">
                      {g.emoji} {t(g.label)}
                    </h3>
                  )}
                  <ul className="divide-y divide-border">
                    {g.items.map((i) => (
                      <ItemRow key={i.id} item={i} onToggle={toggle} onEdit={setEditing} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <button className="text-sm text-muted" onClick={() => setShowDone(!showDone)}>
                  {showDone ? "▾" : "▸"} {t("Checked ({n})", { n: done.length })}
                </button>
                <button className="min-h-9 px-1 text-sm text-muted" onClick={clearDone}>{t("Clear")}</button>
              </div>
              {showDone && (
                <ul className="card mt-2 divide-y divide-border py-1 opacity-70">
                  {done.map((i) => (
                    <ItemRow key={i.id} item={i} onToggle={toggle} onEdit={setEditing} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <Sheet open={!!managing} onClose={() => setManaging(null)} title={t("Rename list")}>
        {managing && (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name")?.toString().trim();
              if (name) {
                await supabase.from("lists").update({ name }).eq("id", managing.id);
                setLists((ls) => ls.map((l) => (l.id === managing.id ? { ...l, name } : l)));
              }
              setManaging(null);
            }}
          >
            <input className="input" name="name" defaultValue={managing.name} required autoFocus />
            <button className="btn">{t("Save")}</button>
            <ConfirmButton
              className="btn-ghost text-danger"
              armed={t("Delete with all items?")}
              onConfirm={async () => {
                await supabase.from("lists").delete().eq("id", managing.id);
                const rest = lists.filter((l) => l.id !== managing.id);
                setLists(rest);
                setActiveId(rest[0]?.id ?? null);
                setManaging(null);
              }}
            >
              {t("Delete this list")}
            </ConfirmButton>
          </form>
        )}
      </Sheet>

      <Sheet open={creating} onClose={() => setCreating(false)} title={t("New list")}>
        {creating && <NewListForm kind={kind} onCreate={newList} />}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t("Edit item")}>
        {editing && (
          <ItemForm
            item={editing}
            grocery={isGrocery}
            onDelete={() => {
              remove(editing);
              setEditing(null);
            }}
            onDone={() => {
              setEditing(null);
              loadItems();
              loadHistory();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function NewListForm({ kind, onCreate }: { kind: List["kind"]; onCreate: (name: string) => void }) {
  const { t } = useFamily();
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
      className="flex flex-col gap-3"
    >
      <input
        className="input"
        placeholder={kind === "todo" ? t("Name, e.g. Weekend chores") : t("Name, e.g. IKEA")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
      />
      <button className="btn">{t("Create list")}</button>
    </form>
  );
}

function ItemRow({ item, onToggle, onEdit }: { item: ListItem; onToggle: (i: ListItem) => void; onEdit: (i: ListItem) => void }) {
  const { addedBy, t } = useFamily();
  const by = addedBy(item.created_by);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button
        onClick={() => onToggle(item)}
        aria-label={item.done ? t("Uncheck") : t("Check")}
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] ${item.done ? "border-foreground bg-foreground text-background" : "border-muted/60"}`}>
          {item.done && "✓"}
        </span>
      </button>
      <button className={`min-w-0 flex-1 text-left ${item.done ? "line-through" : ""}`} onClick={() => onEdit(item)}>
        <span>{item.title}</span>
        {item.quantity && <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs text-accent">{item.quantity}</span>}
        {item.due_date && <span className="ml-2 chip">{fmtDate(item.due_date + "T12:00:00", { weekday: "short", day: "numeric", month: "short" })}</span>}
        {(item.notes || by) && (
          <span className="block truncate text-xs text-muted">
            {item.notes}
            {item.notes && by ? " · " : ""}
            {by && t("added by {name}", { name: by })}
          </span>
        )}
      </button>
      <MemberBadge id={item.assignee_member_id} />
    </li>
  );
}

function ItemForm({ item, grocery, onDone, onDelete }: { item: ListItem; grocery: boolean; onDone: () => void; onDelete: () => void }) {
  const { supabase, t } = useFamily();
  const [d, setD] = useState(item);
  const set = <K extends keyof ListItem>(k: K, v: ListItem[K]) => setD((x) => ({ ...x, [k]: v }));

  // +/- on the leading number, keeping any unit ("2 kg" → "3 kg").
  function bump(delta: number) {
    const m = (d.quantity ?? "").match(/^(\d+)(.*)$/);
    const n = Math.max(0, (m ? parseInt(m[1], 10) : 1) + delta);
    set("quantity", n <= 0 ? null : `${n}${m ? m[2] : ""}`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await supabase
      .from("list_items")
      .update({
        title: d.title.trim(),
        quantity: d.quantity?.trim() || null,
        notes: d.notes?.trim() || null,
        category: d.category,
        assignee_member_id: d.assignee_member_id,
        due_date: d.due_date,
      })
      .eq("id", d.id);
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <input className="input" required value={d.title} onChange={(e) => set("title", e.target.value)} />
      <div>
        <span className="label">{t("Quantity")}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost w-12 text-lg" onClick={() => bump(-1)}>−</button>
          <input className="input text-center" placeholder={t("e.g. 2 or 1 kg")} value={d.quantity ?? ""} onChange={(e) => set("quantity", e.target.value || null)} />
          <button type="button" className="btn-ghost w-12 text-lg" onClick={() => bump(1)}>+</button>
        </div>
      </div>
      <input className="input" placeholder={t("Note (e.g. for breakfast, organic)")} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
      {grocery ? (
        <div>
          <span className="label">{t("Aisle")}</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => set("category", c.id)}
                className={`chip-toggle ${categoryById(d.category).id === c.id ? "chip-on" : ""}`}
              >
                {c.emoji} {t(c.label)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="label">{t("Who")}</span>
            <MemberSelect value={d.assignee_member_id} onChange={(v) => set("assignee_member_id", v)} />
          </div>
          <div>
            <span className="label">{t("Due")}</span>
            <input className="input" type="date" value={d.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn flex-1">{t("Save")}</button>
        <button type="button" className="btn-ghost text-danger" onClick={onDelete}>{t("Delete")}</button>
      </div>
    </form>
  );
}
