// The weekly news email (0027): turns the draft Claude wrote into the email
// people get. Pure, so Hembrain admin → News previews exactly what is sent.
import { translator, type Locale } from "@/lib/i18n";

export type Localized = Partial<Record<Locale, string>>;

export type Digest = {
  id: string;
  week_of: string;
  subject: Localized;
  body: Localized;
  nudge: Localized | null;
  status: "draft" | "sending" | "sent" | "skipped";
  sent_at: string | null;
  sent_count: number | null;
  created_at: string;
};

// English is always written; a missing translation falls back to it.
export const pick = (x: Localized | null | undefined, locale: Locale) => (x?.[locale] || x?.en || "").trim();

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

// A picture on its own line: `![what it shows](/digest/2026-10-18-week.jpg)`. Only
// files the app itself serves from public/digest/, so a draft can't pull in
// anything from elsewhere.
const IMAGE = /^!\[([^\]]*)\]\((\/digest\/[\w.-]+\.(?:png|jpe?g|gif|webp))\)$/;

// Short paragraphs separated by a blank line, "- " bullets, **bold**, and
// pictures (see IMAGE). Nothing else: the text comes from a draft, so
// everything is escaped. `base` = the app's address, for the pictures.
export function textToHtml(text: string, base = ""): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const img = lines.length === 1 && IMAGE.exec(lines[0]);
      if (img) return `<p style="margin:0 0 16px"><img src="${esc(base + img[2])}" alt="${esc(img[1])}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:14px"></p>`;
      if (lines.length && lines.every((l) => l.startsWith("- "))) {
        return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin:0 0 8px">${inline(l.slice(2))}</li>`).join("")}</ul>`;
      }
      return `<p style="margin:0 0 16px">${lines.map(inline).join("<br>")}</p>`;
    })
    .join("");
}

export function textToPlain(text: string): string {
  return text
    .trim()
    .split("\n")
    .filter((l) => !IMAGE.test(l.trim())) // pictures don't exist in plain text
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\*\*(.+?)\*\*/g, "$1");
}

export function digestEmail(d: Pick<Digest, "subject" | "body" | "nudge">, locale: Locale, opts: { inactive: boolean; appUrl: string; unsubscribeUrl: string }) {
  const t = translator(locale);
  const subject = pick(d.subject, locale);
  const body = pick(d.body, locale);
  const nudge = opts.inactive ? pick(d.nudge, locale) : "";
  const open = t("Open Hembrain");
  const footer = t("You get this email once a week at most, when Hembrain has something new.");
  const stop = t("Stop these emails");

  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c28">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:20px;padding:28px 24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 20px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6b6b80">Hembrain</p>
<h1 style="margin:0 0 20px;font-size:24px;line-height:1.25">${esc(subject)}</h1>
${textToHtml(body, opts.appUrl)}
${nudge ? `<div style="margin:8px 0 16px;padding:16px;border-radius:14px;background:#f1f0ff">${textToHtml(nudge, opts.appUrl)}</div>` : ""}
<p style="margin:24px 0 0"><a href="${esc(opts.appUrl)}" style="display:inline-block;background:#1c1c28;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${esc(open)}</a></p>
</div>
<p style="margin:16px 8px 0;font-size:12px;line-height:1.5;color:#6b6b80">${esc(footer)} <a href="${esc(opts.unsubscribeUrl)}" style="color:#6b6b80">${esc(stop)}</a></p>
</div></body></html>`;

  const text = [textToPlain(body), nudge ? textToPlain(nudge) : "", `${open}: ${opts.appUrl}`, `${footer}\n${stop}: ${opts.unsubscribeUrl}`]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}
