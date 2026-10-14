import { careTitle } from "@/lib/care";
import { BCP47, isLocale, translator } from "@/lib/i18n";
import { pushEnabled, sendPush } from "@/lib/push";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Member } from "@/lib/types";

// From the Kids tab: "Guillaume is going" / "Guillaume can't make it", told by
// Hem to the other parent.
export async function POST(req: Request) {
  if (!pushEnabled()) return Response.json({ sent: 0 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { member_id, title, starts_at, all_day, news } = (await req.json()) as {
    member_id: string;
    title: string;
    starts_at: string;
    all_day?: boolean;
    news?: "assigned" | "going" | "cant";
  };

  // RLS: only people in my own family are visible here.
  const { data: members } = await session.supabase.from("members").select("*");
  const to = (members as Member[] | null)?.find((m) => m.id === member_id);
  const from = (members as Member[] | null)?.find((m) => m.profile_id === session.profile.id);
  if (!to?.profile_id || to.profile_id === session.profile.id) return Response.json({ sent: 0 });

  const { data: recipient } = await createAdminClient().from("profiles").select("locale").eq("id", to.profile_id).single();
  const locale = isLocale(recipient?.locale) ? recipient.locale : "en";
  const t = translator(locale);
  const kid = (members as Member[]).find((m) => !m.profile_id && (title === careTitle("dropoff", m) || title === careTitle("pickup", m)));
  const label = kid ? (title === careTitle("dropoff", kid) ? t("{name}'s drop-off", { name: kid.name }) : t("{name}'s pick-up", { name: kid.name })) : title;
  const when = new Date(starts_at).toLocaleString(BCP47[locale], {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(all_day ? {} : { hour: "2-digit", minute: "2-digit" }),
  });

  // Hem says it, like the other notifications between parents (src/lib/partner-notify.ts).
  const v = { name: from?.name ?? session.profile.display_name, what: `${label} (${when})` };
  const sent = await sendPush(to.profile_id, {
    title: "Hem",
    body:
      news === "going" ? t("{name} is going: {what}.", v)
      : news === "cant" ? t("Heads up: {name} can't make it to {what}.", v)
      : t("{name} is counting on you for {what}.", v),
    url: kid ? "/kids/preschool" : "/calendar",
    tag: `${news === "going" || news === "cant" ? "care" : "assign"}-${member_id}-${starts_at}`,
  });
  return Response.json({ sent });
}
