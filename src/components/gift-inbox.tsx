"use client";

import { useCallback, useEffect, useState } from "react";
import { useFamily } from "./family-context";
import { fmtDate } from "@/lib/dates";
import type { Gift } from "@/lib/types";

// Unwraps gifts sent to me, one at a time, when I open the app (or live).
export function GiftInbox() {
  const { supabase, profile, members, t } = useFamily();
  const [queue, setQueue] = useState<Gift[]>([]);
  const [opened, setOpened] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("gifts")
      .select("*")
      .eq("to_profile", profile.id)
      .is("opened_at", null)
      .order("created_at");
    setQueue((data ?? []) as Gift[]);
  }, [supabase, profile.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("gifts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gifts", filter: `to_profile=eq.${profile.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load, profile.id]);

  const gift = queue[0];
  if (!gift) return null;
  const sender = members.find((m) => m.profile_id === gift.from_profile);
  const from = sender?.name ?? t("Someone");

  async function unwrap() {
    setOpened(true);
    await supabase.from("gifts").update({ opened_at: new Date().toISOString() }).eq("id", gift.id);
  }

  function next() {
    setOpened(false);
    setQueue((q) => q.slice(1));
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-xs rounded-3xl bg-surface p-6 text-center shadow-xl">
        {!opened && (
          <>
            <p className="text-sm text-muted">{t("A little something from")}</p>
            <p className="text-lg font-semibold" style={{ color: sender?.color }}>{sender?.emoji} {from}</p>
          </>
        )}
        {opened ? (
          <div className="animate-gift-pop my-4 text-8xl">{gift.emoji}</div>
        ) : (
          <button onClick={unwrap} className="animate-gift-wiggle my-6 text-8xl" aria-label={t("Open the gift")}>🎁</button>
        )}
        {!opened ? (
          <button onClick={unwrap} className="btn w-full">{t("Open")}</button>
        ) : (
          <>
            {gift.message && <p className="text-lg">“{gift.message}”</p>}
            <p className="mt-2 text-sm text-muted">— {from}, {fmtDate(gift.created_at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</p>
            <button onClick={next} className="btn mt-6 w-full">{queue.length > 1 ? t("Next ({n} more)", { n: queue.length - 1 }) : `${t("Thanks!")} 💛`}</button>
          </>
        )}
      </div>
    </div>
  );
}
