// Drop-offs and pick-ups of a child: one calendar event each, tagged `care`.
// Older events without the tag are recognised by their title.
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKey } from "./dates";
import type { CareAvailability, EventOccurrence, Member } from "./types";

export type CareKind = "dropoff" | "pickup";
export const CARE_KINDS: CareKind[] = ["dropoff", "pickup"];

const DROP = /(drop|lämn|dépos|dépôt|amener)/i;
const PICK = /(pick|hämt|récup|chercher)/i;

export function careKind(ev: EventOccurrence): CareKind | null {
  if (ev.care) return ev.care;
  if (PICK.test(ev.title)) return "pickup";
  if (DROP.test(ev.title)) return "dropoff";
  return null;
}

// Stored titles stay in English; the app shows them in each person's language.
export const careTitle = (kind: CareKind, kid: Member) => `${kind === "dropoff" ? "Drop-off" : "Pick-up"} ${kid.name}`;

export function usualTime(kid: Member, kind: CareKind) {
  return (kind === "dropoff" ? kid.dropoff_time : kid.pickup_time)?.slice(0, 5) ?? (kind === "dropoff" ? "08:00" : "16:00");
}

// ISO weekday (Monday = 1) of a local date.
export const isoWeekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;
// Not a care day while the kid is off preschool (care_paused_until = first day back).
export const isCareDay = (kid: Pick<Member, "care_days" | "care_paused_until">, d: Date) =>
  !(kid.care_paused_until && dayKey(d) < kid.care_paused_until) && (kid.care_days ?? [1, 2, 3, 4, 5]).includes(isoWeekday(d));

// The drop-off or pick-up of `kid` on `day`, if planned.
export function findSlot(events: EventOccurrence[], kid: Member, day: string, kind: CareKind) {
  return events.find((e) => e.for_member_id === kid.id && dayKey(e.occurrence_start) === day && careKind(e) === kind) ?? null;
}

// Give a slot to someone (or to nobody). Handles one-off events and single
// days of a repeating one.
export async function assignSlot(
  supabase: SupabaseClient,
  kid: Member,
  day: string,
  kind: CareKind,
  memberId: string | null,
  existing: EventOccurrence | null,
) {
  const skip = async (ev: EventOccurrence) =>
    supabase.from("events").update({ skip_dates: [...(ev.skip_dates ?? []), day] }).eq("id", ev.id);

  if (existing) {
    if (existing.recurrence) {
      const { error } = await skip(existing);
      if (error || !memberId) return error;
      const len = existing.occurrence_end ? new Date(existing.occurrence_end).getTime() - new Date(existing.occurrence_start).getTime() : null;
      return (
        await supabase.from("events").insert({
          title: existing.title,
          starts_at: existing.occurrence_start,
          ends_at: len !== null ? new Date(new Date(existing.occurrence_start).getTime() + len).toISOString() : null,
          all_day: existing.all_day,
          location: existing.location,
          notes: existing.notes,
          responsible_member_id: memberId,
          for_member_id: kid.id,
          care: kind,
        })
      ).error;
    }
    if (!memberId) return (await supabase.from("events").delete().eq("id", existing.id)).error;
    return (await supabase.from("events").update({ responsible_member_id: memberId, care: kind }).eq("id", existing.id)).error;
  }

  if (!memberId) return null;
  const start = new Date(`${day}T${usualTime(kid, kind)}:00`);
  return (
    await supabase.from("events").insert({
      title: careTitle(kind, kid),
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 30 * 60000).toISOString(),
      all_day: false,
      location: kid.care_place,
      responsible_member_id: memberId,
      for_member_id: kid.id,
      care: kind,
    })
  ).error;
}

// Who said they can or can't, per day, between `from` and `to` (exclusive).
export async function fetchAvailability(supabase: SupabaseClient, from: string, to: string) {
  const { data } = await supabase.from("care_availability").select("kid_id, day, kind, member_id, available").gte("day", from).lt("day", to);
  return (data ?? []) as CareAvailability[];
}

export const slotAvailability = (all: CareAvailability[], kid: Member, day: string, kind: CareKind) =>
  all.filter((a) => a.kid_id === kid.id && a.day === day && a.kind === kind);

// true = can, false = can't, null = hasn't said.
export async function setAvailability(
  supabase: SupabaseClient,
  kid: Member,
  day: string,
  kind: CareKind,
  memberId: string,
  available: boolean | null,
) {
  if (available === null) {
    return (await supabase.from("care_availability").delete().match({ kid_id: kid.id, day, kind, member_id: memberId })).error;
  }
  return (
    await supabase
      .from("care_availability")
      .upsert({ kid_id: kid.id, day, kind, member_id: memberId, available, updated_at: new Date().toISOString() }, { onConflict: "kid_id,day,kind,member_id" })
  ).error;
}
