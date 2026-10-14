import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

// Web push needs a VAPID key pair (generate once: `npx web-push generate-vapid-keys`).
export const pushEnabled = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;

// web-push wants a URL: a bare email ("someone@example.com") becomes mailto:,
// otherwise every send throws before reaching a single device.
function vapidSubject(raw: string | undefined) {
  const s = raw?.trim();
  if (!s) return "mailto:admin@example.com";
  return /^(mailto:|https?:\/\/)/i.test(s) ? s : s.includes("@") ? `mailto:${s}` : `https://${s}`;
}

// Sends to every device of `profileId`; forgets devices that unsubscribed.
export async function sendPush(profileId: string, message: PushMessage) {
  if (!pushEnabled()) return 0;
  if (!configured) {
    webpush.setVapidDetails(
      vapidSubject(process.env.VAPID_SUBJECT),
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  const db = createAdminClient();
  const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("profile_id", profileId);
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 12 * 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }),
  );
  return sent;
}
