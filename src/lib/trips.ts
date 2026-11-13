// A journal entry in a country puts the trip on the timeline (and the country on the map, through the
// trips trigger). planTrip says what to do with the existing trips for an entry on `date`.
import type { Trip } from "./types";

export type TripPlan = { action: "none" } | { action: "extend"; id: string; end_month: string } | { action: "insert"; start_month: string };

const monthIndex = (s: string) => parseInt(s.slice(0, 4), 10) * 12 + parseInt(s.slice(5, 7), 10);

export function planTrip(trips: Pick<Trip, "id" | "country" | "start_month" | "end_month" | "lived">[], country: string, date: string): TripPlan {
  const month = `${date.slice(0, 7)}-01`;
  const mine = trips.filter((x) => x.country === country && !x.lived && x.start_month);
  const covers = mine.some((x) => x.start_month! <= month && (x.end_month ?? x.start_month!) >= month);
  if (covers) return { action: "none" };
  // A trip that ended last month is the same trip going on.
  const before = mine.filter((x) => (x.end_month ?? x.start_month!) < month && monthIndex(month) - monthIndex(x.end_month ?? x.start_month!) <= 1);
  const last = before.sort((a, b) => (b.end_month ?? b.start_month!).localeCompare(a.end_month ?? a.start_month!))[0];
  if (last) return { action: "extend", id: last.id, end_month: month };
  return { action: "insert", start_month: month };
}
