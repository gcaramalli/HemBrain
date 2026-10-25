import "server-only";
import { appUrl } from "./digest";
import { BCP47, translator, type Locale } from "./i18n";

// The Sunday usage email to the super admins (/api/cron/usage-report), built
// from hembrain_weekly_report() (0033): counts and dates, never content.

export type WeeklyReport = {
  generated_at: string;
  totals: Record<string, number>;
  new_accounts: { display_name: string; email: string | null; family: string; joined_existing: boolean; created_at: string; last_sign_in_at: string | null }[];
  families: { name: string; accounts: number; added_7d: number; added_prev_7d: number; last_active: string | null; ai_usd_7d: number }[];
  recipients: { email: string; locale: Locale }[];
};

// Sent from its own address, apart from the news (news@) and sign-in emails (noreply@).
const FROM = () => process.env.REPORT_FROM || "Hembrain <hembrain@hembrain.com>";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const trend = (now: number, before: number) => {
  if (now === before) return "=";
  if (!before) return "↑";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

export function buildReport(r: WeeklyReport, locale: Locale) {
  const t = translator(locale);
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(BCP47[locale], { day: "numeric", month: "short", timeZone: "Europe/Stockholm" }) : "—");
  const n = r.totals;
  const usd = (x: number) => `$${Number(x).toFixed(2)}`;

  const kpis: [string, string, string?][] = [
    [t("Active families"), `${n.active_families_7d} / ${n.families}`, trend(n.active_families_7d, n.active_families_prev_7d)],
    [t("Things added"), String(n.added_7d), trend(n.added_7d, n.added_prev_7d)],
    [t("New accounts"), String(n.new_accounts_7d), n.new_families_7d ? t("{count} new families", { count: n.new_families_7d }) : undefined],
    [t("Accounts"), String(n.accounts)],
    [t("Families using Claude / ChatGPT"), String(n.connector_families_7d)],
    [t("In-app AI"), `${usd(n.ai_usd_7d)} · ${t("{count} calls", { count: n.ai_calls_7d })}`],
    [t("Feedback"), t("{count} this week · {open} to read", { count: n.feedback_7d, open: n.feedback_open })],
    [t("Devices with reminders"), String(n.push_devices)],
  ];

  const accountLine = (a: WeeklyReport["new_accounts"][number]) =>
    `${a.display_name || "?"}${a.email ? ` (${a.email})` : ""} — ${a.joined_existing ? t("joined {family}", { family: a.family }) : t("new family {family}", { family: a.family })}, ${day(a.created_at)}${a.last_sign_in_at ? "" : ` · ${t("never signed in")}`}`;
  const families = r.families.filter((f) => f.added_7d || f.added_prev_7d).slice(0, 15);
  const quiet = r.families.length - families.length;
  const familyLine = (f: WeeklyReport["families"][number]) =>
    `${f.name} — ${t("{count} added", { count: f.added_7d })} (${trend(f.added_7d, f.added_prev_7d)}), ${t("last seen {date}", { date: day(f.last_active) })}${Number(f.ai_usd_7d) ? `, AI ${usd(f.ai_usd_7d)}` : ""}`;

  const subject = t("Hembrain this week: {active} active families, {count} new accounts", { active: n.active_families_7d, count: n.new_accounts_7d });
  const link = `${appUrl()}/stats`;

  const text = [
    subject,
    "",
    ...kpis.map(([k, v, s]) => `${k}: ${v}${s ? ` (${s})` : ""}`),
    "",
    `${t("New accounts")}:`,
    ...(r.new_accounts.length ? r.new_accounts.map((a) => `- ${accountLine(a)}`) : [`- ${t("None this week.")}`]),
    "",
    `${t("Families")}:`,
    ...families.map((f) => `- ${familyLine(f)}`),
    ...(quiet ? [`- ${t("{count} families quiet for two weeks", { count: quiet })}`] : []),
    "",
    link,
  ].join("\n");

  const td = 'style="padding:6px 0;border-bottom:1px solid #eceef2"';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111722">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:20px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(subject)}</h1>
<table style="width:100%;border-collapse:collapse;font-size:15px">
${kpis.map(([k, v, s]) => `<tr><td ${td}>${esc(k)}</td><td ${td} align="right"><b>${esc(v)}</b>${s ? ` <span style="color:#6b7280">${esc(s)}</span>` : ""}</td></tr>`).join("\n")}
</table>
<h2 style="font-size:16px;margin:24px 0 8px">${esc(t("New accounts"))}</h2>
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${r.new_accounts.length ? r.new_accounts.map((a) => `<li>${esc(accountLine(a))}</li>`).join("") : `<li>${esc(t("None this week."))}</li>`}</ul>
<h2 style="font-size:16px;margin:24px 0 8px">${esc(t("Families"))}</h2>
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${families.map((f) => `<li>${esc(familyLine(f))}</li>`).join("")}${quiet ? `<li style="color:#6b7280">${esc(t("{count} families quiet for two weeks", { count: quiet }))}</li>` : ""}</ul>
<p style="margin:24px 0 0"><a href="${link}" style="display:inline-block;background:#111722;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">${esc(t("Open Hembrain admin"))}</a></p>
</div></div></body></html>`;

  return { subject, text, html };
}

export async function sendReportEmail(to: string, email: { subject: string; text: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], ...email }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
