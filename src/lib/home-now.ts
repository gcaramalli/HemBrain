// Where each of us is right now, from today's calendar (the living house on Home).
import { careKind, isCareDay, usualTime } from "./care";
import { isMultiDay } from "./events";
import type { EventOccurrence, Member } from "./types";
import { actKind } from "./act-kind";

export type Place = "home" | "work" | "preschool" | "away" | "out";

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// The event someone is in right now (theirs, or about them), if any. All-day
// and multi-day events count all day; drop-offs and pick-ups don't put anyone
// anywhere (they are a moment, not a place).
function current(events: EventOccurrence[], m: Member, now: Date) {
  return events.find((e) => {
    if (careKind(e) !== null || e.badge) return false;
    if (e.responsible_member_id !== m.id && e.for_member_id !== m.id) return false;
    const start = new Date(e.occurrence_start);
    const end = e.occurrence_end ? new Date(e.occurrence_end) : new Date(start.getTime() + 3600_000);
    if (e.all_day) {
      const last = new Date(end);
      last.setHours(23, 59, 59, 999);
      start.setHours(0, 0, 0, 0);
      return now >= start && now <= last;
    }
    return now >= start && now < end;
  });
}

export function placeOf(m: Member, events: EventOccurrence[], now: Date): Place {
  const e = current(events, m, now);
  if (e) {
    const kind = actKind(e.title, e.badge, isMultiDay(e));
    if (kind === "travel") return "away";
    if (kind === "work" || (kind === "lesson" && m.profile_id)) return "work";
    if (kind === "cleaning" || kind === "repair" || kind === "family") return "home"; // they happen at home
    return "out";
  }
  // A kid on a care day, between the usual drop-off and pick-up.
  if (!m.profile_id && isCareDay(m, now)) {
    const t = now.getHours() * 60 + now.getMinutes();
    if (t >= minutes(usualTime(m, "dropoff")) && t < minutes(usualTime(m, "pickup"))) return "preschool";
  }
  return "home";
}

// Night: before 7 and from 20 (the phone's local time, Stockholm for us).
export const isNight = (now: Date) => now.getHours() < 7 || now.getHours() >= 20;
