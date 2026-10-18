"use client";

import { CalendarSegments, PageHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, CalendarRange, Maximize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFamily } from "@/components/family-context";
import { EventForm, newEventDraft } from "@/components/event-form";
import { EventRow } from "@/components/event-row";
import { Sheet } from "@/components/sheet";
import { addDays, dayKey, fmtDate, formatDayHeading, startOfDay } from "@/lib/dates";
import { groupByDay, involves } from "@/lib/events";
import { fetchCalendar } from "@/lib/occasions";
import { MODULES } from "@/lib/modules";
import { careKind } from "@/lib/care";
import type { EventOccurrence, ListItem, Member } from "@/lib/types";
import { fetchDueTodos, TodoRow, todoDay } from "@/components/todo-row";
import { buildWeek } from "@/lib/week-days";

// The week opens on its 3D view; three.js loads with it, after the page.
const Stage = dynamic(() => import("@/components/week-diorama").then((m) => m.Stage), { ssr: false });
const WeekDiorama = dynamic(() => import("@/components/week-diorama").then((m) => m.WeekDiorama), { ssr: false });

// Two ways to look: the next seven days (3D on top, the list to read and edit
// below), and the month, a tap away for planning further ahead.
type Mode = "month" | "week";
const MONTH_CELLS = 42; // 6 weeks, like Apple Calendar

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  return addDays(x, -dow);
}

function startOfMonthGrid(d: Date) {
  return startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
}

// One initial per person (and one grey "?" for events nobody is responsible for).
function Initials({ events, max }: { events: EventOccurrence[]; max: number }) {
  const { memberById } = useFamily();
  const people = new Map<string, { m?: Member; title: string; badge?: string }>();
  for (const e of events) {
    // Our anniversary or a birthday shows its emoji instead of an initial.
    const id = e.badge ? `badge:${e.key}` : e.responsible_member_id ?? "none";
    if (!people.has(id)) people.set(id, { m: memberById(e.responsible_member_id), title: e.title, badge: e.badge });
  }
  const list = [...people.values()];
  return (
    <>
      {list.slice(0, max).map(({ m, title, badge }, i) =>
        badge ? (
          <span key={i} title={title} className="flex h-4 w-4 items-center justify-center text-[11px] leading-none">{badge}</span>
        ) : (
          <span
            key={i}
            title={`${title}${m ? ` — ${m.name}` : ""}`}
            className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold leading-none text-white"
            style={{ background: m?.color ?? "#9ca3af" }}
          >
            {m ? m.name.slice(0, 1) : "?"}
          </span>
        ),
      )}
      {list.length > max && <span className="text-[9px] leading-4 text-muted">+{list.length - max}</span>}
    </>
  );
}

export default function CalendarPage() {
  const { supabase, members, kids, me, t } = useFamily();
  const router = useRouter();
  const [who, setWho] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [focus, setFocus] = useState<string | null>(null);
  const [allEvents, setEvents] = useState<EventOccurrence[]>([]);
  const [allTodos, setTodos] = useState<ListItem[]>([]);
  const [editing, setEditing] = useState<Parameters<typeof EventForm>[0]["initial"] | null>(null);
  const [diorama, setDiorama] = useState(false);
  const [flat, setFlat] = useState(false); // no WebGL: the week shows initials instead of the 3D
  const scrollTo = useRef<string | null>(null);

  // Week = the next seven days from the chosen day (today by default), not Monday to Sunday.
  const from = mode === "month" ? startOfMonthGrid(anchor) : startOfDay(anchor);
  const span = mode === "month" ? MONTH_CELLS : 7;
  const fromKey = dayKey(from);

  const load = useCallback(async () => {
    const start = new Date(fromKey + "T00:00:00");
    const [evs, todos] = await Promise.all([
      fetchCalendar(supabase, members, start, addDays(start, span), t),
      // To-dos with a due date show up on their day (late ones on today) until done.
      fetchDueTodos(supabase, dayKey(addDays(start, span - 1))),
    ]);
    setEvents(evs);
    setTodos(todos);
  }, [supabase, members, t, fromKey, span]);


  useEffect(() => {
    load();
    const channel = supabase
      .channel("events")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  // Kids' drop-offs and pick-ups live in the kid tab, not here: they'd fill every day.
  // Filter: only what one person does or what is about them.
  const events = useMemo(
    () =>
      allEvents.filter(
        (e) => careKind(e) === null && (!who || e.badge || involves(e, who)),
      ),
    [allEvents, who],
  );

  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(new Date(fromKey + "T00:00:00"), i)), [fromKey, span]);
  const byDay = useMemo(() => groupByDay(events), [events]);
  const todosByDay = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    for (const i of allTodos) {
      if (who && i.assignee_member_id !== who) continue;
      const k = todoDay(i);
      map.set(k, [...(map.get(k) ?? []), i]);
    }
    return map;
  }, [allTodos, who]);

  // The 3D week: same days and filter, with drop-offs / pick-ups kept to spot the untaken ones.
  const week = useMemo(
    () =>
      buildWeek(
        days,
        allEvents.filter((e) => !who || e.badge || involves(e, who) || careKind(e) !== null),
        allTodos.filter((i) => !who || i.assignee_member_id === who),
        kids,
      ),
    [days, allEvents, allTodos, who, kids],
  );

  // Coming from the month view: bring the tapped day into view (not when tapping it in the 3D).
  useEffect(() => {
    if (mode !== "week" || !scrollTo.current) return;
    document.getElementById(`day-${scrollTo.current}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollTo.current = null;
  }, [mode, events]);

  const todayKey = dayKey(new Date());
  const shift = (n: number) => {
    setFocus(null);
    setAnchor(mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + n, 1) : addDays(anchor, n * span));
  };
  const openWeek = (d: Date) => {
    scrollTo.current = dayKey(d);
    setAnchor(d);
    setFocus(dayKey(d));
    setMode("week");
  };
  const periodLabel =
    mode === "month"
      ? fmtDate(anchor, { month: "long", year: "numeric" })
      : mode === "week"
        ? dayKey(days[0]) === dayKey(new Date())
          ? t("Next 7 days")
          : t("From {date}", { date: fmtDate(days[0], { day: "numeric", month: "short" }) })
        : t("From {date}", { date: fmtDate(days[0], { day: "numeric", month: "short" }) });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("Calendar")}
        module="calendar"
        action={<button className="btn" onClick={() => setEditing(newEventDraft(focus ? new Date(focus + "T00:00:00") : undefined, me))}>+ {t("Event")}</button>}
      >
        <CalendarSegments />
      </PageHeader>

      <PageHem topic="week" />

      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost w-11 shrink-0" onClick={() => shift(-1)} aria-label={t("Previous")}>←</button>
        <div className="min-w-0 text-center">
          {/* Tap the period to switch between the week and the month (planning further ahead). */}
          <button
            className="mx-auto flex max-w-full items-center gap-1.5 font-semibold"
            onClick={() => {
              setFocus(null);
              setMode(mode === "month" ? "week" : "month");
            }}
            aria-label={mode === "month" ? t("Week") : t("Month")}
          >
            <span className="truncate first-letter:uppercase">{periodLabel}</span>
            {mode === "month" ? <CalendarRange size={16} className="shrink-0 text-muted" /> : <CalendarDays size={16} className="shrink-0 text-muted" />}
          </button>
          <button
            className="text-xs text-muted underline underline-offset-2"
            onClick={() => {
              setFocus(null);
              setAnchor(new Date());
            }}
          >
            {t("Today")}
          </button>
        </div>
        <button className="btn-ghost w-11 shrink-0" onClick={() => shift(1)} aria-label={t("Next")}>→</button>
      </div>

      {members.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 text-sm">
          <button onClick={() => setWho(null)} className={`chip-toggle ${who === null ? "chip-on" : ""}`}>{t("Everyone")}</button>
          {members.map((m) => (
            <button key={m.id} onClick={() => setWho(who === m.id ? null : m.id)} className={`chip-toggle ${who === m.id ? "chip-on" : ""}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              {m.name}
            </button>
          ))}
        </div>
      )}

      {mode === "month" && (
        <section className="card p-2">
          <div className="grid grid-cols-7 text-center text-[11px] uppercase text-muted">
            {days.slice(0, 7).map((d) => (
              <div key={dayKey(d)} className="pb-1">{fmtDate(d, { weekday: "narrow" })}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-l border-t border-border">
            {days.map((d) => {
              const k = dayKey(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              const list = byDay.get(k) ?? [];
              return (
                <button
                  key={k}
                  onClick={() => openWeek(d)}
                  aria-label={`${fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}, ${list.length === 1 ? t("1 event") : t("{n} events", { n: list.length })}`}
                  className={`flex min-h-16 flex-col items-center gap-1 border-b border-r border-border px-0.5 py-1 active:bg-accent-soft ${inMonth ? "" : "opacity-40"}`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${k === todayKey ? "bg-accent font-semibold text-on-accent" : ""}`}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    <Initials events={list} max={3} />
                    {todosByDay.has(k) && <span aria-hidden className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: MODULES.todo.color }} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="px-1 pt-2 text-xs text-muted">{t("Tap a day to open its week.")}</p>
        </section>
      )}

      {mode === "week" && !flat && (
        <section className="card relative overflow-hidden p-0">
          <div className="relative aspect-square max-h-[26rem] w-full">
            <Stage inline week={week} members={members} onPick={(i) => setFocus(week[i].key)} onFail={() => setFlat(true)} />
          </div>
          <button onClick={() => setDiorama(true)} aria-label={t("Full screen")} className="glass absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full">
            <Maximize2 size={16} />
          </button>
        </section>
      )}

      {mode === "week" && flat && (
        <section className="card p-3">
          <div className="mb-2 text-sm text-muted first-letter:uppercase">{t("Who has something")}</div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((d) => {
              const k = dayKey(d);
              // Everyone with something that day, timed or not (trips span their days).
              const shown = byDay.get(k) ?? [];
              return (
                <button
                  key={k}
                  onClick={() => setFocus(k)}
                  className={`rounded-lg py-1.5 ${k === todayKey ? "bg-accent-soft" : ""} ${k === focus ? "ring-1 ring-accent" : ""}`}
                >
                  <div className="text-[11px] uppercase text-muted">{fmtDate(d, { weekday: "narrow" })}</div>
                  <div className={`text-sm font-semibold ${k === todayKey ? "text-accent" : ""}`}>{d.getDate()}</div>
                  <div className="mt-1 flex min-h-5 flex-col items-center gap-0.5">
                    <Initials events={shown} max={3} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {mode !== "month" && (
        <div className="flex flex-col gap-3">
          {days.map((day) => {
            const k = dayKey(day);
            const list = byDay.get(k) ?? [];
            const todos = todosByDay.get(k) ?? [];
            if (mode === "week" && list.length === 0 && todos.length === 0 && k !== focus) return null;
            return (
              <section key={k} id={`day-${k}`} className={`card scroll-mt-20 py-3 ${k === focus ? "border-accent" : ""}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold capitalize">{formatDayHeading(day)}</h2>
                  <button className="min-h-9 px-1 text-sm font-medium text-accent" onClick={() => setEditing(newEventDraft(day, me))}>+ {t("Add")}</button>
                </div>
                {todos.length > 0 && (
                  <ul className="mt-1 flex flex-col">
                    {todos.map((i) => (
                      <TodoRow key={i.id} item={i} onDone={(x, done) => (done ? setTodos((xs) => xs.filter((y) => y.id !== x.id)) : load())} />
                    ))}
                  </ul>
                )}
                {list.length === 0 ? (
                  todos.length === 0 && <p className="py-1 text-sm text-muted">{t("Nothing planned")}</p>
                ) : (
                  <div className="divide-y divide-border">
                    {list.map((ev) => (
                      <EventRow key={ev.key} ev={ev} day={k} onClick={() => (ev.link ? router.push(ev.link) : setEditing(ev))} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {mode === "week" && events.length === 0 && todosByDay.size === 0 && !focus && <p className="card text-sm text-muted">{t("Nothing planned this week.")}</p>}
        </div>
      )}

      {diorama && <WeekDiorama week={week} onClose={() => setDiorama(false)} />}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit event") : t("New event")}>
        {editing && (
          <EventForm
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
