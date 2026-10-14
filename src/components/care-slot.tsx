"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFamily } from "./family-context";
import { assignSlot, findSlot, setAvailability, usualTime, type CareKind } from "@/lib/care";
import { fetchOccurrences } from "@/lib/events";
import { fmtDate, formatTime } from "@/lib/dates";
import { Sheet } from "./sheet";
import type { CareAvailability, EventOccurrence, Member } from "@/lib/types";

// What I said about one slot: "going" (confirmed, I'm the event's responsible),
// "yes" (I can), "no" (I can't) or null (not said yet).
type Mine = "going" | "yes" | "no" | null;

// One drop-off or pick-up. Each parent says whether they can; the one who
// goes confirms it ("I'm going"), which puts it in the calendar under their name.
export function CareSlot({
  kid,
  day,
  kind,
  event,
  availability,
  past,
  onChanged,
  onEdit,
}: {
  kid: Member;
  day: string;
  kind: CareKind;
  event: EventOccurrence | null;
  availability: CareAvailability[];
  past?: boolean;
  onChanged: () => void;
  onEdit?: (ev: EventOccurrence) => void;
}) {
  const { supabase, adults, me, memberById, t } = useFamily();
  const [shown, setShown] = useState<Mine | undefined>(undefined); // optimistic value
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const queue = useRef(Promise.resolve());

  const goerId = event?.responsible_member_id ?? null;
  const said = (id: string) => availability.find((a) => a.member_id === id)?.available;
  const saved: Mine = me && goerId === me.id ? "going" : me && said(me.id) !== undefined ? (said(me.id) ? "yes" : "no") : null;
  const mine = shown !== undefined ? shown : saved;
  // Once I've just confirmed or backed out, show that before the server catches up.
  const goer = memberById(mine === "going" ? me?.id : goerId === me?.id ? null : goerId);
  const answer = (a: Member): Mine => (a.id === me?.id ? mine : a.id === goerId ? "going" : said(a.id) === undefined ? null : said(a.id) ? "yes" : "no");
  const nobodyCan = !goer && adults.length > 0 && adults.every((a) => answer(a) === "no");
  const someoneCan = !goer && adults.some((a) => answer(a) === "yes");

  // The server state caught up: drop the optimistic value.
  const answers = availability.map((a) => `${a.member_id}:${a.available}`).join();
  useEffect(() => setShown(undefined), [event?.key, goerId, answers]);

  function change(next: Mine) {
    if (!me) return;
    setShown(next);
    setError(false);
    // Taps are applied one after the other, each against the latest state.
    queue.current = queue.current.then(async () => {
      let err = await setAvailability(supabase, kid, day, kind, me.id, next === null ? null : next !== "no");
      // Confirming puts me on the calendar event; any other answer takes me off it.
      if (!err) {
        // Re-read the slot: an earlier tap may have just created or changed it.
        const start = new Date(`${day}T00:00:00`);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const latest = findSlot(await fetchOccurrences(supabase, start, end), kid, day, kind);
        if (next === "going" || latest?.responsible_member_id === me.id) {
          err = await assignSlot(supabase, kid, day, kind, next === "going" ? me.id : null, latest);
        }
      }
      if (err) setError(true);
      onChanged();
    });
    // The other parent hears "I'm going" / "I can't" from Hem, server side
    // (src/lib/partner-notify.ts), once the tapping has settled.
  }

  const time = event ? formatTime(event.occurrence_start) : usualTime(kid, kind);
  const status = goer ? t("{name} is going", { name: goer.name }) : nobodyCan ? t("Nobody can") : someoneCan ? t("Not confirmed") : t("Who?");
  const mineLabel = { going: t("I'm going"), yes: t("I can"), no: t("I can't") };
  const kindLabel = kind === "dropoff" ? t("Drop-off") : t("Pick-up");
  const pick = (next: Mine) => {
    setOpen(false);
    if (next !== mine) change(next);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        onClick={() => setOpen(true)}
        disabled={!me}
        aria-label={`${kindLabel} ${time}: ${status}. ${mine ? mineLabel[mine] + "." : ""}`}
        className={`${past ? "opacity-50" : ""} flex min-h-14 w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
          goer ? "border-transparent" : nobodyCan ? "border-danger" : "border-dashed border-border"
        } ${error ? "border-danger" : ""}`}
        style={goer ? { background: `color-mix(in srgb, ${goer.color} 14%, transparent)` } : undefined}
      >
        {/* Someone's going: the slot wears their colour, so their name has the room. */}
        {goer ? null : (
          <span className="flex shrink-0 -space-x-1.5">
            {adults.map((a) => (
              <Answer key={a.id} person={a} answer={answer(a)} />
            ))}
          </span>
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-xs tabular-nums text-muted">
            {kind === "dropoff" ? <Sun size={12} /> : <Moon size={12} />} {time}
          </span>
          <span className={`block truncate text-sm font-medium ${goer ? "" : nobodyCan ? "text-danger" : "text-muted"}`}>
            {goer ? `${goer.name} ✓` : status}
          </span>
        </span>
      </button>
      {/* One tap opens the choices, spelled out: no hidden tap cycle to learn. */}
      <Sheet open={open} onClose={() => setOpen(false)} title={`${kindLabel} · ${fmtDate(`${day}T12:00:00`, { weekday: "long", day: "numeric", month: "short" })} · ${time}`}>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {adults.filter((a) => a.id !== me?.id).map((a) => {
              const x = answer(a);
              return (
                <li key={a.id} className="flex items-center gap-2">
                  <Answer person={a} answer={x === "going" ? "yes" : x} />
                  <span>{a.name}: {x === "going" ? t("is going") : x === "yes" ? t("can") : x === "no" ? t("can't") : t("hasn't said")}</span>
                </li>
              );
            })}
          </ul>
          <button className="btn" onClick={() => pick("going")} disabled={mine === "going"}>
            ✓ {t("I'm going")}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className={`btn-ghost ${mine === "yes" ? "border-foreground font-semibold" : ""}`} onClick={() => pick("yes")}>
              {t("I can")}
            </button>
            <button className={`btn-ghost ${mine === "no" ? "border-danger font-semibold text-danger" : ""}`} onClick={() => pick("no")}>
              {t("I can't")}
            </button>
          </div>
          {mine && (
            <button className="min-h-9 text-sm text-muted underline" onClick={() => pick(null)}>
              {t("Clear my answer")}
            </button>
          )}
          {event && onEdit && (
            <button
              className="min-h-9 text-sm text-muted underline"
              onClick={() => {
                setOpen(false);
                onEdit(event);
              }}
            >
              {t("Edit time or place")}
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}

// A parent's initial with what they said: filled = can, red cross = can't, dashed = not said.
function Answer({ person, answer }: { person: Member; answer: Mine }) {
  const { t } = useFamily();
  const label = answer === "no" ? t("can't") : answer ? t("can") : t("hasn't said");
  return (
    <span
      title={`${person.name}: ${label}`}
      className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold ${
        answer === "yes" ? "text-white" : answer === "no" ? "text-danger" : "text-muted"
      }`}
      style={
        answer === "yes"
          ? { background: person.color }
          : answer === "no"
            ? { background: "var(--surface)", boxShadow: `inset 0 0 0 1.5px ${person.color}` }
            : { background: "var(--surface)", outline: "1px dashed var(--muted)", outlineOffset: "-3px" }
      }
    >
      {answer === "no" ? "✕" : person.name.slice(0, 1)}
    </span>
  );
}
