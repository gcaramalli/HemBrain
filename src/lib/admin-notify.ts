import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, translator } from "./i18n";
import { sendPush } from "@/lib/push";

// Tells Hembrain's super admins (and nobody else) that a new account has
// signed in for the first time. Rows are 'signups' rows of `activity`
// (supabase/migrations/0033_admin_signup_alert_weekly_report.sql), claimed by
// sendDueNotifications; row_id = the new account's id.
export async function sendSignupAlerts(db: SupabaseClient, userIds: string[]) {
  if (!userIds.length) return 0;
  const [{ data: admins }, { data: profiles }] = await Promise.all([
    db.from("super_admins").select("user_id"),
    db.from("profiles").select("id, display_name, email, created_at, families(name, created_at)").in("id", userIds),
  ]);
  const adminIds = (admins ?? []).map((a) => a.user_id as string);
  if (!adminIds.length) return 0;
  const { data: adminProfiles } = await db.from("profiles").select("id, locale").in("id", adminIds);
  const locales = new Map((adminProfiles ?? []).map((p) => [p.id as string, isLocale(p.locale) ? p.locale : "en"]));

  let sent = 0;
  for (const p of profiles ?? []) {
    const family = (Array.isArray(p.families) ? p.families[0] : p.families) as { name: string; created_at: string } | null;
    // A family created with the account = a new family; otherwise they were invited.
    const joined = family && new Date(family.created_at).getTime() < new Date(p.created_at).getTime() - 60000;
    const who = [p.display_name, p.email && `(${p.email})`].filter(Boolean).join(" ") || "?";
    for (const admin of adminIds) {
      const t = translator(locales.get(admin) ?? "en");
      sent += await sendPush(admin, {
        title: "Hem",
        body: joined
          ? t("New account: {who} just joined the family {family}.", { who, family: family?.name ?? "?" })
          : t("New account: {who} just started a family, {family}.", { who, family: family?.name ?? "?" }),
        url: "/stats",
        tag: `signup-${p.id}`,
      }).catch((e) => {
        console.error("signup alert", e);
        return 0;
      });
    }
  }
  return sent;
}
