"use client";

import { MapPin, Repeat } from "lucide-react";
import { useFamily } from "./family-context";
import { MemberBadge } from "./member-select";
import { formatTime } from "@/lib/dates";
import { forIds, occurrenceDays } from "@/lib/events";
import { careTitle } from "@/lib/care";
import type { T } from "@/lib/i18n";
import type { EventOccurrence } from "@/lib/types";

// Time column. On a multi-day event, `day` tells which of its days is shown.
function when(ev: EventOccurrence, t: T, day?: string) {
  const covered = occurrenceDays(ev);
  const i = day ? covered.indexOf(day) : 0;
  if (covered.length > 1 && i >= 0) {
    if (ev.all_day) return t("Day {i}/{n}", { i: i + 1, n: covered.length });
    if (i === covered.length - 1 && ev.occurrence_end) return t("until {time}", { time: formatTime(ev.occurrence_end) });
    if (i > 0) return t("All day");
  }
  return ev.all_day ? t("All day") : formatTime(ev.occurrence_start);
}

export function EventRow({ ev, day, onClick }: { ev: EventOccurrence; day?: string; onClick?: () => void }) {
  const { addedBy, memberById, t } = useFamily();
  const color = memberById(ev.responsible_member_id)?.color;
  const by = addedBy(ev.created_by);
  // Drop-offs / pick-ups made in the Kids tab have an English title: show it in my language.
  const kid = memberById(ev.for_member_id);
  const others = forIds(ev).filter((id) => id !== ev.responsible_member_id);
  const title =
    ev.care && kid && ev.title === careTitle(ev.care, kid)
      ? ev.care === "dropoff" ? t("Drop-off {name}", { name: kid.name }) : t("Pick-up {name}", { name: kid.name })
      : ev.title;
  return (
    <button onClick={onClick} className="flex w-full items-stretch gap-3 py-2.5 text-left">
      <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ background: color ?? "var(--border)" }} />
      <div className="w-16 shrink-0 pt-0.5 text-sm tabular-nums text-muted">{when(ev, t, day)}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {ev.badge && `${ev.badge} `}
          {title}
          {ev.recurrence && <Repeat size={12} className="ml-1.5 inline text-muted" aria-label={t("Repeats")} />}
        </div>
        {ev.location && (
          <div className="flex items-center gap-1 truncate text-sm text-muted">
            <MapPin size={12} className="shrink-0" /> {ev.location}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <MemberBadge id={ev.responsible_member_id} />
          {others.length > 0 && <span className="text-xs text-muted">{t("for")}</span>}
          {others.map((id) => (
            <MemberBadge key={id} id={id} />
          ))}
          {by && <span className="text-xs text-muted">· {t("added by {name}", { name: by })}</span>}
        </div>
      </div>
    </button>
  );
}
