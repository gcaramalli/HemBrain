"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFamily } from "@/components/family-context";
import { fetchDueTodos, todoDay } from "@/components/todo-row";
import { CARE_KINDS, careKind, findSlot, isCareDay, type CareKind } from "@/lib/care";
import { addDays, dayKey, fmtDate, formatTime, startOfDay } from "@/lib/dates";
import { groupByDay } from "@/lib/events";
import { fetchCalendar } from "@/lib/occasions";
import { createWeekScene, type SceneDay, type ScenePawn } from "@/lib/week-scene";
import type { EventOccurrence, ListItem, Member } from "@/lib/types";

const DAYS = 7;

type Day = { date: Date; key: string; events: EventOccurrence[]; needs: { kid: Member; kind: CareKind }[]; todos: ListItem[] };

// Calendar → 3D: the next seven days as a little diorama (see `week-scene.ts`),
// full screen in a 9:16 frame, with a frosted card on top and the tapped day's
// plan underneath. Read-only: the calendar itself stays the place to edit.
export function WeekDiorama({ onClose }: { onClose: () => void }) {
  const { supabase, members, kids, family, memberById, t } = useFamily();
  const [week, setWeek] = useState<Day[] | null>(null);
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    const from = startOfDay(new Date());
    const to = addDays(from, DAYS);
    Promise.all([fetchCalendar(supabase, members, from, to, t), fetchDueTodos(supabase, dayKey(addDays(from, DAYS - 1)))]).then(([evs, todos]) => {
      const byDay = groupByDay(evs);
      const today = dayKey(from);
      setWeek(
        Array.from({ length: DAYS }, (_, i) => {
          const date = addDays(from, i);
          const key = dayKey(date);
          const all = byDay.get(key) ?? [];
          // A drop-off or pick-up on a care day that nobody has taken yet.
          const needs = kids.flatMap((kid) =>
            isCareDay(kid, date) ? CARE_KINDS.filter((kind) => !findSlot(all, kid, key, kind)?.responsible_member_id).map((kind) => ({ kid, kind })) : [],
          );
          return { date, key, events: all.filter((e) => careKind(e) === null), needs, todos: todos.filter((x) => (todoDay(x) < today ? today : todoDay(x)) === key) };
        }),
      );
    });
  }, [supabase, members, kids, t]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const stats = useMemo(() => {
    if (!week) return null;
    return [
      { label: t("Activities"), value: week.reduce((n, d) => n + d.events.filter((e) => !e.badge).length, 0) },
      { label: t("To confirm"), value: week.reduce((n, d) => n + d.needs.length, 0), warn: true },
      { label: t("To do"), value: week.reduce((n, d) => n + d.todos.length, 0) },
    ];
  }, [week, t]);

  const day = week?.[picked];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(ellipse_at_50%_40%,#ffffff_0%,#e9ecf2_70%)] dark:bg-[radial-gradient(ellipse_at_50%_40%,#1f2a3c_0%,#0c111a_75%)]">
      <div className="relative h-dvh w-full max-w-[calc(100dvh*9/16)] overflow-hidden">
        {week && <Stage week={week} members={members} onPick={setPicked} />}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-start gap-2">
            <div className="glass flex-1 rounded-3xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff7a1a]" />
                {family.name} • {t("This week")}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(stats ?? [0, 1, 2].map(() => ({ label: "", value: 0, warn: false }))).map((s, i) => (
                  <div key={i}>
                    <div className={`text-2xl font-bold tabular-nums ${s.warn && s.value ? "text-[#e8620c]" : ""}`}>
                      <CountUp to={s.value} delay={900 + i * 150} />
                    </div>
                    <div className="truncate text-[11px] text-muted">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={onClose} aria-label={t("Close")} className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
              <X size={20} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span key={m.id} className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                {m.name}
              </span>
            ))}
          </div>
        </div>

        {day && (
          <div className="absolute inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="glass max-h-[30dvh] overflow-y-auto rounded-3xl px-4 py-3">
              <div className="mb-1 font-semibold first-letter:uppercase">
                {picked === 0 ? t("Today") : fmtDate(day.date, { weekday: "long", day: "numeric", month: "short" })}
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {day.needs.map((n) => (
                  <li key={`${n.kid.id}${n.kind}`} className="flex items-center gap-2 text-[#e8620c]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#ff7a1a]" />
                    {n.kind === "dropoff" ? t("Drop-off {name}", { name: n.kid.name }) : t("Pick-up {name}", { name: n.kid.name })} · {t("nobody yet")}
                  </li>
                ))}
                {day.events.map((e) => {
                  const m = memberById(e.responsible_member_id);
                  return (
                    <li key={e.key} className="flex items-center gap-2">
                      {e.badge ? <span className="w-2.5 text-xs">{e.badge}</span> : <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m?.color ?? "#b9c0cc" }} />}
                      {!e.all_day && <span className="tabular-nums text-muted">{formatTime(e.occurrence_start)}</span>}
                      <span className="truncate">{e.title}</span>
                    </li>
                  );
                })}
                {day.todos.map((x) => (
                  <li key={x.id} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#36a96b]" />
                    <span className="truncate">{x.title}</span>
                  </li>
                ))}
                {!day.events.length && !day.needs.length && !day.todos.length && <li className="text-muted">{t("Nothing planned")}</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// The three.js canvas plus the day names, pinned under each tile.
export function Stage({ week, members, onPick }: { week: Day[]; members: Member[]; onPick: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const [failed, setFailed] = useState(false);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!box.current) return;
    const days: SceneDay[] = week.map((d) => {
      const per = new Map<string, number>();
      for (const e of d.events) if (!e.badge) per.set(e.responsible_member_id ?? "", (per.get(e.responsible_member_id ?? "") ?? 0) + 1);
      return {
        weekend: [0, 6].includes(d.date.getDay()),
        stacks: [...per].map(([id, count]) => ({ color: members.find((m) => m.id === id)?.color ?? "#b9c0cc", count })),
        dates: d.events.filter((e) => e.badge).length,
        needs: d.needs.length,
        todos: d.todos.length,
      };
    });
    // Each pawn goes to the first day with something they do or that is about them.
    const pawns: ScenePawn[] = members.map((m) => {
      const i = week.findIndex((d) => d.events.some((e) => !e.badge && (e.responsible_member_id === m.id || e.for_member_id === m.id)));
      return { color: m.color, kid: !m.profile_id, day: i < 0 ? null : i };
    });
    let scene: ReturnType<typeof createWeekScene>;
    try {
      scene = createWeekScene(box.current, days, pawns, (i) => pick.current(i));
    } catch {
      setFailed(true);
      return;
    }
    let frame = 0;
    const place = () => {
      frame = requestAnimationFrame(place);
      scene.labels().forEach((p, i) => {
        const el = tags.current[i];
        if (el) el.style.transform = `translate(${p.x * box.current!.clientWidth}px, ${p.y * box.current!.clientHeight}px) translate(-50%, -50%)`;
      });
    };
    frame = requestAnimationFrame(place);
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
    };
  }, [week, members]);

  if (failed) return null;
  return (
    <div ref={box} className="absolute inset-0 touch-manipulation">
      {week.map((d, i) => (
        <span
          key={d.key}
          ref={(el) => {
            tags.current[i] = el;
          }}
          className={`pointer-events-none absolute left-0 top-0 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${i === 0 ? "bg-[#ff7a1a] text-white" : "glass"}`}
        >
          {fmtDate(d.date, { weekday: "short" })} {d.date.getDate()}
        </span>
      ))}
    </div>
  );
}

// A number that counts up from 0 once the world has built itself.
function CountUp({ to, delay }: { to: number; delay: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const x = Math.min(1, Math.max(0, (now - start) / 1100));
      setN(Math.round(to * (1 - Math.pow(1 - x, 3))));
      if (x < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, delay]);
  return <>{n}</>;
}
