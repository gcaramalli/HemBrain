import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Sending the weekly news email (0027) through Resend. The sending domain is
// verified in Resend; the From address is kept apart from the sign-in emails
// (noreply@) so a spam complaint on the news never hurts password resets.
export const digestEnabled = () => !!process.env.RESEND_API_KEY;

const FROM = () => process.env.DIGEST_FROM || "Hembrain <news@hembrain.com>";
const REPLY_TO = () => process.env.DIGEST_REPLY_TO || "hello@hembrain.com";
// Links in the email open the app where people installed it.
export const appUrl = () => process.env.APP_URL || "https://hembrain.vercel.app";

// Unsubscribe links carry an HMAC of the account id: no login needed, and
// nobody can unsubscribe someone else by guessing.
function secret() {
  const s = process.env.DIGEST_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("DIGEST_SECRET or CRON_SECRET must be set");
  return s;
}
const sign = (profileId: string) => createHmac("sha256", secret()).update(`unsubscribe:${profileId}`).digest("base64url");

export function verifyUnsubscribe(profileId: string, sig: string) {
  const a = Buffer.from(sign(profileId));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The link in the email opens a page with a button (link scanners must not
// unsubscribe anyone); mail apps' own "Unsubscribe" posts straight to the API.
export const unsubscribeUrl = (profileId: string, locale: string) => `${appUrl()}/unsubscribe?u=${profileId}&s=${sign(profileId)}&lang=${locale}`;
export const oneClickUrl = (profileId: string) => `${appUrl()}/api/digest/unsubscribe?u=${profileId}&s=${sign(profileId)}`;

export type Outgoing = { to: string; subject: string; html: string; text: string; oneClick: string };

// Resend's batch endpoint takes up to 100 emails per call. Returns how many
// were accepted; stops at the first failed batch.
export async function sendBatch(emails: Outgoing[]): Promise<{ sent: number; error?: string }> {
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        chunk.map((e) => ({
          from: FROM(),
          to: [e.to],
          reply_to: REPLY_TO(),
          subject: e.subject,
          html: e.html,
          text: e.text,
          headers: {
            "List-Unsubscribe": `<${e.oneClick}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        })),
      ),
    });
    if (!res.ok) return { sent, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
    sent += chunk.length;
  }
  return { sent };
}
