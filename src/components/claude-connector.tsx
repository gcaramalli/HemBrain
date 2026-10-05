"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmButton } from "./confirm-button";
import { useFamily } from "./family-context";
import { useToast } from "./toast";
import { fmtDateTime } from "@/lib/dates";

type Token = { id: string; label: string; created_at: string; last_used_at: string | null };

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

type App = "Claude" | "ChatGPT";

// Personal connector links for Claude or ChatGPT (same MCP endpoint, only the
// setup steps differ). The secret is shown once; only its hash is stored.
export function ClaudeConnector() {
  const { supabase, profile, t } = useFamily();
  const toast = useToast();
  const [label, setLabel] = useState("Claude");
  const [naming, setNaming] = useState<App | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shownFor, setShownFor] = useState<App>("Claude");
  const steps: Record<App, string> = {
    Claude: t("In Claude: Settings → Connectors → Add custom connector → name it Hem, paste your link → Authentication: none."),
    ChatGPT: t("In ChatGPT (web, paid plan): Settings → Apps & Connectors → Advanced → turn on Developer mode, then Create → name it Hem, paste your link → Authentication: none. It then works on your phone too."),
  };
  const app = naming ?? shownFor;

  const load = useCallback(async () => {
    const { data } = await supabase.from("connector_tokens").select("id, label, created_at, last_used_at").order("created_at");
    setTokens((data ?? []) as Token[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("connector_tokens").insert({ profile_id: profile.id, token_hash: await sha256Hex(token), label: label.trim() || naming || "Claude" });
    if (error) return toast(error.message);
    setShownFor(naming ?? "Claude");
    setNaming(null);
    setNewUrl(`${window.location.origin}/api/mcp/${token}`);
    setCopied(false);
    load();
  }

  async function revoke(token: Token) {
    await supabase.from("connector_tokens").delete().eq("id", token.id);
    load();
  }

  async function copy() {
    if (!newUrl) return;
    try {
      await navigator.clipboard.writeText(newUrl);
      setCopied(true);
    } catch {
      setCopyFailed(true); // the link stays on screen as selectable text
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="h2">{t("Connect Claude or ChatGPT")}</h2>
      <p className="text-sm text-muted">
        {t("Lets Hem read and add to the calendar, lists, recipes and notes from your AI app, as you. Then just talk to Hem.")} {(naming || newUrl) && steps[app]}
      </p>

      {newUrl && (
        <div className="rounded-xl border border-foreground bg-accent-soft p-3 text-sm">
          <p className="font-medium">{t("Your link, shown only once:")}</p>
          <p className="mt-1 select-all break-all font-mono text-xs">{newUrl}</p>
          <button className="btn mt-2 w-full" onClick={copy}>{copied ? `✓ ${t("Copied")}` : t("Copy link")}</button>
          {copyFailed && <p className="mt-1 text-xs">{t("Copying isn't allowed here: press and hold the link to select it.")}</p>}
          <p className="mt-2 text-xs text-muted">{t("It works like a password: paste it only into {app}'s connector settings, never in a chat or screenshot.", { app: shownFor })}</p>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between py-2">
              <span>
                {token.label}
                <span className="block text-xs text-muted">
                  {token.last_used_at ? t("last used {when}", { when: fmtDateTime(token.last_used_at) }) : t("never used")}
                </span>
              </span>
              <ConfirmButton className="min-h-9" armed={t("{app} loses access. Revoke?", { app: token.label })} onConfirm={() => revoke(token)}>{t("Revoke")}</ConfirmButton>
            </li>
          ))}
        </ul>
      )}

      {naming ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("Name, e.g. {app} on my phone", { app })} autoFocus />
          <button className="btn shrink-0">{t("Create")}</button>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(["Claude", "ChatGPT"] as const).map((a) => (
            <button
              key={a}
              className="btn-ghost"
              onClick={() => {
                setNaming(a);
                setLabel(a);
              }}
            >
              + {t("{app} link", { app: a })}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
