"use client";

import { Flag, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { useFamily } from "@/components/family-context";
import { PageHeader } from "@/components/page-header";
import { PinGate } from "@/components/pin-lock";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { dayKey, fmtDate } from "@/lib/dates";
import type { WorkItem, WorkMeeting, WorkPerson, WorkProject, WorkRole } from "@/lib/types";
import { afterMeeting, daysSince, HISTORY_DAYS, meetingAgenda, nextMeetingDate, parseCapture, personItems, sortItems, WORK_KINDS, WORK_ROLES } from "@/lib/work";

// My work, private: people (manager, team, peers), projects and recurring
// meetings, and what to do, hand over or discuss with each. Claude can file
// things here through my own connector link (see src/lib/mcp/tools.ts).

type Tab = "me" | "people" | "projects" | "meetings";
// items = open and waiting; done = finished in the last HISTORY_DAYS, newest first.
type Data = { people: WorkPerson[]; projects: WorkProject[]; meetings: WorkMeeting[]; items: WorkItem[]; done: WorkItem[] };
type Open =
  | { type: "person"; id: string }
  | { type: "project"; id: string }
  | { type: "meeting"; id: string }
  | { type: "item"; id: string }
  | { type: "new"; what: "person" | "project" | "meeting" };

const isoWeekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;
const weekdayName = (n: number) => fmtDate(new Date(Date.UTC(2024, 0, n, 12)), { weekday: "long" }); // 2024-01-01 was a Monday
const compact = (name: string) => name.replace(/\s+/g, "");
const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// The Work tile can be locked behind my code (Me → Private → lock).
export default function WorkPage() {
  const { supabase } = useFamily();
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => {
    supabase
      .from("private_boards")
      .select("id", { count: "exact", head: true })
      .eq("kind", "work")
      .eq("locked", true)
      .then(({ count }) => setLocked((count ?? 0) > 0));
  }, [supabase]);
  if (locked === null) return null;
  return (
    <PinGate locked={locked}>
      <WorkSpace />
    </PinGate>
  );
}

function WorkSpace() {
  const { supabase, profile, t } = useFamily();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("me");
  // Tabs this account doesn't use (Me always stays). Saved on the profile.
  const [hidden, setHidden] = useState<string[]>(profile.work_hidden_tabs ?? []);
  async function toggleTab(id: Tab) {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(next);
    await supabase.from("profiles").update({ work_hidden_tabs: next }).eq("id", profile.id);
  }
  const [open, setOpen] = useState<Open | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    const [p, pr, m, i, d] = await Promise.all([
      supabase.from("work_people").select("*").order("name"),
      supabase.from("work_projects").select("*").order("name"),
      supabase.from("work_meetings").select("*").order("weekday", { nullsFirst: false }).order("name"),
      supabase.from("work_items").select("*").neq("status", "done").order("created_at"),
      supabase.from("work_items").select("*").eq("status", "done").gte("done_at", since).order("done_at", { ascending: false }),
    ]);
    setData({
      people: (p.data ?? []) as WorkPerson[],
      projects: (pr.data ?? []) as WorkProject[],
      meetings: (m.data ?? []) as WorkMeeting[],
      items: sortItems((i.data ?? []) as WorkItem[]),
      done: (d.data ?? []) as WorkItem[],
    });
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const allTabs: { id: Tab; label: string }[] = [
    { id: "me", label: t("Me") },
    { id: "people", label: t("People") },
    { id: "projects", label: t("Projects") },
    { id: "meetings", label: t("Meetings") },
  ];
  const tabs = allTabs.filter((x) => !hidden.includes(x.id));
  // A tab hidden while open falls back to Me.
  const current: Tab = hidden.includes(tab) ? "me" : tab;
  const newWhat = current === "projects" ? "project" : current === "meetings" ? "meeting" : "person";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("Work")}
        module="work"
        back="/me"
        action={current !== "me" && <button className="btn" onClick={() => setOpen({ type: "new", what: newWhat })}>+ {newWhat === "project" ? t("Project") : newWhat === "meeting" ? t("Meeting") : t("Person")}</button>}
      >
        {tabs.length > 1 && (
        <div className="grid rounded-full bg-accent-soft p-1 text-sm" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`min-h-9 truncate rounded-full px-1 ${current === x.id ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        )}
      </PageHeader>

      {data && (
        <>
          <Capture data={data} onAdded={load} />
          {current === "me" && <MeTab data={data} onOpen={setOpen} onChanged={load} />}
          {current === "people" && <PeopleTab data={data} onOpen={setOpen} />}
          {current === "projects" && <ProjectsTab data={data} onOpen={setOpen} />}
          {current === "meetings" && <MeetingsTab data={data} onOpen={setOpen} />}
          <Sheets data={data} open={open} setOpen={setOpen} onChanged={load} />
          {current === "me" && (
            <section className="flex flex-col gap-2 border-t border-border pt-3">
              <h3 className="eyebrow">{t("Tabs")}</h3>
              <div className="flex flex-wrap gap-2">
                {allTabs.filter((x) => x.id !== "me").map((x) => (
                  <button key={x.id} onClick={() => toggleTab(x.id)} aria-pressed={!hidden.includes(x.id)} className={`chip-toggle ${hidden.includes(x.id) ? "" : "chip-on"}`}>
                    {x.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">{t("Hide what you don't use. Nothing is deleted.")}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// One line to capture anything: "@Anna #EVP send the brief", "!" = priority.
// Inside a person's or project's sheet it is already filed there (preset).
function Capture({ data, onAdded, preset }: { data: Data; onAdded: () => void; preset?: { person_id?: string; project_id?: string } }) {
  const { supabase, t } = useFamily();
  const [line, setLine] = useState("");
  const [kind, setKind] = useState<WorkItem["kind"]>("todo");
  const parsed = useMemo(() => parseCapture(line, data.people, data.projects, data.meetings), [line, data]);

  const last = line.split(/\s/).pop() ?? "";
  const suggestions = useMemo(() => {
    const m = last.match(/^([@#])(.*)$/);
    if (!m) return [];
    const q = clean(m[2]);
    const pool = m[1] === "@" ? data.people.map((p) => p.name) : [...data.projects.filter((p) => !p.archived), ...data.meetings].map((p) => p.name);
    return pool.filter((n) => clean(n).startsWith(q)).slice(0, 6).map((n) => ({ tag: m[1], name: n }));
  }, [last, data]);

  function complete(tag: string, name: string) {
    setLine(`${line.slice(0, line.length - last.length)}${tag}${compact(name)} `);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.title) return;
    await supabase.from("work_items").insert({
      title: parsed.title.slice(0, 500),
      kind,
      priority: parsed.priority,
      person_id: parsed.person?.id ?? preset?.person_id ?? null,
      project_id: parsed.project?.id ?? preset?.project_id ?? null,
      meeting_id: parsed.meeting?.id ?? null,
    });
    setLine("");
    setKind("todo");
    onAdded();
  }

  return (
    <form onSubmit={add} className={`flex flex-col gap-2 ${preset ? "rounded-2xl bg-accent-soft p-3" : "card"}`}>
      <div className="flex gap-2">
        <input
          className="input"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder={preset ? t("Add something… (! = priority)") : t("@person #project what to do… (! = priority)")}
          maxLength={600}
        />
        <button className="btn" disabled={!parsed.title} aria-label={t("Add")}>+</button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button type="button" key={s.name} className="chip-toggle" onClick={() => complete(s.tag, s.name)}>
              {s.tag}
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {WORK_KINDS.map((k) => (
          <button type="button" key={k.id} onClick={() => setKind(k.id)} className={`chip-toggle ${kind === k.id ? "chip-on" : ""}`}>
            {t(k.label)}
          </button>
        ))}
        {parsed.priority && <span className="chip">! {t("Priority")}</span>}
        {parsed.person && <span className="chip">@{parsed.person.name}</span>}
        {parsed.project && <span className="chip">#{parsed.project.name}</span>}
        {parsed.meeting && <span className="chip">#{parsed.meeting.name}</span>}
      </div>
    </form>
  );
}

function useItemActions(onChanged: () => void) {
  const { supabase, t } = useFamily();
  const toast = useToast();
  return {
    async update(item: WorkItem, fields: Partial<WorkItem>, message?: string) {
      await supabase.from("work_items").update(fields).eq("id", item.id);
      onChanged();
      if (message) {
        const back = Object.fromEntries(Object.keys(fields).map((k) => [k, item[k as keyof WorkItem]]));
        toast(message, async () => {
          await supabase.from("work_items").update(back).eq("id", item.id);
          onChanged();
        });
      }
    },
    async remove(item: WorkItem) {
      await supabase.from("work_items").delete().eq("id", item.id);
      onChanged();
      toast(t("Deleted"), async () => {
        await supabase.from("work_items").insert(item);
        onChanged();
      });
    },
  };
}

// An item: tick = done (or, in a meeting, handed over), tap = edit.
function ItemRow({
  item,
  data,
  onOpen,
  onChanged,
  hide = [],
  inMeeting = false,
}: {
  item: WorkItem;
  data: Data;
  onOpen: (o: Open) => void;
  onChanged: () => void;
  hide?: ("person" | "project" | "meeting")[];
  inMeeting?: boolean;
}) {
  const { t } = useFamily();
  const { update } = useItemActions(onChanged);
  const person = data.people.find((p) => p.id === item.person_id);
  const project = data.projects.find((p) => p.id === item.project_id);
  const meeting = data.meetings.find((m) => m.id === item.meeting_id);
  const kind = WORK_KINDS.find((k) => k.id === item.kind);
  // Past its due date and not done (waiting ones too: they owe it).
  const late = item.status !== "done" && !!item.due_date && item.due_date < dayKey(new Date());

  function tick() {
    if (item.status === "done") update(item, { status: item.waiting_since ? "waiting" : "open", done_at: null }, t("Reopened"));
    else if (inMeeting && item.status === "open") {
      const next = afterMeeting(item);
      update(item, next, next.status === "waiting" ? t("Handed over to {name}", { name: person?.name ?? "" }) : t("Done: {item}", { item: item.title }));
    } else update(item, { status: "done", done_at: new Date().toISOString() }, t("Done: {item}", { item: item.title }));
  }

  return (
    <li className="flex min-h-12 items-center gap-3 py-1">
      <button onClick={tick} aria-label={t("Mark as done")} className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center">
        <span
          className={`flex h-5 w-5 items-center justify-center border-[1.5px] text-xs ${item.kind === "todo" ? "rounded-md" : "rounded-full"} ${item.status === "done" ? "border-foreground bg-foreground text-background" : late ? "border-danger" : "border-foreground/60"}`}
        >
          {item.status === "done" ? "✓" : ""}
        </span>
      </button>
      <button onClick={() => onOpen({ type: "item", id: item.id })} className="min-w-0 flex-1 text-left">
        <span className={`block break-words ${item.status === "done" ? "text-muted line-through" : ""}`}>
          {item.priority && item.status !== "done" && <Flag size={14} className="mr-1.5 inline -translate-y-px text-danger" aria-label={t("Priority")} />}
          {item.title}
        </span>
        <span className="flex flex-wrap gap-1.5 pt-0.5 text-xs text-muted">
          {item.kind !== "todo" && kind && <span>{t(kind.label)}</span>}
          {person && !hide.includes("person") && <span>@{person.name}</span>}
          {project && !hide.includes("project") && <span>#{project.name}</span>}
          {meeting && !hide.includes("meeting") && <span>#{meeting.name}</span>}
          {item.status === "waiting" && item.waiting_since && <span className="font-medium">{t("waiting {n} d", { n: daysSince(item.waiting_since) })}</span>}
          {item.due_date && (
            <span className={late ? "font-semibold text-danger" : ""}>
              {fmtDate(`${item.due_date}T12:00:00`, { day: "numeric", month: "short" })}
              {late && ` · ${t("late")}`}
            </span>
          )}
          {item.status !== "done" && item.not_before && item.not_before > dayKey(new Date()) && (
            <span>{t("from {date}", { date: fmtDate(`${item.not_before}T12:00:00`, { weekday: "short", day: "numeric", month: "short" }) })}</span>
          )}
          {item.status === "done" && item.done_at && <span>{fmtDate(item.done_at, { day: "numeric", month: "short" })}</span>}
        </span>
      </button>
    </li>
  );
}

function ItemList({ title, items, ...rest }: { title?: string; items: WorkItem[] } & Omit<React.ComponentProps<typeof ItemRow>, "item">) {
  if (!items.length) return null;
  return (
    <section>
      {title && <h3 className="eyebrow pb-1">{title}</h3>}
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <ItemRow key={i.id} item={i} {...rest} />
        ))}
      </ul>
    </section>
  );
}

function Row({ title, sub, count, onClick }: { title: string; sub?: string; count: number; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex min-h-12 w-full items-center gap-3 py-1 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
        </span>
        {count > 0 && <span className="tabular-nums text-muted">{count}</span>}
        <span className="text-muted">›</span>
      </button>
    </li>
  );
}

function PeopleTab({ data, onOpen }: { data: Data; onOpen: (o: Open) => void }) {
  const { t } = useFamily();
  return (
    <div className="flex flex-col gap-4">
      {WORK_ROLES.map((r) => {
        const people = data.people.filter((p) => p.role === r.id);
        if (!people.length) return null;
        return (
          <section key={r.id} className="card">
            <h3 className="eyebrow pb-1">{t(r.label)}</h3>
            <ul className="divide-y divide-border">
              {people.map((p) => {
                const { direct, viaProjects } = personItems(p, data.items, data.projects);
                return <Row key={p.id} title={p.name} count={direct.length + viaProjects.length} onClick={() => onOpen({ type: "person", id: p.id })} />;
              })}
            </ul>
          </section>
        );
      })}
      {!data.people.length && <p className="text-sm text-muted">{t("Add your manager, your team and the people you work with. Or tell Hem about them.")}</p>}
    </div>
  );
}

function ProjectsTab({ data, onOpen }: { data: Data; onOpen: (o: Open) => void }) {
  const { t } = useFamily();
  const [showArchived, setShowArchived] = useState(false);
  const shown = data.projects.filter((p) => showArchived || !p.archived);
  const archived = data.projects.filter((p) => p.archived).length;
  const names = (ids: string[]) => ids.map((id) => data.people.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-3">
      {shown.length > 0 && (
        <ul className="card divide-y divide-border py-2">
          {shown.map((p) => (
            <Row
              key={p.id}
              title={p.archived ? `${p.name} · ${t("archived")}` : p.name}
              sub={names(p.person_ids)}
              count={data.items.filter((i) => i.project_id === p.id).length}
              onClick={() => onOpen({ type: "project", id: p.id })}
            />
          ))}
        </ul>
      )}
      {!data.projects.length && <p className="text-sm text-muted">{t("One project per topic you follow, with the people on it.")}</p>}
      {archived > 0 && (
        <button className="self-start text-sm text-muted underline" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? t("Hide archived") : t("Show archived ({n})", { n: archived })}
        </button>
      )}
    </div>
  );
}

function MeetingsTab({ data, onOpen }: { data: Data; onOpen: (o: Open) => void }) {
  const { t } = useFamily();
  const today = isoWeekday();
  // Today's meetings first, then the rest of the week in order.
  const order = (m: WorkMeeting) => (m.weekday === null ? 8 : (m.weekday - today + 7) % 7);
  const sorted = [...data.meetings].sort((a, b) => order(a) - order(b));
  return (
    <div className="flex flex-col gap-3">
      {sorted.length > 0 && (
        <ul className="card divide-y divide-border py-2">
          {sorted.map((m) => {
            const { onAgenda, waiting } = meetingAgenda(m, data.items, dayKey(new Date()));
            const day = m.weekday ? (m.weekday === today ? t("Today") : weekdayName(m.weekday)) : undefined;
            return <Row key={m.id} title={m.name} sub={day} count={onAgenda.length + waiting.length} onClick={() => onOpen({ type: "meeting", id: m.id })} />;
          })}
        </ul>
      )}
      {!data.meetings.length && <p className="text-sm text-muted">{t("Recurring meetings, with who attends: their agenda fills itself.")}</p>}
    </div>
  );
}

// My side: priorities, what I have to do myself, what is not filed yet, and
// what I'm waiting for from others (oldest first, per person).
function MeTab({ data, onOpen, onChanged }: { data: Data; onOpen: (o: Open) => void; onChanged: () => void }) {
  const { t } = useFamily();
  const open = data.items.filter((i) => i.status === "open");
  const priority = open.filter((i) => i.priority);
  const todo = open.filter((i) => !i.priority && i.kind === "todo");
  const unsorted = open.filter((i) => !i.priority && i.kind !== "todo" && !i.person_id && !i.project_id && !i.meeting_id);
  const waiting = data.items.filter((i) => i.status === "waiting").sort((a, b) => (a.waiting_since ?? "").localeCompare(b.waiting_since ?? ""));
  const byPerson = new Map<string, WorkItem[]>();
  for (const i of waiting) byPerson.set(i.person_id ?? "", [...(byPerson.get(i.person_id ?? "") ?? []), i]);
  const list = { data, onOpen, onChanged };
  return (
    <div className="flex flex-col gap-4">
      {priority.length > 0 && (
        <div className="card">
          <ItemList title={t("Priority")} items={priority} {...list} />
        </div>
      )}
      <div className="card">
        <ItemList title={t("My to-do")} items={todo} {...list} />
        {!todo.length && <p className="text-sm text-muted">{t("Nothing to do yourself. Add it above, or tell Hem.")}</p>}
      </div>
      {unsorted.length > 0 && (
        <div className="card">
          <ItemList title={t("To sort")} items={unsorted} {...list} />
        </div>
      )}
      {waiting.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="h2">{t("Waiting on others")}</h2>
          {[...byPerson.entries()].map(([pid, items]) => (
            <div key={pid || "-"} className="card">
              <ItemList title={data.people.find((p) => p.id === pid)?.name ?? t("Nobody")} items={items} hide={["person"]} {...list} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function PeoplePicker({ people, value, onChange }: { people: WorkPerson[]; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useFamily();
  if (!people.length) return <p className="text-sm text-muted">{t("Add people first.")}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => {
        const on = value.includes(p.id);
        return (
          <button type="button" key={p.id} className={`chip-toggle ${on ? "chip-on" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}>
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

function Sheets({ data, open, setOpen, onChanged }: { data: Data; open: Open | null; setOpen: (o: Open | null) => void; onChanged: () => void }) {
  const { t } = useFamily();
  const close = () => setOpen(null);
  const del = useDeleteEntity(data, () => (onChanged(), close()));
  let title = "";
  let body: React.ReactNode = null;
  if (open?.type === "new") {
    title = open.what === "project" ? t("New project") : open.what === "meeting" ? t("New meeting") : t("New person");
    body = <EntityForm key="new" what={open.what} data={data} onDone={(id) => (onChanged(), setOpen(id ? { type: open.what, id } : null))} />;
  } else if (open?.type === "person") {
    const p = data.people.find((x) => x.id === open.id);
    if (p) {
      title = p.name;
      const { direct, viaProjects } = personItems(p, data.items, data.projects);
      const open_ = direct.filter((i) => i.status === "open");
      body = (
        <div className="flex flex-col gap-4">
          {p.notes && <p className="whitespace-pre-line text-sm text-muted">{p.notes}</p>}
          <Capture data={data} onAdded={onChanged} preset={{ person_id: p.id }} />
          {WORK_KINDS.map((k) => (
            <ItemList key={k.id} title={t(k.label)} items={open_.filter((i) => i.kind === k.id)} hide={["person"]} data={data} onOpen={setOpen} onChanged={onChanged} />
          ))}
          <ItemList title={t("Waiting on them")} items={direct.filter((i) => i.status === "waiting")} hide={["person"]} data={data} onOpen={setOpen} onChanged={onChanged} />
          <ItemList title={t("On their projects")} items={viaProjects} data={data} onOpen={setOpen} onChanged={onChanged} />
          {!direct.length && !viaProjects.length && <p className="text-sm text-muted">{t("Nothing for now.")}</p>}
          <History items={data.done.filter((i) => i.person_id === p.id)} hide={["person"]} data={data} onOpen={setOpen} onChanged={onChanged} />
          <Details name={p.name} onDelete={() => del("person", p.id)}>
            <EntityForm key={p.id} what="person" data={data} person={p} onDone={() => onChanged()} />
          </Details>
        </div>
      );
    }
  } else if (open?.type === "project") {
    const p = data.projects.find((x) => x.id === open.id);
    if (p) {
      title = p.name;
      const items = data.items.filter((i) => i.project_id === p.id);
      const who = p.person_ids.map((id) => data.people.find((x) => x.id === id)?.name).filter(Boolean).join(", ");
      body = (
        <div className="flex flex-col gap-4">
          {(who || p.notes) && (
            <p className="whitespace-pre-line text-sm text-muted">
              {who}
              {who && p.notes ? "\n" : ""}
              {p.notes}
            </p>
          )}
          <Capture data={data} onAdded={onChanged} preset={{ project_id: p.id }} />
          <ItemList items={items} hide={["project"]} data={data} onOpen={setOpen} onChanged={onChanged} />
          {!items.length && <p className="text-sm text-muted">{t("Nothing for now.")}</p>}
          <History items={data.done.filter((i) => i.project_id === p.id)} hide={["project"]} data={data} onOpen={setOpen} onChanged={onChanged} />
          <Details name={p.name} onDelete={() => del("project", p.id)}>
            <EntityForm key={p.id} what="project" data={data} project={p} onDone={() => onChanged()} />
          </Details>
        </div>
      );
    }
  } else if (open?.type === "meeting") {
    const m = data.meetings.find((x) => x.id === open.id);
    if (m) {
      title = m.name;
      const { onAgenda, forMeeting, byPerson, nextTime, waiting } = meetingAgenda(m, data.items, dayKey(new Date()));
      const attendees = new Set(m.person_ids);
      body = (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t("Tick an item once it's handed over or discussed: what you hand over then waits on the person.")}</p>
          {/* Collective points first, then each attendee's own. */}
          <ItemList title={t("Agenda")} items={forMeeting} hide={["meeting"]} inMeeting data={data} onOpen={setOpen} onChanged={onChanged} />
          {byPerson.map((g) => (
            <ItemList
              key={g.personId}
              title={data.people.find((p) => p.id === g.personId)?.name}
              items={g.items}
              hide={["meeting", "person"]}
              inMeeting
              data={data}
              onOpen={setOpen}
              onChanged={onChanged}
            />
          ))}
          <ItemList title={t("To follow up")} items={waiting} hide={["meeting"]} data={data} onOpen={setOpen} onChanged={onChanged} />
          {!onAgenda.length && !waiting.length && <p className="text-sm text-muted">{t("Nothing for now.")}</p>}
          <MeetingCapture meeting={m} data={data} onAdded={onChanged} />
          <ItemList title={t("Next time")} items={nextTime} hide={["meeting"]} data={data} onOpen={setOpen} onChanged={onChanged} />
          <History
            items={data.done.filter((i) => i.meeting_id === m.id || (!i.meeting_id && !!i.person_id && attendees.has(i.person_id) && i.kind !== "todo"))}
            hide={["meeting"]}
            data={data}
            onOpen={setOpen}
            onChanged={onChanged}
          />
          <Details name={m.name} onDelete={() => del("meeting", m.id)}>
            <EntityForm key={m.id} what="meeting" data={data} meeting={m} onDone={() => onChanged()} />
          </Details>
        </div>
      );
    }
  } else if (open?.type === "item") {
    const i = [...data.items, ...data.done].find((x) => x.id === open.id);
    if (i) {
      title = t("Edit");
      body = <ItemForm key={i.id} item={i} data={data} onChanged={onChanged} onClose={close} />;
    }
  }
  return (
    <Sheet open={!!body} onClose={close} title={title}>
      {body}
    </Sheet>
  );
}

// Create or edit a person, project or meeting; onDone(id) after saving
// (deleting is useDeleteEntity, next to "Edit details").
function EntityForm({
  what,
  data,
  person,
  project,
  meeting,
  onDone,
}: {
  what: "person" | "project" | "meeting";
  data: Data;
  person?: WorkPerson;
  project?: WorkProject;
  meeting?: WorkMeeting;
  onDone: (id: string | null) => void;
}) {
  const { supabase, t } = useFamily();
  const existing = person ?? project ?? meeting;
  const [name, setName] = useState(existing?.name ?? "");
  const [role, setRole] = useState<WorkRole>(person?.role ?? "team");
  const [personIds, setPersonIds] = useState<string[]>(project?.person_ids ?? meeting?.person_ids ?? []);
  const [weekday, setWeekday] = useState<number | null>(meeting?.weekday ?? null);
  const [archived, setArchived] = useState(project?.archived ?? false);
  const [notes, setNotes] = useState(person?.notes ?? project?.notes ?? "");
  const table = what === "person" ? "work_people" : what === "project" ? "work_projects" : "work_meetings";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const row: Record<string, unknown> =
      what === "person"
        ? { name: name.trim(), role, notes: notes.trim() }
        : what === "project"
          ? { name: name.trim(), person_ids: personIds, archived, notes: notes.trim() }
          : { name: name.trim(), person_ids: personIds, weekday };
    if (existing) {
      await supabase.from(table).update(row).eq("id", existing.id);
      onDone(existing.id);
    } else {
      const { data: made } = await supabase.from(table).insert(row).select("id").single();
      onDone(made?.id ?? null);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name")} autoFocus={!existing} maxLength={80} />
      {what === "person" && (
        <div className="flex flex-wrap gap-2">
          {WORK_ROLES.map((r) => (
            <button type="button" key={r.id} onClick={() => setRole(r.id)} className={`chip-toggle ${role === r.id ? "chip-on" : ""}`}>
              {t(r.label)}
            </button>
          ))}
        </div>
      )}
      {what !== "person" && (
        <>
          <span className="label">{what === "project" ? t("People on it") : t("Attendees")}</span>
          <PeoplePicker people={data.people} value={personIds} onChange={setPersonIds} />
        </>
      )}
      {what !== "meeting" && (
        <textarea
          className="input min-h-20"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={what === "person" ? t("Job, what they own, how they like to work…") : t("Goal, context, who decides…")}
          maxLength={2000}
          aria-label={t("Notes")}
        />
      )}
      {what === "meeting" && (
        <select className="input" value={weekday ?? ""} onChange={(e) => setWeekday(e.target.value ? Number(e.target.value) : null)} aria-label={t("Day")}>
          <option value="">{t("No fixed day")}</option>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {weekdayName(d)}
            </option>
          ))}
        </select>
      )}
      {what === "project" && existing && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("Archived")}
        </label>
      )}
      <button className="btn" disabled={!name.trim()}>{existing ? t("Save") : t("Create")}</button>
    </form>
  );
}

function ItemForm({ item, data, onChanged, onClose }: { item: WorkItem; data: Data; onChanged: () => void; onClose: () => void }) {
  const { supabase, t } = useFamily();
  const { remove } = useItemActions(onChanged);
  const [d, setD] = useState(item);
  const set = <K extends keyof WorkItem>(k: K, v: WorkItem[K]) => setD({ ...d, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) return;
    const now = new Date().toISOString();
    await supabase
      .from("work_items")
      .update({
        title: d.title.trim(),
        kind: d.kind,
        priority: d.priority,
        status: d.status,
        person_id: d.person_id,
        project_id: d.project_id,
        meeting_id: d.meeting_id,
        due_date: d.due_date || null,
        not_before: d.not_before || null,
        // Kept once done: how long it took them.
        waiting_since: d.status === "waiting" ? (item.status === "waiting" ? item.waiting_since : now) : d.status === "done" ? item.waiting_since : null,
        done_at: d.status === "done" ? (item.status === "done" ? item.done_at : now) : null,
      })
      .eq("id", item.id);
    onChanged();
    onClose();
  }

  const select = (label: string, value: string | null, rows: { id: string; name: string }[], onChange: (v: string | null) => void) => (
    <label>
      <span className="label">{label}</span>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <textarea className="input min-h-20" value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={500} aria-label={t("Title")} />
      <div className="flex flex-wrap gap-2">
        {WORK_KINDS.map((k) => (
          <button type="button" key={k.id} onClick={() => set("kind", k.id)} className={`chip-toggle ${d.kind === k.id ? "chip-on" : ""}`}>
            {t(k.label)}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => set("priority", !d.priority)} className={`chip-toggle self-start ${d.priority ? "chip-on" : ""}`}>
        <Flag size={14} />
        {t("Priority")}
      </button>
      <div className="grid grid-cols-3 rounded-full bg-accent-soft p-1 text-sm">
        {(["open", "waiting", "done"] as const).map((s) => (
          <button type="button" key={s} onClick={() => set("status", s)} className={`min-h-9 rounded-full ${d.status === s ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
            {s === "open" ? t("Open") : s === "waiting" ? t("Waiting") : t("Done")}
          </button>
        ))}
      </div>
      {select(t("Person"), d.person_id, data.people, (v) => set("person_id", v))}
      {select(t("Project"), d.project_id, data.projects.filter((p) => !p.archived || p.id === d.project_id), (v) => set("project_id", v))}
      {select(t("Meeting"), d.meeting_id, data.meetings, (v) => set("meeting_id", v))}
      <label>
        <span className="label">{t("Due date")}</span>
        <input type="date" className="input" value={d.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} />
      </label>
      <label>
        <span className="label">{t("Keep off agendas until")}</span>
        <input type="date" className="input" value={d.not_before ?? ""} onChange={(e) => set("not_before", e.target.value || null)} />
      </label>
      <button className="btn" disabled={!d.title.trim()}>{t("Save")}</button>
      <button
        type="button"
        className="btn-ghost self-start text-danger"
        onClick={() => {
          onClose();
          remove(item);
        }}
      >
        {t("Delete")}
      </button>
    </form>
  );
}

// Finished in the last weeks, folded away under the live items.
function History({ items, ...rest }: { items: WorkItem[] } & Omit<React.ComponentProps<typeof ItemRow>, "item">) {
  const { t } = useFamily();
  const [show, setShow] = useState(false);
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <button className="self-start text-sm text-muted underline" onClick={() => setShow(!show)}>
        {show ? t("Hide done") : t("Done lately ({n})", { n: items.length })}
      </button>
      {show && <ItemList items={items} {...rest} />}
    </section>
  );
}

// In the meeting: note what comes up next time, or hand things over on the
// spot ("@Karim send the numbers", "@all fill in the survey").
function MeetingCapture({ meeting, data, onAdded }: { meeting: WorkMeeting; data: Data; onAdded: () => void }) {
  const { supabase, t } = useFamily();
  const [line, setLine] = useState("");
  const [mode, setMode] = useState<"next" | "now">("next");
  const everyone = /(^|\s)@(all|tous|alla)(?=\s|$)/i.test(line);
  const parsed = parseCapture(line.replace(/(^|\s)@(all|tous|alla)(?=\s|$)/gi, " "), data.people, data.projects, data.meetings);
  const targets = everyone ? meeting.person_ids : parsed.person ? [parsed.person.id] : [];
  const ready = !!parsed.title && (mode === "next" || targets.length > 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const base = { title: parsed.title.slice(0, 500), project_id: parsed.project?.id ?? null, meeting_id: meeting.id };
    const now = new Date().toISOString();
    const rows: Record<string, unknown>[] =
      mode === "next"
        ? (targets.length ? targets : [null]).map((person_id) => ({ ...base, person_id, kind: "discuss", not_before: nextMeetingDate(meeting, dayKey(new Date())) }))
        : targets.map((person_id) => ({ ...base, person_id, kind: "give", status: "waiting", waiting_since: now }));
    await supabase.from("work_items").insert(rows);
    setLine("");
    onAdded();
  }

  const who = targets.map((id) => data.people.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
  return (
    <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl bg-accent-soft p-3">
      <div className="grid grid-cols-2 rounded-full bg-surface p-1 text-sm">
        {(["next", "now"] as const).map((k) => (
          <button type="button" key={k} onClick={() => setMode(k)} className={`min-h-9 rounded-full ${mode === k ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
            {k === "next" ? t("For next time") : t("Hand over now")}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder={mode === "next" ? t("What to bring up next time…") : t("@person or @all, what to do…")}
          maxLength={600}
        />
        <button className="btn" disabled={!ready} aria-label={t("Add")}>+</button>
      </div>
      {mode === "now" && (
        <p className="text-xs text-muted">{who ? t("Waiting on: {names}", { names: who }) : t("Name someone with @, or @all for everyone in the meeting.")}</p>
      )}
    </form>
  );
}

// A person's, project's or meeting's own settings, folded under its items.
// Bottom of a person / project / meeting sheet: edit (folded) and delete,
// both always in sight.
function Details({ children, onDelete, name }: { children: React.ReactNode; onDelete: () => Promise<void>; name: string }) {
  const { t } = useFamily();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        {!open && (
          <button className="btn-ghost" onClick={() => setOpen(true)}>
            <Pencil size={14} />
            {t("Edit details")}
          </button>
        )}
        <ConfirmButton className="ml-auto text-sm" armed={t("Delete {name}?", { name })} onConfirm={onDelete}>
          {t("Delete")}
        </ConfirmButton>
      </div>
      {open && children}
    </div>
  );
}

// Deleting a person, project or meeting keeps its items (they become
// unsorted); a person is also taken off the projects and meetings they were on.
function useDeleteEntity(data: Data, onDone: () => void) {
  const { supabase, t } = useFamily();
  const toast = useToast();
  return async (what: "person" | "project" | "meeting", id: string) => {
    if (what === "person") {
      for (const p of [...data.projects, ...data.meetings].filter((x) => x.person_ids.includes(id))) {
        await supabase
          .from("weekday" in p ? "work_meetings" : "work_projects")
          .update({ person_ids: p.person_ids.filter((x) => x !== id) })
          .eq("id", p.id);
      }
    }
    const table = what === "person" ? "work_people" : what === "project" ? "work_projects" : "work_meetings";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast(t("Couldn't delete it. Try again."));
    toast(t("Deleted"));
    onDone();
  };
}
