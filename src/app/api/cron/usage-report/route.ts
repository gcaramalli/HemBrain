// Sunday morning usage email to Hembrain's super admins, run by Vercel Cron
// (vercel.json). Numbers come from hembrain_weekly_report() (0033).
import { digestEnabled } from "@/lib/digest";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReport, sendReportEmail, type WeeklyReport } from "@/lib/usage-report";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!digestEnabled()) return Response.json({ skipped: "RESEND_API_KEY not set" });

  const db = createAdminClient();
  const { data, error } = await db.rpc("hembrain_weekly_report");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const report = data as WeeklyReport;

  let sent = 0;
  const errors: string[] = [];
  for (const r of report.recipients) {
    try {
      await sendReportEmail(r.email, buildReport(report, r.locale));
      sent++;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return Response.json({ sent, errors }, { status: errors.length && !sent ? 502 : 200 });
}
