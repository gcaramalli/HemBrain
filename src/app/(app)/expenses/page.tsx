"use client";

import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { MemberBadge } from "@/components/member-select";
import { PageHeader } from "@/components/page-header";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { dayKey, fmtDate } from "@/lib/dates";
import { fmtMoney, isEqual, ratioLabel, settleUp } from "@/lib/expenses";
import { BCP47 } from "@/lib/i18n";
import type { Expense } from "@/lib/types";

type Shares = Record<string, number>;
// How an expense is split: equally, the family's usual split, or amounts typed by hand.
type Mode = "equal" | "family" | "other";
type Draft = { id?: string; title: string; amount: string; paid_by: string; spent_on: string; mode: Mode; other: Record<string, string> };

// Shared expenses, a small Tricount: one of us pays for the family, the app
// splits it and says who owes whom. Paying back is logged as a settlement.
// Logging is quick (what, how much, who paid) and uses the family's usual
// split (50/50 unless set); tapping an expense adjusts it with three buttons.
export default function ExpensesPage() {
  const { supabase, members, me, locale, t } = useFamily();
  const toast = useToast();
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [usual, setUsual] = useState<Shares | null>(null); // null = 50/50
  const [setting, setSetting] = useState<Record<string, string> | null>(null);
  // Only the adults (accounts) pay and share; a kid's nappies are split between the parents.
  const adults = members.filter((m) => m.profile_id);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
  const money = (n: number, cur: string) => fmtMoney(n, cur, BCP47[locale]);

  const load = useCallback(async () => {
    const [{ data }, { data: st }] = await Promise.all([
      supabase.from("expenses").select("*").order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("expense_settings").select("shares").maybeSingle(),
    ]);
    setRows((data ?? []) as Expense[]);
    const sh = (st?.shares ?? {}) as Shares;
    setUsual(Object.keys(sh).length ? sh : null);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase.channel("expenses").on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, load).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const ids = adults.map((m) => m.id);
  const familyUneven = !isEqual(usual, ids);
  const amountOf = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
  const fresh = (): Draft => ({ title: "", amount: "", paid_by: me?.id ?? ids[0] ?? "", spent_on: dayKey(new Date()), mode: familyUneven ? "family" : "equal", other: {} });

  // The draft's split as stored: null (equal between the adults) or weights.
  function sharesOf(d: Draft): Shares | null {
    if (d.mode === "family" && familyUneven && usual) return usual;
    if (d.mode === "other") return Object.fromEntries(ids.map((id) => [id, Math.max(0, amountOf(d.other[id] ?? "") || 0)]));
    return null;
  }
  const otherLeft = (d: Draft) => Math.round((amountOf(d.amount) - ids.reduce((a, id) => a + (amountOf(d.other[id] ?? "") || 0), 0)) * 100) / 100;
  const valid = (d: Draft) => !!d.title.trim() && amountOf(d.amount) > 0 && (d.mode !== "other" || (otherLeft(d) === 0 && ids.some((id) => amountOf(d.other[id] ?? "") > 0)));

  function toDraft(r: Expense): Draft {
    const mode: Mode = !r.shares ? "equal" : familyUneven && usual && ids.every((id) => (r.shares![id] ?? 0) === (usual[id] ?? 0)) ? "family" : "other";
    const other: Record<string, string> = {};
    if (mode === "other") {
      // Show each person's part in kr, whatever the weights were.
      const sum = Object.values(r.shares!).reduce((a, b) => a + b, 0) || 1;
      for (const id of ids) other[id] = String(Math.round(((r.shares![id] ?? 0) * Number(r.amount) * 100) / sum) / 100);
    }
    return { id: r.id, title: r.title, amount: String(r.amount), paid_by: r.paid_by, spent_on: r.spent_on, mode, other };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !valid(editing)) return;
    const shares = sharesOf(editing);
    const fields = {
      title: editing.title.trim(),
      amount: amountOf(editing.amount),
      paid_by: editing.paid_by,
      spent_on: editing.spent_on,
      shares,
      split_among: shares ? ids.filter((id) => shares[id] > 0) : ids,
    };
    if (editing.id) await supabase.from("expenses").update(fields).eq("id", editing.id);
    else await supabase.from("expenses").insert(fields);
    setEditing(null);
    load();
  }

  async function saveUsual(next: Shares | null) {
    await supabase.from("expense_settings").upsert({ shares: next ?? {}, updated_at: new Date().toISOString() });
    setSetting(null);
    load();
  }
  const settingLeft = (x: Record<string, string>) => 100 - ids.reduce((a, id) => a + (amountOf(x[id] ?? "") || 0), 0);

  async function remove(id: string) {
    const before = rows?.find((r) => r.id === id);
    await supabase.from("expenses").delete().eq("id", id);
    setEditing(null);
    load();
    if (before) {
      toast(t("Expense deleted"), async () => {
        await supabase.from("expenses").insert(before);
        load();
      });
    }
  }

  async function settle(from: string, to: string, amount: number, currency: string) {
    const { data } = await supabase
      .from("expenses")
      .insert({ title: "Paid back", amount, currency, paid_by: from, split_among: [to], settlement: true })
      .select("id")
      .single();
    load();
    toast(t("{from} paid {to} back", { from: name(from), to: name(to) }), async () => {
      if (data) await supabase.from("expenses").delete().eq("id", data.id);
      load();
    });
  }

  const transfers = settleUp(rows ?? []);
  const thisMonth = dayKey(new Date()).slice(0, 7);
  const spentThisMonth = (rows ?? []).filter((r) => !r.settlement && r.spent_on.startsWith(thisMonth) && r.currency === "SEK").reduce((s, r) => s + Number(r.amount), 0);
  const months = new Map<string, Expense[]>();
  for (const r of rows ?? []) months.set(r.spent_on.slice(0, 7), [...(months.get(r.spent_on.slice(0, 7)) ?? []), r]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        module="expenses"
        back="/"
        backLabel={t("Home")}
        title={t("Expenses")}
        action={<button className="btn" onClick={() => setEditing(fresh())}>+ {t("Expense")}</button>}
      />

      {rows && (
        <section className="card flex flex-col gap-3">
          {transfers.length === 0 ? (
            <p className="font-semibold">{t("All square")}</p>
          ) : (
            transfers.map((x) => (
              <div key={`${x.from}-${x.to}-${x.currency}`} className="flex items-center justify-between gap-3">
                <p className="min-w-0">
                  <span className="block text-sm text-muted">{t("{from} owes {to}", { from: name(x.from), to: name(x.to) })}</span>
                  <span className="text-2xl font-bold tabular-nums">{money(x.amount, x.currency)}</span>
                </p>
                <button className="btn-ghost shrink-0" onClick={() => settle(x.from, x.to, x.amount, x.currency)}>{t("Settle up")}</button>
              </div>
            ))
          )}
          <p className="text-sm text-muted">{t("Spent this month: {amount}", { amount: money(spentThisMonth, "SEK") })}</p>
          {ids.length > 1 && (
            <button
              className="self-start text-sm text-muted underline"
              onClick={() => setSetting(Object.fromEntries(ids.map((id) => [id, String(Math.round((usual ? ((usual[id] ?? 0) * 100) / (Object.values(usual).reduce((a, b) => a + b, 0) || 1) : 100 / ids.length)))])))}
            >
              {t("Usual split: {ratio}", { ratio: familyUneven ? `${ratioLabel(usual, ids)} (${adults.map((m) => m.name).join("/")})` : ratioLabel(null, ids) })}
            </button>
          )}
        </section>
      )}

      {rows?.length === 0 && (
        <p className="rounded-[22px] border border-dashed border-border p-4 text-sm text-muted">
          {t("Log what one of you paid for the family (toilet paper, the plumber, a gift) and the app keeps the balance. Or tell Hem: “I paid 89 kr for toilet paper”.")}
        </p>
      )}

      {[...months].map(([month, list]) => (
        <section key={month}>
          <h3 className="text-sm font-medium capitalize text-muted">{fmtDate(new Date(`${month}-15T12:00:00`), { month: "long", year: "numeric" })}</h3>
          <ul className="divide-y divide-border">
            {list.map((r) => (
              <li key={r.id}>
                <button
                  className={`flex min-h-12 w-full items-center gap-3 py-2 text-left ${r.settlement ? "text-muted" : ""}`}
                  onClick={() =>
                    r.settlement
                      ? remove(r.id)
                      : setEditing(toDraft(r))
                  }
                  aria-label={r.settlement ? t("Undo this payback") : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {r.settlement ? t("{from} paid {to} back", { from: name(r.paid_by), to: name(r.split_among[0]) }) : r.title}
                    </span>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {fmtDate(new Date(`${r.spent_on}T12:00:00`), { day: "numeric", month: "short" })}
                      {!r.settlement && <MemberBadge id={r.paid_by} />}
                      {!r.settlement && r.split_among.length < ids.length && <span>· {t("for {names}", { names: r.split_among.map(name).join(", ") })}</span>}
                      {!r.settlement && r.split_among.length === ids.length && r.shares && !isEqual(r.shares, ids) && <span>· {ratioLabel(r.shares, ids)}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(Number(r.amount), r.currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("Edit expense") : t("New expense")}>
        {editing && (
          <form className="flex flex-col gap-3" onSubmit={save}>
            <input className="input" autoFocus={!editing.id} required maxLength={200} placeholder={t("What? (toilet paper)")} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <div className="flex gap-2">
              <input className="input" inputMode="decimal" required placeholder={t("Amount (kr)")} value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
              <input className="input" type="date" value={editing.spent_on} onChange={(e) => setEditing({ ...editing, spent_on: e.target.value })} />
            </div>
            <p className="text-sm font-medium">{t("Paid by")}</p>
            <div className="flex flex-wrap gap-2">
              {adults.map((m) => (
                <button type="button" key={m.id} className={`chip-toggle ${editing.paid_by === m.id ? "chip-on" : ""}`} onClick={() => setEditing({ ...editing, paid_by: m.id })}>
                  {m.name}
                </button>
              ))}
            </div>
            {/* Logging is quick: the usual split applies. Adjust it by opening the expense. */}
            {!editing.id ? (
              ids.length > 1 && <p className="text-xs text-muted">{t("Split {ratio}, change it later by tapping the expense.", { ratio: familyUneven ? ratioLabel(usual, ids) : ratioLabel(null, ids) })}</p>
            ) : (
              ids.length > 1 && (
                <>
                  <p className="text-sm font-medium">{t("Split")}</p>
                  <div className={`grid ${familyUneven ? "grid-cols-3" : "grid-cols-2"} rounded-full bg-accent-soft p-1 text-sm`}>
                    {(["equal", ...(familyUneven ? ["family" as const] : []), "other"] as Mode[]).map((m) => (
                      <button
                        type="button"
                        key={m}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            mode: m,
                            // "Other" starts from an even split the person then edits.
                            other: m === "other" && !Object.keys(editing.other).length ? Object.fromEntries(ids.map((id) => [id, String(Math.round((amountOf(editing.amount) * 100) / ids.length) / 100)])) : editing.other,
                          })
                        }
                        className={`min-h-9 rounded-full ${editing.mode === m ? "bg-[var(--pill)] font-semibold shadow-sm" : "text-muted"}`}
                      >
                        {m === "equal" ? ratioLabel(null, ids) : m === "family" ? ratioLabel(usual, ids) : t("Other")}
                      </button>
                    ))}
                  </div>
                  {editing.mode === "other" && (
                    <div className="flex flex-col gap-2">
                      {adults.map((m) => (
                        <label key={m.id} className="flex items-center gap-3">
                          <span className="w-24 truncate text-sm">{m.name}</span>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={editing.other[m.id] ?? ""}
                            onChange={(e) => {
                              const other = { ...editing.other, [m.id]: e.target.value };
                              // With two of us, the other part fills itself in.
                              if (ids.length === 2) {
                                const rest = ids.find((id) => id !== m.id)!;
                                other[rest] = String(Math.max(0, Math.round((amountOf(editing.amount) - (amountOf(e.target.value) || 0)) * 100) / 100));
                              }
                              setEditing({ ...editing, other });
                            }}
                          />
                        </label>
                      ))}
                      {otherLeft(editing) !== 0 && <p className="text-xs text-danger">{t("{amount} left to share out", { amount: money(otherLeft(editing), "SEK") })}</p>}
                    </div>
                  )}
                </>
              )
            )}
            <div className="flex gap-2">
              <button className="btn flex-1" disabled={!valid(editing)}>{t("Save")}</button>
              {editing.id && <button type="button" className="btn-ghost text-danger" onClick={() => remove(editing.id!)}>{t("Delete")}</button>}
            </div>
          </form>
        )}
      </Sheet>
      <Sheet open={!!setting} onClose={() => setSetting(null)} title={t("Usual split")}>
        {setting && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (settingLeft(setting) !== 0) return;
              const next = Object.fromEntries(ids.map((id) => [id, amountOf(setting[id] ?? "") || 0]));
              saveUsual(isEqual(next, ids) ? null : next);
            }}
          >
            <p className="text-sm text-muted">{t("Used for each new expense. Past ones keep their split.")}</p>
            {adults.map((m) => (
              <label key={m.id} className="flex items-center gap-3">
                <span className="w-24 truncate text-sm">{m.name}</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={setting[m.id] ?? ""}
                  onChange={(e) => {
                    const next = { ...setting, [m.id]: e.target.value };
                    if (ids.length === 2) next[ids.find((id) => id !== m.id)!] = String(Math.max(0, 100 - (amountOf(e.target.value) || 0)));
                    setSetting(next);
                  }}
                />
                <span className="text-sm text-muted">%</span>
              </label>
            ))}
            {settingLeft(setting) !== 0 && <p className="text-xs text-danger">{t("The total must be 100%")}</p>}
            <div className="flex gap-2">
              <button className="btn flex-1" disabled={settingLeft(setting) !== 0}>{t("Save")}</button>
              <button type="button" className="btn-ghost" onClick={() => saveUsual(null)}>{ratioLabel(null, ids)}</button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
