import { verifyUnsubscribe } from "@/lib/digest";
import { createAdminClient } from "@/lib/supabase/admin";

// Stops the weekly news email for one account, no login needed: the link is
// signed (src/lib/digest.ts). Called by the button on /unsubscribe and by mail
// apps' one-click "Unsubscribe" (List-Unsubscribe-Post).
export async function POST(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const s = url.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(u) || !verifyUnsubscribe(u, s)) return new Response("invalid link", { status: 400 });

  const { error } = await createAdminClient().from("profiles").update({ digest_opt_out: true }).eq("id", u);
  if (error) return new Response("error", { status: 500 });

  const done = new URL("/unsubscribe", url);
  done.searchParams.set("done", "1");
  const lang = url.searchParams.get("lang");
  if (lang) done.searchParams.set("lang", lang);
  return Response.redirect(done, 303);
}
