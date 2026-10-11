"use client";

import { useCallback, useEffect, useState } from "react";
import { useFamily } from "./family-context";
import { useToast } from "./toast";
import { fmtDate } from "@/lib/dates";
import type { Gift } from "@/lib/types";

const GIFTS = [
  { emoji: "❤️", hint: "Love you" },
  { emoji: "🤗", hint: "Hug" },
  { emoji: "☕", hint: "Coffee's on me" },
  { emoji: "🌟", hint: "You're a star" },
  { emoji: "💪", hint: "You got this" },
  { emoji: "🍫", hint: "A treat" },
  { emoji: "🌷", hint: "For you" },
  { emoji: "😘", hint: "Kiss" },
];

// "À toi, à moi": send a little gift that the other person unwraps when
// they next open the app. One at a time: while it is still wrapped, the card
// shows it as waiting (it can be taken back) instead of sending another.
export function SendGift() {
  const { supabase, profile, members, t } = useFamily();
  const toast = useToast();
  const people = members.filter((m) => m.profile_id && m.profile_id !== profile.id);
  const [to, setTo] = useState<string | null>(people.length === 1 ? people[0].profile_id : null);
  const [emoji, setEmoji] = useState("❤️");
  const [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState<Gift[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("gifts").select("*").eq("from_profile", profile.id).is("opened_at", null);
    setWaiting((data ?? []) as Gift[]);
  }, [supabase, profile.id]);

  // Live: the waiting card goes away as soon as the other person unwraps it.
  useEffect(() => {
    load();
    const channel = supabase
      .channel("gifts-sent")
      .on("postgres_changes", { event: "*", schema: "public", table: "gifts", filter: `from_profile=eq.${profile.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load, profile.id]);

  if (people.length === 0) return null;

  const nameOf = (id: string | null) => people.find((p) => p.profile_id === id)?.name ?? "";
  const pending = waiting.find((g) => g.to_profile === to);

  async function send() {
    if (!to) return;
    setBusy(true);
    const { error } = await supabase.from("gifts").insert({ to_profile: to, emoji, message: message.trim() || null });
    setBusy(false);
    if (error) {
      // 23505 = the one-wrapped-gift index: one is already waiting.
      if (error.code !== "23505") return toast(error.message || t("Could not send"));
    } else {
      setMessage("");
    }
    load();
  }

  // Regret: take it back, as long as it hasn't been unwrapped. The note goes
  // back in the field so it can be fixed and sent again.
  async function takeBack(gift: Gift) {
    const name = nameOf(gift.to_profile);
    const { data } = await supabase.from("gifts").delete().eq("id", gift.id).is("opened_at", null).select("id");
    if (data?.length) {
      setEmoji(gift.emoji);
      setMessage(gift.message ?? "");
      toast(t("Taken back. {name} will never know.", { name }));
    } else {
      toast(t("Too late, {name} already unwrapped it.", { name }));
    }
    load();
  }

  const chips = people.length > 1 && (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => (
        <button key={p.id} onClick={() => setTo(p.profile_id)} className={`chip-toggle ${to === p.profile_id ? "chip-on" : ""}`}>
          {p.emoji} {p.name} {waiting.some((g) => g.to_profile === p.profile_id) && "🎁"}
        </button>
      ))}
    </div>
  );

  if (pending) {
    return (
      <section className="card flex flex-col gap-3">
        <h2 className="h2">{t("Send a little something")}</h2>
        {chips}
        <div className="text-center">
          <div className="animate-gift-wiggle text-5xl">🎁</div>
          <p className="mt-2 font-medium">{t("Waiting for {name} to unwrap it", { name: nameOf(pending.to_profile) })}</p>
          <p className="text-sm text-muted">
            {pending.emoji}
            {pending.message && <> “{pending.message}”</>} · {fmtDate(pending.created_at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-1 text-sm text-muted">{t("One at a time: you can send another once it's opened.")}</p>
          <button className="mt-2 min-h-9 text-sm text-muted underline" onClick={() => takeBack(pending)}>{t("Take it back")}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="h2">{t("Send a little something")}</h2>
      {chips}
      <div className="grid grid-cols-8 gap-1">
        {GIFTS.map((g) => (
          <button
            key={g.emoji}
            title={t(g.hint)}
            onClick={() => setEmoji(g.emoji)}
            className={`rounded-xl py-2 text-2xl transition-transform ${emoji === g.emoji ? "scale-110 bg-accent-soft" : "opacity-70"}`}
          >
            {g.emoji}
          </button>
        ))}
      </div>
      <input
        className="input"
        maxLength={140}
        placeholder={t(GIFTS.find((g) => g.emoji === emoji)?.hint ?? "A little note (optional)")}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button className="btn" onClick={send} disabled={!to || busy}>
        {busy ? t("Wrapping…") : to ? t("Send {emoji} to {name}", { emoji, name: nameOf(to) }) : t("Send {emoji}", { emoji })}
      </button>
    </section>
  );
}
