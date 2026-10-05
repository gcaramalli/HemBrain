"use client";

import { ThinkingDots } from "@/components/thinking-dots";
import { Camera, Copy, FileText, Lock, Paperclip } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { useFamily } from "@/components/family-context";
import { PageHeader } from "@/components/page-header";
import { PinGate, usePin } from "@/components/pin-lock";
import { shrink } from "@/components/receipt-scan";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fmtDate } from "@/lib/dates";
import { deadlineText, inDays, PAPER_CATEGORIES, paperFilePath, PERIODS, upcomingDeadlines, yearlyCost } from "@/lib/papers";
import type { Paper } from "@/lib/types";

// Papers: contracts, insurance, receipts kept for the warranty, IDs. The
// family's are shared; "Only me" ones are private to my account and behind
// my code when I have one. What matters is the dates (last day to cancel,
// expiry) and the terms Claude can compare later, not the PDF itself.

type Scope = "family" | "mine";
type Draft = {
  id?: string;
  mine: boolean;
  category: string;
  title: string;
  provider: string;
  reference: string;
  member_ids: string[];
  amount: string;
  currency: string;
  period: string;
  starts_on: string;
  renews_on: string;
  notice_days: string;
  expires_on: string;
  warranty_until: string;
  summary: string;
  details: string; // "Label: value" per line
  ended: boolean;
  file_path: string | null;
  file_name: string | null;
};

const empty = (mine: boolean): Draft => ({
  mine,
  category: "insurance",
  title: "",
  provider: "",
  reference: "",
  member_ids: [],
  amount: "",
  currency: "SEK",
  period: "year",
  starts_on: "",
  renews_on: "",
  notice_days: "",
  expires_on: "",
  warranty_until: "",
  summary: "",
  details: "",
  ended: false,
  file_path: null,
  file_name: null,
});

const toDraft = (p: Paper): Draft => ({
  id: p.id,
  mine: !!p.profile_id,
  category: p.category,
  title: p.title,
  provider: p.provider ?? "",
  reference: p.reference ?? "",
  member_ids: p.member_ids,
  amount: p.amount == null ? "" : String(p.amount),
  currency: p.currency,
  period: p.period ?? "",
  starts_on: p.starts_on ?? "",
  renews_on: p.renews_on ?? "",
  notice_days: p.notice_days == null ? "" : String(p.notice_days),
  expires_on: p.expires_on ?? "",
  warranty_until: p.warranty_until ?? "",
  summary: p.summary ?? "",
  details: Object.entries(p.details ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"),
  ended: p.ended,
  file_path: p.file_path,
  file_name: p.file_name,
});

const money = (n: number, currency: string) => `${n.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} ${currency}`;

export default function PapersPage() {
  const { supabase, t } = useFamily();
  const pin = usePin();
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [scope, setScope] = useState<Scope>("family");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  const [showEnded, setShowEnded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("papers").select("*").order("title");
    setPapers((data ?? []) as Paper[]);
  }, [supabase]);

  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("scope") === "mine") setScope("mine");
  }, [load]);

  const shown = (papers ?? []).filter((p) => (scope === "mine" ? !!p.profile_id : !p.profile_id));
  const active = shown.filter((p) => !p.ended);
  const ended = shown.filter((p) => p.ended);
  const soon = upcomingDeadlines(active, 60);
  const perYear = active.reduce((sum, p) => sum + (p.currency === "SEK" ? yearlyCost(p) ?? 0 : 0), 0);

  const list = (
    <>
      {soon.length > 0 && (
        <section className="card flex flex-col gap-1">
          <h2 className="font-semibold">{t("Coming up")}</h2>
          {soon.map((d) => (
            <button key={`${d.paper.id}-${d.kind}`} className="text-left text-sm" onClick={() => setEditing(toDraft(d.paper))}>
              <span className={d.kind === "cancel" && d.days <= 14 ? "font-semibold" : "font-medium"}>{deadlineText(t, d)}</span>{" "}
              <span className="text-muted">· {fmtDate(d.date, { day: "numeric", month: "short" })} · {inDays(t, d.days)}</span>
            </button>
          ))}
        </section>
      )}

      {PAPER_CATEGORIES.map((c) => {
        const rows = active.filter((p) => p.category === c.id);
        if (!rows.length) return null;
        return (
          <section key={c.id}>
            <h2 className="eyebrow mb-1">{t(c.label)}</h2>
            <ul className="grid gap-2">
              {rows.map((p) => (
                <li key={p.id}>
                  <PaperCard paper={p} onOpen={() => setEditing(toDraft(p))} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {papers && !active.length && (
        <p className="card text-sm text-muted">
          {scope === "family"
            ? t("Start with the home insurance (hemförsäkring): add the PDF and the app keeps the renewal date and what it covers.")
            : t("Your own contracts: work, pension, a personal insurance. Only you can see them.")}
        </p>
      )}

      {perYear > 0 && <p className="text-right text-sm text-muted">{t("About {amount} a year in recurring costs", { amount: money(Math.round(perYear), "SEK") })}</p>}

      {ended.length > 0 && (
        <section>
          <button className="text-sm text-muted underline" onClick={() => setShowEnded(!showEnded)}>
            {showEnded ? t("Hide ended") : t("Ended ({n})", { n: ended.length })}
          </button>
          {showEnded && (
            <ul className="mt-2 grid gap-2 opacity-70">
              {ended.map((p) => (
                <li key={p.id}>
                  <PaperCard paper={p} onOpen={() => setEditing(toDraft(p))} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ReviewCard />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader module="papers" back="/" backLabel={t("Home")} title={t("Papers")} action={<button className="btn" onClick={() => setAdding(true)}>+ {t("Add")}</button>} />
      <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
        {(["family", "mine"] as const).map((x) => (
          <button key={x} onClick={() => setScope(x)} className={`flex min-h-9 items-center justify-center gap-1.5 rounded-full ${scope === x ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
            {x === "family" ? t("Family") : <>{pin.hasPin && <Lock size={13} aria-hidden />}{t("Only me")}</>}
          </button>
        ))}
      </div>

      {scope === "mine" ? <PinGate locked={!!pin.hasPin}>{list}</PinGate> : list}

      <AddSheet
        open={adding}
        onClose={() => setAdding(false)}
        onDraft={(d) => {
          setAdding(false);
          setEditing({ ...d, mine: scope === "mine" });
        }}
      />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? editing.title : t("New paper")}>
        {editing && (
          <PaperEditor
            key={editing.id ?? "new"}
            draft={editing}
            onDone={(mine) => {
              setEditing(null);
              if (mine !== undefined) setScope(mine ? "mine" : "family");
              load();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function PaperCard({ paper: p, onOpen }: { paper: Paper; onOpen: () => void }) {
  const { t, memberById } = useFamily();
  const who = p.member_ids.map((id) => memberById(id)?.name).filter(Boolean).join(", ");
  const period = PERIODS.find((x) => x.id === p.period);
  return (
    <button className="card flex w-full items-start gap-3 text-left" onClick={onOpen}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{p.title}</div>
        <p className="text-sm text-muted">
          {[p.provider, p.amount != null ? `${money(Number(p.amount), p.currency)}${period && period.id !== "once" ? ` ${t(period.label)}` : ""}` : null, who]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {p.file_path && <Paperclip size={16} className="mt-1 shrink-0 text-muted" aria-label={t("Document attached")} />}
    </button>
  );
}

// Photo or PDF → Claude fills the form (in-app, needs the API key), or type it in.
function AddSheet({ open, onClose, onDraft }: { open: boolean; onClose: () => void; onDraft: (d: Draft & { file?: File }) => void }) {
  const { ai, members, t } = useFamily();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function read(file: File) {
    setError(null);
    if (!ai) {
      // No API key: attach the file and fill the form by hand.
      return onDraft({ ...empty(false), title: file.name.replace(/\.[^.]+$/, ""), file });
    }
    setState("reading");
    try {
      const form = new FormData();
      const isImage = file.type.startsWith("image/") && file.type !== "image/heic";
      form.append("file", isImage ? await shrink(file) : file, isImage ? "photo.jpg" : file.name);
      const res = await fetch("/api/ai/paper", { method: "POST", body: form });
      const data = await res.json();
      setState("idle");
      if (res.status === 402) return setError(t("This month's AI budget is used up. It resets on the 1st."));
      if (res.status === 413) return onDraft({ ...empty(false), title: file.name.replace(/\.[^.]+$/, ""), file });
      if (!res.ok) throw new Error(data.error);
      const ids = (data.covers as string[])
        .map((n) => members.find((m) => m.name.toLowerCase().startsWith(n.trim().toLowerCase()))?.id)
        .filter((x): x is string => !!x);
      onDraft({
        ...empty(false),
        category: data.category,
        title: data.title,
        provider: data.provider ?? "",
        reference: data.reference ?? "",
        member_ids: ids,
        amount: data.amount == null ? "" : String(data.amount),
        currency: (data.currency ?? "SEK").toUpperCase().slice(0, 3),
        period: data.period ?? "",
        starts_on: data.starts_on ?? "",
        renews_on: data.renews_on ?? "",
        notice_days: data.notice_days == null ? "" : String(data.notice_days),
        expires_on: data.expires_on ?? "",
        warranty_until: data.warranty_until ?? "",
        summary: data.summary ?? "",
        details: (data.details as { label: string; value: string }[]).map((d) => `${d.label}: ${d.value}`).join("\n"),
        file,
      });
    } catch {
      setState("idle");
      setError(t("Couldn't read this document. Fill it in by hand, or try a sharper photo."));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("Add a paper")}>
      {state === "reading" ? (
        <p className="flex flex-col items-center gap-3 py-8 text-center text-muted">
          <ThinkingDots size={12} />
          {t("Reading the document…")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <button className="btn" onClick={() => input.current?.click()}>
            <Camera size={16} /> {ai ? t("Photo or PDF: Hem fills it in") : t("Photo or PDF")}
          </button>
          <button className="btn-ghost" onClick={() => onDraft(empty(false))}>{t("Type it in")}</button>
          {!ai && (
            <p className="text-sm text-muted">
              {t("Or send the document to Hem from Claude or ChatGPT and say “file this in our papers”: Hem reads it and fills everything in.")}
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) read(file);
            }}
          />
        </div>
      )}
    </Sheet>
  );
}

function PaperEditor({ draft, onDone }: { draft: Draft & { file?: File }; onDone: (mine?: boolean) => void }) {
  const { supabase, family, profile, members, t } = useFamily();
  const toast = useToast();
  const [d, setD] = useState<Draft>(draft);
  const [file, setFile] = useState<File | null>(draft.file ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) return;
    setSaving(true);
    setError(null);
    const details: Record<string, string> = {};
    for (const line of d.details.split("\n")) {
      const at = line.indexOf(":");
      if (at > 0 && line.slice(at + 1).trim()) details[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".").replace(/\s/g, "")));
    const row = {
      profile_id: d.mine ? profile.id : null,
      category: d.category,
      title: d.title.trim(),
      provider: d.provider.trim() || null,
      reference: d.reference.trim() || null,
      member_ids: d.member_ids,
      amount: num(d.amount),
      currency: (d.currency.trim() || "SEK").toUpperCase(),
      period: d.period || null,
      starts_on: d.starts_on || null,
      renews_on: d.renews_on || null,
      notice_days: num(d.notice_days),
      expires_on: d.expires_on || null,
      warranty_until: d.warranty_until || null,
      summary: d.summary.trim() || null,
      details,
      ended: d.ended,
      updated_at: new Date().toISOString(),
    };
    const res = d.id ? await supabase.from("papers").update(row).eq("id", d.id).select().single() : await supabase.from("papers").insert(row).select().single();
    if (res.error || !res.data) {
      setSaving(false);
      return setError(res.error?.message ?? t("Couldn't save."));
    }
    const saved = res.data as Paper;
    // The document: uploaded under the paper's folder once the row exists.
    if (file) {
      const path = paperFilePath(family.id, saved.id, file.name);
      const up = await supabase.storage.from("papers").upload(path, file, { contentType: file.type || undefined });
      if (up.error) {
        setSaving(false);
        return setError(t("Saved, but the document couldn't be uploaded: {error}", { error: up.error.message }));
      }
      await supabase.from("papers").update({ file_path: path, file_name: file.name.slice(0, 200) }).eq("id", saved.id);
      if (draft.file_path) await supabase.storage.from("papers").remove([draft.file_path]);
    } else if (!d.file_path && draft.file_path) {
      await supabase.storage.from("papers").remove([draft.file_path]);
      await supabase.from("papers").update({ file_path: null, file_name: null }).eq("id", saved.id);
    }
    toast(d.id ? t("Saved") : t("Added to papers"));
    onDone(d.mine);
  }

  async function view() {
    if (!d.file_path) return;
    // Open the tab first: Safari blocks pop-ups opened after an await.
    const tab = window.open("", "_blank");
    const { data } = await supabase.storage.from("papers").createSignedUrl(d.file_path, 120);
    if (data?.signedUrl && tab) tab.location.href = data.signedUrl;
    else tab?.close();
  }

  async function remove() {
    if (!d.id) return;
    if (draft.file_path) await supabase.storage.from("papers").remove([draft.file_path]);
    await supabase.from("papers").delete().eq("id", d.id);
    toast(t("Deleted"));
    onDone();
  }

  const date = (k: "starts_on" | "renews_on" | "expires_on" | "warranty_until", label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input className="input" type="date" value={d[k]} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 rounded-full bg-accent-soft p-1 text-sm">
        {[false, true].map((mine) => (
          <button type="button" key={String(mine)} onClick={() => set("mine", mine)} className={`min-h-9 rounded-full ${d.mine === mine ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}>
            {mine ? t("Only me") : t("Family")}
          </button>
        ))}
      </div>
      <input className="input font-medium" required placeholder={t("e.g. Home insurance")} value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={d.category} onChange={(e) => set("category", e.target.value)} aria-label={t("Category")}>
          {PAPER_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.label)}</option>)}
        </select>
        <input className="input" placeholder={t("Company")} value={d.provider} onChange={(e) => set("provider", e.target.value)} maxLength={200} />
      </div>
      <input className="input" placeholder={t("Policy or contract number")} value={d.reference} onChange={(e) => set("reference", e.target.value)} maxLength={200} />

      <div className="flex flex-wrap gap-2">
        {members.map((m) => {
          const on = d.member_ids.includes(m.id);
          return (
            <button type="button" key={m.id} className={`chip-toggle ${on ? "chip-on" : ""}`} onClick={() => set("member_ids", on ? d.member_ids.filter((x) => x !== m.id) : [...d.member_ids, m.id])}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} /> {m.name}
            </button>
          );
        })}
      </div>
      <p className="-mt-2 text-xs text-muted">{t("Who it covers. Nobody ticked = the whole household.")}</p>

      <div className="grid grid-cols-[1fr_4.5rem_1fr] gap-2">
        <input className="input" inputMode="decimal" placeholder={t("Price")} value={d.amount} onChange={(e) => set("amount", e.target.value)} />
        <input className="input text-center" value={d.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} aria-label={t("Currency")} />
        <select className="input" value={d.period} onChange={(e) => set("period", e.target.value)} aria-label={t("How often")}>
          <option value="">—</option>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {date("renews_on", t("Renews on"))}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t("Notice (days)")}</span>
          <input className="input" inputMode="numeric" placeholder="30" value={d.notice_days} onChange={(e) => set("notice_days", e.target.value.replace(/\D/g, ""))} />
        </label>
        {date("expires_on", t("Expires on"))}
        {date("warranty_until", t("Warranty until"))}
        {date("starts_on", t("Started on"))}
      </div>

      <textarea className="input min-h-24" placeholder={t("What it covers, in plain words")} value={d.summary} onChange={(e) => set("summary", e.target.value)} maxLength={4000} />
      <textarea className="input min-h-20 text-sm" placeholder={t("Key terms, one per line (Deductible: 1 500 kr)")} value={d.details} onChange={(e) => set("details", e.target.value)} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {file ? (
          <span className="flex min-w-0 items-center gap-1.5"><Paperclip size={14} /> <span className="truncate">{file.name}</span></span>
        ) : d.file_path ? (
          <button type="button" className="btn-ghost" onClick={view}><FileText size={16} /> {d.file_name ?? t("Document")}</button>
        ) : null}
        <button type="button" className="btn-ghost" onClick={() => pick.current?.click()}>
          <Paperclip size={16} /> {file || d.file_path ? t("Replace the document") : t("Attach the document")}
        </button>
        {(file || d.file_path) && (
          <button type="button" className="text-muted underline" onClick={() => { setFile(null); set("file_path", null); }}>{t("Remove")}</button>
        )}
        <input ref={pick} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setFile(f); }} />
      </div>

      {d.id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.ended} onChange={(e) => set("ended", e.target.checked)} /> {t("Ended (cancelled or replaced): keep it, no more reminders")}
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button className="btn flex-1" disabled={saving || !d.title.trim()}>{saving ? t("Saving…") : t("Save")}</button>
        {d.id && (
          <ConfirmButton className="btn-ghost" armed={t("Tap again to delete")} onConfirm={remove}>{t("Delete")}</ConfirmButton>
        )}
      </div>
    </form>
  );
}

// The point of keeping papers: once a year, let Claude look for what we pay
// twice, what's missing, and what to renegotiate before the deadline.
const reviewPrompt = (t: (s: string) => string) =>
  t("Review our papers in Hembrain (get_papers with review): insurance we pay twice, cover we're missing for the family, contracts to renegotiate or cancel before their deadline, and what we pay per year. Be concrete and tell me what to do first.");

function ReviewCard() {
  const { t } = useFamily();
  const toast = useToast();
  return (
    <section className="card flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-semibold"><ThinkingDots size={6} still /> {t("Ask Hem for a review")}</h2>
      <p className="text-sm text-muted">{t("Once a year, or before a renewal: Hem reads your papers and says what to cancel, merge or renegotiate.")}</p>
      <p className="rounded-xl bg-accent-soft p-3 text-sm">{reviewPrompt(t)}</p>
      <button
        className="btn-ghost self-start"
        onClick={async () => {
          await navigator.clipboard.writeText(reviewPrompt(t));
          toast(t("Copied: paste it into Claude"));
        }}
      >
        <Copy size={16} /> {t("Copy")}
      </button>
    </section>
  );
}
