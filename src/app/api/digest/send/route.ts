import { digestEmail, type Digest } from "@/lib/digest-format";
import { appUrl, digestEnabled, oneClickUrl, sendBatch, unsubscribeUrl, type Outgoing } from "@/lib/digest";
import { isLocale } from "@/lib/i18n";
import { getSession } from "@/lib/session";

type Recipient = { profile_id: string; email: string; display_name: string; locale: string; inactive: boolean };

// Hembrain admin → News: send a draft to myself ("test") or to every account
// that hasn't opted out. Super admins only; everything goes through their
// session, so RLS (0027) is the check as well.
export async function POST(req: Request) {
  if (!digestEnabled()) return Response.json({ error: "RESEND_API_KEY is not set" }, { status: 501 });
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, user, profile } = session;
  const { data: admin } = await supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });

  const { id, test } = (await req.json()) as { id?: string; test?: boolean };
  const { data: digest } = await supabase.from("digests").select("*").eq("id", id ?? "").maybeSingle<Digest>();
  if (!digest) return Response.json({ error: "not found" }, { status: 404 });

  const build = (r: Recipient): Outgoing => {
    const locale = isLocale(r.locale) ? r.locale : "en";
    const page = unsubscribeUrl(r.profile_id, locale);
    return { to: r.email, oneClick: oneClickUrl(r.profile_id), ...digestEmail(digest, locale, { inactive: r.inactive, appUrl: appUrl(), unsubscribeUrl: page }) };
  };

  if (test) {
    // In my language, with the nudge so it can be checked too.
    const email = user.email ?? profile.email;
    if (!email) return Response.json({ error: "no email on this account" }, { status: 400 });
    const result = await sendBatch([build({ profile_id: user.id, email, display_name: profile.display_name, locale: profile.locale, inactive: true })]);
    return Response.json(result, { status: result.error ? 502 : 200 });
  }

  // Claim the draft first so a double tap can't send it twice.
  const { data: claimed } = await supabase.from("digests").update({ status: "sending" }).eq("id", digest.id).eq("status", "draft").select("id");
  if (!claimed?.length) return Response.json({ error: "already sent or skipped" }, { status: 409 });

  const { data: recipients, error } = await supabase.rpc("digest_recipients");
  if (error) {
    await supabase.from("digests").update({ status: "draft" }).eq("id", digest.id);
    return Response.json({ error: error.message }, { status: 500 });
  }
  const result = await sendBatch(((recipients ?? []) as Recipient[]).map(build));
  // Nothing went out: back to draft to try again. Some did: keep it sent so
  // nobody gets it twice, and show the error.
  await supabase
    .from("digests")
    .update(result.sent ? { status: "sent", sent_at: new Date().toISOString(), sent_count: result.sent } : { status: "draft" })
    .eq("id", digest.id);
  return Response.json(result, { status: result.error ? 502 : 200 });
}
