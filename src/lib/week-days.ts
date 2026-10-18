// The seven days the 3D week shows, worked out from the calendar's own data
// (no three.js here, so the calendar can build them before the scene loads).
import { todoDay } from "@/components/todo-row";
import { CARE_KINDS, careKind, findSlot, isCareDay, type CareKind } from "./care";
import { dayKey } from "./dates";
import { groupByDay } from "./events";
import type { EventOccurrence, ListItem, Member } from "./types";

export type WeekDay = {
  date: Date;
  key: string;
  today: boolean;
  events: EventOccurrence[]; // without drop-offs / pick-ups
  needs: { kid: Member; kind: CareKind }[]; // drop-offs / pick-ups on a care day nobody has taken
  todos: ListItem[];
};

// `all` = every occurrence of those days, drop-offs and pick-ups included (they decide `needs`).
export function buildWeek(days: Date[], all: EventOccurrence[], todos: ListItem[], kids: Member[]): WeekDay[] {
  const byDay = groupByDay(all);
  const todayKey = dayKey(new Date());
  return days.map((date) => {
    const key = dayKey(date);
    const list = byDay.get(key) ?? [];
    const needs = kids.flatMap((kid) =>
      key >= todayKey && isCareDay(kid, date) ? CARE_KINDS.filter((kind) => !findSlot(list, kid, key, kind)?.responsible_member_id).map((kind) => ({ kid, kind })) : [],
    );
    return { date, key, today: key === todayKey, events: list.filter((e) => careKind(e) === null), needs, todos: todos.filter((x) => todoDay(x) === key) };
  });
}
