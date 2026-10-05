"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MODULES } from "@/lib/modules";
import { useFamily } from "./family-context";
import { GiftInbox } from "./gift-inbox";
import { PullToRefresh } from "./pull-to-refresh";
import { ToastProvider } from "./toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, family, kids, me, t } = useFamily();
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((g) => g + 1), []);
  // Service worker: needed for reminders (push notifications).
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  // Five tabs, one job each. Sub-pages light up the tab they belong to.
  // Home holds what the family shares (brain, expenses, papers, travels); Me what is mine.
  const HOME = ["/brain", "/expenses", "/papers", "/travels"];
  const KITCHEN = ["/lists", "/meals", "/recipes", "/purchases"];
  // The Me tab is my own space; settings hang off the avatar, top right.
  const ME = ["/me", "/work"];
  const SETTINGS = ["/settings", "/profile", "/connections", "/admin", "/feedback", "/stats"];
  const inSettings = SETTINGS.some((p) => pathname.startsWith(p));
  const under = (paths: string[]) => paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isActive = (href: string) =>
    href === "/me"
      ? under(ME)
      : href === "/"
        ? pathname === "/" || (under(HOME) && !under(ME))
        : href === "/calendar"
          ? under(["/calendar", "/todo"])
          : href === "/lists"
            ? under(KITCHEN)
            : under([href]);

  // The Kids tab only shows up for families with a child, in the middle.
  const tabs = [
    { href: "/", label: t("Home"), Icon: MODULES.today.Icon, color: MODULES.today.color },
    { href: "/calendar", label: t("Calendar"), Icon: MODULES.calendar.Icon, color: MODULES.calendar.color },
    ...(kids.length
      ? [
          {
            href: "/kids",
            label: kids.length === 1 ? kids[0].name : t("Kids"),
            // The kid's tab wears the kid's own colour.
            color: kids.length === 1 ? kids[0].color : MODULES.kids.color,
            Icon: MODULES.kids.Icon,
          },
        ]
      : []),
    { href: "/lists", label: t("Kitchen"), Icon: MODULES.kitchen.Icon, color: MODULES.kitchen.color },
    { href: "/me", label: t("Me"), Icon: MODULES.me.Icon, color: MODULES.me.color },
  ];

  return (
    <ToastProvider>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between bg-background/85 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
          <Link href="/" className="text-sm font-medium tracking-tight text-muted">{family.name}</Link>
          <Link
            href="/settings"
            aria-label={t("Settings")}
            aria-current={inSettings ? "page" : undefined}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white ${inSettings ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
            style={{ background: me?.color ?? profile.color }}
          >
            {(profile.display_name || "?").slice(0, 1).toUpperCase()}
          </Link>
        </header>

        <PullToRefresh onRefresh={refresh} />
        {/* A new key mounts the page again: every screen reloads its data. */}
        <main key={generation} className="flex-1 px-4 pb-32 pt-2">{children}</main>

        <GiftInbox />

        {/* Floating, rounded tab bar with coloured duotone icons. The page fades
            out into the background under it, so nothing peeks through the gap. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[calc(6rem+env(safe-area-inset-bottom))]"
          style={{ background: "linear-gradient(to top, var(--background) 55%, transparent)" }}
        />
        <nav className="fixed inset-x-0 bottom-0 z-10 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <ul
            className="mx-auto grid max-w-xl rounded-[26px] bg-surface/90 px-1 backdrop-blur-xl"
            style={{ boxShadow: "0 10px 30px -12px rgba(20,24,34,.35), 0 1px 2px rgba(20,24,34,.08)", border: "1px solid var(--edge)", gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((tab) => {
              const active = isActive(tab.href);
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex flex-col items-center gap-0.5 py-1.5 text-[10.5px] ${active ? "font-semibold text-foreground" : "text-muted"}`}
                  >
                    <span
                      className="flex h-8 w-14 items-center justify-center rounded-full transition-colors"
                      style={{ color: tab.color, background: active ? `color-mix(in srgb, ${tab.color} 20%, transparent)` : undefined }}
                    >
                      <tab.Icon size={21} strokeWidth={2.25} fill="currentColor" fillOpacity={active ? 0.3 : 0.18} />
                    </span>
                    <span className="max-w-full truncate px-0.5">{tab.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </ToastProvider>
  );
}
