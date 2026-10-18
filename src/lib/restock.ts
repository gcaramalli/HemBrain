// How often we buy each thing, worked out from `purchases` in the app (the
// pantry). Sturdier than the `restock_suggestions` view: purchases on the same
// day count once (a list item and a receipt line for the same milk), the
// interval is the median gap (one forgotten or doubled purchase doesn't skew
// it), and things bought only once show as "still learning".
export type Stock = {
  key: string;
  name: string;
  times: number; // days it was bought on
  interval: number | null; // median days between purchases; null = bought once
  last: Date;
  next: Date | null;
  left: number | null; // 1 = just bought … 0 = due; null = still learning
  confidence: "learning" | "low" | "good"; // 1 purchase, 2–3, 4+
};

const DAY = 86_400_000;

export function stockOf(purchases: { item_name: string; purchased_at: string }[], now = new Date()): Stock[] {
  const groups = new Map<string, { name: string; days: Set<string> }>();
  for (const p of purchases) {
    const key = p.item_name.trim().toLowerCase();
    if (!key) continue;
    const g = groups.get(key) ?? { name: p.item_name.trim(), days: new Set<string>() };
    g.days.add(p.purchased_at.slice(0, 10));
    groups.set(key, g);
  }
  const out: Stock[] = [];
  for (const [key, g] of groups) {
    const days = [...g.days].sort().map((d) => new Date(`${d}T12:00:00`));
    const gaps = days
      .slice(1)
      .map((d, i) => Math.round((d.getTime() - days[i].getTime()) / DAY))
      .filter((x) => x >= 1)
      .sort((a, b) => a - b);
    const mid = gaps.length >> 1;
    const interval = gaps.length ? (gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2) : null;
    const last = days[days.length - 1];
    const next = interval ? new Date(last.getTime() + interval * DAY) : null;
    const left = interval ? Math.max(0, Math.min(1, 1 - (now.getTime() - last.getTime()) / (interval * DAY))) : null;
    out.push({ key, name: g.name, times: days.length, interval, last, next, left, confidence: days.length === 1 ? "learning" : days.length < 4 ? "low" : "good" });
  }
  // Soonest due first, then what we're still learning (most recent first).
  return out.sort((a, b) => (a.next && b.next ? a.next.getTime() - b.next.getTime() : a.next ? -1 : b.next ? 1 : b.last.getTime() - a.last.getTime()));
}
