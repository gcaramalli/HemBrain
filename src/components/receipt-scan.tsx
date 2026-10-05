"use client";

import { ThinkingDots } from "@/components/thinking-dots";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { useFamily } from "./family-context";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

type Line = { name: string; quantity: string | null; price: number | null; keep: boolean };
type Result = { store: string | null; date: string | null; items: Line[] };

// Phones take 4–12 MB photos; a 1600 px JPEG is plenty to read a receipt.
export async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}

// "Scan a receipt": photo → Claude reads the lines → review → purchases logged
// and matching shopping items checked off.
export function ReceiptScan({ onLogged }: { onLogged: () => void }) {
  const { supabase, ai, t } = useFamily();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "help" | "reading" | "review">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read(file: File) {
    setState("reading");
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("photo", await shrink(file), "receipt.jpg");
      const res = await fetch("/api/ai/receipt", { method: "POST", body: form });
      const data = await res.json();
      if (res.status === 402) {
        setError(t("This month's AI budget is used up. It resets on the 1st."));
        setState("review");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResult({ store: data.store, date: data.date, items: data.items.map((i: Omit<Line, "keep">) => ({ ...i, keep: true })) });
      setState("review");
    } catch {
      setError(t("Couldn't read this receipt. Try a sharper photo, flat and well lit."));
      setState("review");
    }
  }

  async function log() {
    if (!result) return;
    const items = result.items.filter((i) => i.keep && i.name.trim());
    if (!items.length) return setState("idle");
    const purchasedAt = result.date ? new Date(`${result.date}T12:00:00`).toISOString() : new Date().toISOString();
    // Log purchases first: checking items off then doesn't log them twice.
    const { error } = await supabase.from("purchases").insert(
      items.map((i) => ({ item_name: i.name.trim(), quantity: i.quantity, price: i.price, store: result.store, source: "receipt", purchased_at: purchasedAt })),
    );
    if (error) return setError(error.message);
    const { data: open } = await supabase.from("list_items").select("id, title, lists!inner(kind)").eq("done", false).eq("lists.kind", "grocery");
    const names = items.map((i) => i.name.trim().toLowerCase());
    const hits = (open ?? []).filter((o) => {
      const x = o.title.trim().toLowerCase();
      return names.some((n) => n === x || (x.length > 2 && n.includes(x)) || (n.length > 2 && x.includes(n)));
    });
    if (hits.length) await supabase.from("list_items").update({ done: true, done_at: new Date().toISOString() }).in("id", hits.map((h) => h.id));
    toast(t("{n} purchases logged · {m} checked off the list", { n: items.length, m: hits.length }));
    setState("idle");
    setResult(null);
    onLogged();
  }

  const setLine = (n: number, patch: Partial<Line>) =>
    setResult((r) => (r ? { ...r, items: r.items.map((l, i) => (i === n ? { ...l, ...patch } : l)) } : r));
  const total = result?.items.filter((i) => i.keep).reduce((s, i) => s + (i.price ?? 0), 0) ?? 0;

  return (
    <>
      <button className="btn-ghost" onClick={() => (ai ? input.current?.click() : setState("help"))}><Camera size={16} /> {t("Scan a receipt")}</button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) read(file);
        }}
      />

      <Sheet open={state === "help"} onClose={() => setState("idle")} title={t("Scan a receipt")}>
        <div className="flex flex-col gap-3 text-sm">
          <p>{t("Send the photo of the receipt to Claude (with your Hembrain link connected in Me → Reminders & AI) and say “log this receipt”. Claude logs every line and checks off what was on the list.")}</p>
          <p className="text-muted">{t("To scan right here instead, the admin adds an Anthropic API key (ANTHROPIC_API_KEY) to the app's server settings. It costs about a cent per receipt.")}</p>
        </div>
      </Sheet>

      <Sheet open={state === "reading" || state === "review"} onClose={() => setState("idle")} title={t("Receipt")}>
        {state === "reading" && (
          <p className="flex flex-col items-center gap-3 py-8 text-center text-muted">
            <ThinkingDots size={12} />
            {t("Reading the receipt…")}
          </p>
        )}
        {state === "review" && error && !result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-danger">{error}</p>
            <button className="btn" onClick={() => input.current?.click()}>{t("Try another photo")}</button>
          </div>
        )}
        {state === "review" && result && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder={t("Store")} value={result.store ?? ""} onChange={(e) => setResult({ ...result, store: e.target.value || null })} />
              <input className="input" type="date" value={result.date ?? ""} onChange={(e) => setResult({ ...result, date: e.target.value || null })} />
            </div>
            <p className="text-xs text-muted">{t("Untick anything you don't want to track. Names can be edited.")}</p>
            <ul className="divide-y divide-border">
              {result.items.map((l, n) => (
                <li key={n} className="flex items-center gap-2 py-1.5">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={l.keep} onChange={(e) => setLine(n, { keep: e.target.checked })} aria-label={l.name} />
                  <input className="input py-1.5" value={l.name} onChange={(e) => setLine(n, { name: e.target.value })} />
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted">{l.price != null ? l.price.toFixed(2) : ""}</span>
                </li>
              ))}
            </ul>
            {total > 0 && <p className="text-right text-sm tabular-nums">{t("Total")} {total.toFixed(2)}</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            <button className="btn" onClick={log}>{t("Log {n} purchases", { n: result.items.filter((i) => i.keep).length })}</button>
          </div>
        )}
      </Sheet>
    </>
  );
}
