// Sends what the other parent should hear about (src/lib/partner-notify.ts).
// Called every minute by pg_cron while a change is due (migration 0029), with
// the secret it keeps in Supabase Vault.
//
// Date maths uses the process time zone, so pin it to the family's.
process.env.TZ = "Europe/Stockholm";

import { sendDueNotifications } from "@/lib/partner-notify";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const db = createAdminClient();
  const { data: ok } = given.length >= 32 ? await db.rpc("notify_secret_ok", { given }) : { data: false };
  if (!ok) return new Response("unauthorized", { status: 401 });
  // Without push keys the queue is still emptied (sendPush sends nothing),
  // or pg_cron would keep calling every minute.
  return Response.json(await sendDueNotifications(db));
}
