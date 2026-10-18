"use client";

import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { StatsHeader } from "@/components/page-header";
import { dayKey, fmtDate } from "@/lib/dates";
import { digestEmail, parseDraft, pick, type Digest } from "@/lib/digest-format";
import { LOCALES, type Locale } from "@/lib/i18n";

type Field = "subject" | "body" | "nudge";

// The weekly news email (0027): Claude writes a draft on Sunday morning
// (docs/weekly-digest.md); it is read here in each language, fixed if needed,
// tested on myself, then sent to everyone — or skipped. Nothing goes out alone.
export default function DigestAdminPage() {
  const { supabase, superAdmin, locale, t } = useFamily();
  const [digests, setDigests] = useState<Digest[] | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [lang, setLang] = useState<Locale>(locale);
  const [nudge, setNudge] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<Field, string>>({ subject: "", body: "", nudge: "" });
  const [audience, setAudience] = useState<{ all: number; quiet: number } | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("digests").select("*").order("week_of", { ascending: false }).limit(12);
    const list = (data ?? []) as Digest[];
    setDigests(list);
    setId((cur) => cur ?? list.find((d) => d.status === "draft")?.id ?? list[0]?.id ?? null);
  }, [supabase]);

  useEffect(() => {
    if (!superAdmin) return;
    load();
    supabase.rpc("digest_recipients").then(({ data }) => {
      const rows = (data ?? []) as { inactive: boolean }[];
      setAudience({ all: rows.length, quiet: rows.filter((r) => r.inactive).length });
    });
  }, [supabase, superAdmin, load]);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!superAdmin) return <p className="text-muted">{t("Only Hembrain's owner can see this page.")}</p>;
  const d = digests?.find((x) => x.id === id) ?? null;

  function startEdit() {
    if (!d) return;
    setDraft({ subject: pick(d.subject, lang), body: pick(d.body, lang), nudge: pick(d.nudge, lang) });
    setEditing(true);
  }

  async function saveEdit() {
    if (!d) return;
    const patch = {
      subject: { ...d.subject, [lang]: draft.subject },
      body: { ...d.body, [lang]: draft.body },
      nudge: { ...(d.nudge ?? {}), [lang]: draft.nudge },
    };
    setDigests((xs) => xs?.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) ?? null);
    setEditing(false);
    await supabase.from("digests").update(patch).eq("id", d.id);
  }

  async function send(test: boolean) {
    if (!d) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/digest/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, test }) });
    const out = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
    setBusy(false);
    setMessage(out.error ? `${t("Not sent")}: ${out.error}` : test ? `✓ ${t("Test sent to you")}` : `✓ ${t("Sent to {n} people", { n: out.sent ?? 0 })}`);
    if (!test) load();
  }

  // A draft for today, when the Sunday routine didn't write one: empty, or from a pasted text.
  async function createDraft() {
    setBusy(true);
    setMessage(null);
    const parsed = parseDraft(pasted);
    const { data, error } = await supabase
      .from("digests")
      .insert({
        week_of: dayKey(new Date()),
        subject: { en: "", ...parsed.subject },
        body: { en: "", ...parsed.body },
        nudge: Object.keys(parsed.nudge).length ? parsed.nudge : null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setMessage(`${t("Not created")}: ${error.message}`);
    setPasted("");
    await load();
    setId(data.id);
    setEditing(false);
  }

  async function skip() {
    if (!d) return;
    setDigests((xs) => xs?.map((x) => (x.id === d.id ? { ...x, status: "skipped" } : x)) ?? null);
    await supabase.from("digests").update({ status: "skipped" }).eq("id", d.id).eq("status", "draft");
  }

  const preview = d ? digestEmail(d, lang, { inactive: nudge, appUrl: window.location.origin, unsubscribeUrl: "#" }) : null;
  const STATUS: Record<Digest["status"], string> = { draft: t("Draft"), sending: t("Sending…"), sent: t("Sent"), skipped: t("Skipped") };

  return (
    <div className="flex flex-col gap-4">
      <StatsHeader />
      {digests === null && <p className="text-muted">{t("Loading…")}</p>}
      {digests && !digests.length && (
        <p className="card text-sm text-muted">{t("No news yet. Claude writes a draft on Sunday morning when something new was shipped during the week.")}</p>
      )}

      {digests && !digests.some((x) => x.week_of === dayKey(new Date())) && (
        <section className="card flex flex-col gap-2">
          <h2 className="h2">{t("New draft for today")}</h2>
          <p className="text-sm text-muted">{t("Nothing was written for today. Start an empty draft, or paste a whole one: “# en”, “# fr”, “# sv”, each with “## subject”, “## body” and “## nudge”.")}</p>
          <textarea className="input min-h-32 font-mono text-sm" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"# en\n## subject\n…\n## body\n…\n## nudge\n…\n# fr\n…"} />
          <button className="btn self-start" disabled={busy} onClick={createDraft}>{pasted.trim() ? t("Create the draft from this text") : t("Create an empty draft")}</button>
          {message && <p className="text-sm">{message}</p>}
        </section>
      )}

      {d && preview && (
        <section className="card flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h2">{t("Week of {date}", { date: fmtDate(d.week_of, { day: "numeric", month: "long" }) })}</h2>
            <span className="text-sm text-muted">{STATUS[d.status]}{d.sent_count ? ` · ${d.sent_count}` : ""}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {LOCALES.map((l) => (
              <button key={l.id} onClick={() => { setLang(l.id); setEditing(false); }} className={`chip-toggle ${lang === l.id ? "chip-on" : ""}`}>
                {l.label}
              </button>
            ))}
            {pick(d.nudge, lang) && (
              <button onClick={() => setNudge((x) => !x)} className={`chip-toggle ${nudge ? "chip-on" : ""}`}>
                {t("As a quiet family sees it")}
              </button>
            )}
          </div>

          {editing ? (
            <div className="flex flex-col gap-2">
              <label>
                <span className="label">{t("Subject")}</span>
                <input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </label>
              <label>
                <span className="label">{t("Text")}</span>
                <textarea className="input min-h-64 font-mono text-sm" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              </label>
              <label>
                <span className="label">{t("For families who haven't opened Hembrain for two weeks")}</span>
                <textarea className="input min-h-24 font-mono text-sm" value={draft.nudge} onChange={(e) => setDraft({ ...draft, nudge: e.target.value })} />
              </label>
              <p className="text-xs text-muted">{t("Blank line = new paragraph, “- ” = bullet, **bold**.")}</p>
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={saveEdit}>{t("Save")}</button>
                <button className="btn-ghost" onClick={() => setEditing(false)}>{t("Cancel")}</button>
              </div>
            </div>
          ) : (
            <>
              <iframe title={preview.subject} srcDoc={preview.html} sandbox="" className="h-[32rem] w-full rounded-xl bg-white" />
              {d.status === "draft" && (
                <button className="self-start text-sm text-muted underline" onClick={startEdit}>{t("Edit this language")}</button>
              )}
            </>
          )}

          {d.status === "draft" && !editing && (
            <div className="flex flex-col gap-2">
              <button className="btn-ghost" disabled={busy} onClick={() => send(true)}>{t("Send me a test")}</button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => (armed ? (setArmed(false), send(false)) : setArmed(true))}
              >
                {armed
                  ? t("Tap again to send to {n} people", { n: audience?.all ?? 0 })
                  : t("Send to everyone ({n})", { n: audience?.all ?? 0 })}
              </button>
              {audience && audience.quiet > 0 && (
                <p className="text-xs text-muted">{t("{n} of them in quiet families get the extra paragraph.", { n: audience.quiet })}</p>
              )}
              <button className="self-start text-sm text-muted underline" disabled={busy} onClick={skip}>{t("Skip this week")}</button>
            </div>
          )}
          {message && <p className="text-sm">{message}</p>}
        </section>
      )}

      {digests && digests.length > 1 && (
        <section className="card flex flex-col gap-1 text-sm">
          <h2 className="h2 mb-1">{t("Earlier")}</h2>
          {digests.map((x) => (
            <button key={x.id} onClick={() => { setId(x.id); setEditing(false); setMessage(null); }} className={`flex justify-between gap-3 py-1 text-left ${x.id === id ? "font-semibold" : ""}`}>
              <span className="min-w-0 truncate">{fmtDate(x.week_of, { day: "numeric", month: "short" })} · {pick(x.subject, lang)}</span>
              <span className="shrink-0 text-muted">{STATUS[x.status]}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
