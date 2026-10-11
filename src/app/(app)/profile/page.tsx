"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useFamily } from "@/components/family-context";
import { LOCALES, type Locale } from "@/lib/i18n";

const COLORS = ["#4f46e5", "#db2777", "#059669", "#d97706", "#0891b2", "#7c3aed", "#dc2626", "#475569"];

export default function ProfilePage() {
  const { supabase, profile, members, me, locale, t } = useFamily();
  const router = useRouter();
  const [name, setName] = useState(profile.display_name);
  const [color, setColor] = useState(me?.color ?? profile.color);
  const [emoji, setEmoji] = useState(me?.emoji ?? "🙂");
  const [lang, setLang] = useState<Locale>(locale);
  const [birthdate, setBirthdate] = useState(me?.birthdate ?? "");
  const [news, setNews] = useState(!profile.digest_opt_out);
  const [saved, setSaved] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwMessage, setPwMessage] = useState<string | null>(null);

  // Colours someone else in the family already has: two people with the same
  // colour can't be told apart on the calendar.
  const taken = new Map(members.filter((m) => m.id !== me?.id).map((m) => [m.color.toLowerCase(), m.name]));
  const changed = () => setSaved(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwMessage(error ? error.message : `✓ ${t("Password changed")}`);
    if (!error) setNewPassword("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("profiles").update({ display_name: name, color, locale: lang, digest_opt_out: !news }).eq("id", profile.id);
    // Keep the calendar "member" row in sync with the profile.
    if (me) await supabase.from("members").update({ name, color, emoji, birthdate: birthdate || null }).eq("id", me.id);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader module="profile" back="/settings" backLabel={t("Settings")} title={t("Personal settings")} />

      <form onSubmit={save} className="card flex flex-col gap-3">
        <div className="flex gap-2">
          <label className="w-20 shrink-0">
            <span className="label">{t("Emoji")}</span>
            <input className="input text-center text-xl" value={emoji} onChange={(e) => { setEmoji(e.target.value); changed(); }} />
          </label>
          <label className="flex-1">
            <span className="label">{t("Name")}</span>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); changed(); }} />
          </label>
        </div>
        <div>
          <span className="label">{t("Colour on the calendar")}</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => {
              const owner = taken.get(c);
              return (
                <button
                  type="button"
                  key={c}
                  disabled={!!owner}
                  onClick={() => { setColor(c); changed(); }}
                  className={`relative h-10 w-10 rounded-full disabled:opacity-25 ${color.toLowerCase() === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
                  style={{ background: c }}
                  aria-label={owner ? t("{colour}, taken by {name}", { colour: c, name: owner }) : c}
                  title={owner ? t("Taken by {name}", { name: owner }) : undefined}
                >
                  {owner && <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{owner.slice(0, 1)}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {me && (
          <label>
            <span className="label">{t("Date of birth")}</span>
            <input className="input" type="date" value={birthdate} onChange={(e) => { setBirthdate(e.target.value); changed(); }} />
            <span className="mt-1 block text-xs text-muted">{t("Shown in the family calendar; the others get a reminder the evening before.")}</span>
          </label>
        )}
        <label>
          <span className="label">{t("Language")}</span>
          <select className="input" value={lang} onChange={(e) => { setLang(e.target.value as Locale); changed(); }}>
            {LOCALES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={news} onChange={(e) => { setNews(e.target.checked); changed(); }} />
          <span>
            {t("What's new in Hembrain, by email")}
            <span className="block text-xs text-muted">{t("A short email on Sunday, only in weeks with something new.")}</span>
          </span>
        </label>
        <p className="text-sm text-muted">{profile.email} · {t(profile.role)}</p>
        <button className="btn">{saved ? `✓ ${t("Saved")}` : t("Save")}</button>
      </form>

      <form onSubmit={changePassword} className="card flex flex-col gap-3">
        <h2 className="h2">{t("Password")}</h2>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          placeholder={t("New password (at least 8 characters)")}
          value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); setPwMessage(null); }}
        />
        <button className="btn">{t("Change password")}</button>
        {pwMessage && <p className="text-sm text-muted">{pwMessage}</p>}
      </form>
    </div>
  );
}
