import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayKey, startOfDay } from "./dates";
import { occurrenceDates } from "./recurrence";
import type { CalendarEvent, EventOccurrence } from "./types";

const DAY = 86400000;

// Events overlapping [from, to), with repeating events expanded into their
// occurrences (in the phone's local time). Multi-day events that started
// before `from` but are still running are included.
// Pass `familyId` when using the service-role client (no RLS to scope it).
export async function fetchOccurrences(supabase: SupabaseClient, from: Date, to: Date, familyId?: string): Promise<EventOccurrence[]> {
  const fromIso = from.toISOString();
  const fromDate = dayKey(from);
  let query = supabase.from("events").select("*");
  if (familyId) query = query.eq("family_id", familyId);
  const { data } = await query
    .lt("starts_at", to.toISOString())
    .or(
      `and(recurrence.is.null,or(starts_at.gte.${fromIso},ends_at.gte.${fromIso})),and(recurrence.not.is.null,or(recurrence_until.is.null,recurrence_until.gte.${fromDate}))`,
    )
    .order("starts_at");
  return expand((data ?? []) as CalendarEvent[], from, to);
}

// Last calendar day an event covers. All-day events include their end date
// (the form stores 23:59, the connector may store 00:00 of that day).
function lastDay(start: Date, end: Date | null, allDay: boolean) {
  if (!end || end <= start) return dayKey(start);
  const last = dayKey(allDay ? end : new Date(end.getTime() - 1));
  return last < dayKey(start) ? dayKey(start) : last;
}

// Every day ("YYYY-MM-DD") an occurrence covers, first to last.
export function occurrenceDays(ev: EventOccurrence): string[] {
  const start = new Date(ev.occurrence_start);
  const last = lastDay(start, ev.occurrence_end ? new Date(ev.occurrence_end) : null, ev.all_day);
  const out: string[] = [];
  for (let d = startOfDay(start); dayKey(d) <= last && out.length < 400; d = addDays(d, 1)) out.push(dayKey(d));
  return out;
}

// Who an event is about (empty = everyone). Rows from before migration 0031 only have `for_member_id`.
export const forIds = (ev: Pick<CalendarEvent, "for_member_id" | "for_member_ids">) =>
  ev.for_member_ids?.length ? ev.for_member_ids : ev.for_member_id ? [ev.for_member_id] : [];
// Whether someone does it or it is about them.
export const involves = (ev: Pick<CalendarEvent, "responsible_member_id" | "for_member_id" | "for_member_ids">, id: string) =>
  ev.responsible_member_id === id || forIds(ev).includes(id);

export const isMultiDay = (ev: EventOccurrence) => occurrenceDays(ev).length > 1;

// Occurrences grouped by every day they cover.
export function groupByDay(events: EventOccurrence[]) {
  const map = new Map<string, EventOccurrence[]>();
  for (const ev of events) for (const k of occurrenceDays(ev)) map.set(k, [...(map.get(k) ?? []), ev]);
  return map;
}

export function expand(events: CalendarEvent[], from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  const firstDay = dayKey(from);
  const windowEnd = dayKey(new Date(to.getTime() - 1));
  for (const ev of events) {
    const base = new Date(ev.starts_at);
    const end = ev.ends_at ? new Date(ev.ends_at) : null;
    const duration = end ? end.getTime() - base.getTime() : null;
    // Look back far enough to catch occurrences that started earlier and are still running.
    const spanDays = Math.max(0, Math.round((new Date(lastDay(base, end, ev.all_day) + "T00:00:00").getTime() - startOfDay(base).getTime()) / DAY));
    const lookFrom = dayKey(addDays(from, -spanDays));
    const skip = new Set(ev.skip_dates ?? []);
    for (const d of occurrenceDates(dayKey(base), ev.recurrence, ev.recurrence_until, lookFrom, windowEnd)) {
      if (skip.has(d)) continue;
      const [y, m, day] = d.split("-").map(Number);
      const start = new Date(base);
      start.setFullYear(y, m - 1, day);
      if (start >= to) continue;
      const occEnd = duration !== null ? new Date(start.getTime() + duration) : null;
      if (lastDay(start, occEnd, ev.all_day) < firstDay) continue;
      out.push({
        ...ev,
        key: `${ev.id}:${d}`,
        occurrence_start: start.toISOString(),
        occurrence_end: occEnd ? occEnd.toISOString() : null,
      });
    }
  }
  return out.sort((a, b) => a.occurrence_start.localeCompare(b.occurrence_start));
}
