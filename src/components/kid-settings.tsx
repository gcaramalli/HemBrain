"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFamily } from "./family-context";
import { MemberEditor } from "./member-editor";
import { Sheet } from "./sheet";
import { fmtDate } from "@/lib/dates";
import type { Member } from "@/lib/types";

// Everything about the kid in one place: preschool routine, then profile.
export function KidSettingsSheet({ kid, open, onClose }: { kid: Member; open: boolean; onClose: () => void }) {
  const { t } = useFamily();
  const router = useRouter();
  return (
    <Sheet open={open} onClose={onClose} title={`${kid.emoji} ${kid.name}`}>
      {open && (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("Usual times")}</h3>
            <KidSettings kid={kid} onDone={onClose} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("Profile")}</h3>
            <MemberEditor member={kid} onChange={() => { onClose(); router.refresh(); }} />
          </section>
        </div>
      )}
    </Sheet>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const ymdLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function KidSettings({ kid, onDone }: { kid: Member; onDone: () => void }) {
  const { supabase, t } = useFamily();
  const router = useRouter();
  const [dropoff, setDropoff] = useState(kid.dropoff_time?.slice(0, 5) ?? "08:00");
  const [pickup, setPickup] = useState(kid.pickup_time?.slice(0, 5) ?? "16:00");
  const [place, setPlace] = useState(kid.care_place ?? "");
  const [pausedUntil, setPausedUntil] = useState(kid.care_paused_until ?? "");
  const [daysOn, setDaysOn] = useState<number[]>(kid.care_days ?? [1, 2, 3, 4, 5]);
  // Monday 2 Jan 2023 + n: weekday names in the account's language.
  const dayName = (iso: number) => fmtDate(new Date(2023, 0, 1 + iso), { weekday: "short" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await supabase
      .from("members")
      .update({
        dropoff_time: dropoff,
        pickup_time: pickup,
        care_place: place.trim() || null,
        care_days: [...daysOn].sort(),
        // Only sent when changed, so saving the rest still works before migration 0035 is applied.
        ...((pausedUntil || null) !== (kid.care_paused_until ?? null) ? { care_paused_until: pausedUntil || null } : {}),
      })
      .eq("id", kid.id);
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label flex items-center gap-1"><Sun size={14} /> {t("Drop-off")}</span>
          <input className="input" type="time" value={dropoff} onChange={(e) => setDropoff(e.target.value)} required />
        </label>
        <label>
          <span className="label flex items-center gap-1"><Moon size={14} /> {t("Pick-up")}</span>
          <input className="input" type="time" value={pickup} onChange={(e) => setPickup(e.target.value)} required />
        </label>
      </div>
      <label>
        <span className="label">{t("Preschool or school")}</span>
        <input className="input" placeholder={t("e.g. Förskolan Solrosen, Hantverkargatan 3")} value={place} onChange={(e) => setPlace(e.target.value)} />
      </label>
      <div>
        <span className="label">{t("Days")}</span>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDaysOn(daysOn.includes(d) ? daysOn.filter((x) => x !== d) : [...daysOn, d])}
              className={`chip-toggle capitalize ${daysOn.includes(d) ? "chip-on" : ""}`}
            >
              {dayName(d)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">{t("No preschool until")}</span>
        <div className="flex gap-2">
          <input className="input" type="date" value={pausedUntil} min={ymdLocal()} onChange={(e) => setPausedUntil(e.target.value)} />
          {pausedUntil && (
            <button type="button" className="btn-ghost" onClick={() => setPausedUntil("")}>
              {t("Clear")}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">{t("The first day back. Until then nothing is planned or reminded for drop-offs and pick-ups.")}</p>
      </div>
      <p className="text-xs text-muted">{t("New drop-offs and pick-ups use these times. Ones already planned keep theirs.")}</p>
      <button className="btn">{t("Save")}</button>
    </form>
  );
}

