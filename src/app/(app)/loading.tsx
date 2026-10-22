"use client";

import { useFamily } from "@/components/family-context";
import { ThinkingDots } from "@/components/thinking-dots";

// Shown the moment a tab is tapped, while the next screen arrives. It also lets
// Next prefetch these dynamic routes up to here, so tabs open without waiting
// on the server. The dots fade in late: a quick screen never flashes them.
export default function Loading() {
  const { t } = useFamily();
  return (
    <div className="page-wait flex min-h-[50vh] items-center justify-center">
      <ThinkingDots size={12} label={t("Loading…")} />
    </div>
  );
}
