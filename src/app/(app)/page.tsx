"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/family-context";
import { CareSlot } from "@/components/care-slot";
import { EventRow } from "@/components/event-row";
import { HubTile } from "@/components/hub-tile";
import { fetchDueTodos, TodoRow, todoDay } from "@/components/todo-row";
import { SendGift } from "@/components/send-gift";
import { CARE_KINDS, careKind, fetchAvailability, findSlot, isCareDay, slotAvailability } from "@/lib/care";
import { addDays, dayKey, daysUntil, fmtDate, startOfDay } from "@/lib/dates";
import { groupByDay } from "@/lib/events";
import { daysAway, fetchCalendar, fetchOccasions, OCCASION_EMOJI, occasionLabel, upcoming } from "@/lib/occasions";
import { whenLabel } from "@/components/occasions-panel";
import { deadlineText, inDays, upcomingDeadlines, type Deadline } from "@/lib/papers";
import { fmtMoney, settleUp } from "@/lib/expenses";
import { BCP47 } from "@/lib/i18n";
import type { CareAvailability, Expense, EventOccurrence, ListItem, Member, Occasion, Paper, RestockSuggestion } from "@/lib/types";

const TravelsTile = dynamic(() => import("@/components/travels-tile"), {
  ssr: false,
  loading: () => <div className="card col-span-2 min-h-56" />,
});

// Home: the day at a glance, then a door to each part of the family's life.
export default function HomePage() {
  const { supabase, profile, kids, members, me, t } = useFamily();
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [answers, setAnswers] = useState<CareAvailability[]>([]);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [todoCount, setTodoCount] = useState<number | null>(null);
  const [dueTodos, setDueTodos] = useState<ListItem[]>([]);
  const [restock, setRestock] = useState<RestockSuggestion[]>([]);
  // Optional parts show dashed until someone fills them in.
  const [mealCount, setMealCount] = useState<number | null>(null);
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [paperDates, setPaperDates] = useState<Deadline[]>([]);
  const [paperCount, setPaperCount] = useState<number | null>(null);
  const [expenses, setExpenses] = useState<Pick<Expense, "amount" | "currency" | "paid_by" | "split_among" | "shares">[] | null>(null);

  const loadEvents = useCallback(async () => {
    const today = startOfDay(new Date());
    // A week ahead: the kids' card shows the next preschool day, even after a weekend.
    const [evs, said] = await Promise.all([
      fetchCalendar(supabase, members, today, addDays(today, 8), t),
      fetchAvailability(supabase, dayKey(today), dayKey(addDays(today, 8))),
    ]);
    setEvents(evs);
    setAnswers(said);
    setDueTodos(await fetchDueTodos(supabase, dayKey(addDays(today, 1))));
  }, [supabase, members, t]);

  useEffect(() => {
    loadEvents();
    fetchOccasions(supabase).then(setOccasions);
    const channel = supabase
      .channel("today-events")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, loadEvents)
      .on("postgres_changes", { event: "*", schema: "public", table: "care_availability" }, loadEvents)
      .subscribe();
    supabase
      .from("list_items")
      .select("id, lists!inner(kind)", { count: "exact", head: true })
      .eq("done", false)
      .eq("lists.kind", "grocery")
      .then(({ count }) => setOpenCount(count ?? 0));
    supabase
      .from("list_items")
      .select("id, lists!inner(kind)", { count: "exact", head: true })
      .eq("done", false)
      .eq("lists.kind", "todo")
      .then(({ count }) => setTodoCount(count ?? 0));
    supabase.from("meals").select("id", { count: "exact", head: true }).then(({ count }) => setMealCount(count ?? 0));
    supabase.from("notes").select("id", { count: "exact", head: true }).then(({ count }) => setNoteCount(count ?? 0));
    supabase
      .from("restock_suggestions")
      .select("*")
      .order("next_due_on")
      .then(({ data }) => setRestock(((data ?? []) as RestockSuggestion[]).filter((r) => daysUntil(r.next_due_on) <= 3)));
    supabase
      .from("expenses")
      .select("amount, currency, paid_by, split_among, shares")
      .then(({ data }) => setExpenses(data ?? []));
    supabase
      .from("papers")
      .select("*")
      .eq("ended", false)
      .then(({ data }) => {
        setPaperCount(data?.length ?? 0);
        setPaperDates(upcomingDeadlines((data ?? []) as Paper[], 30));
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadEvents]);

  const todayKey = dayKey(new Date());
  const tomorrowKey = dayKey(addDays(new Date(), 1));
  const byDay = groupByDay(events);
  // Kids' drop-offs and pick-ups are in the card at the top, not repeated below.
  const isKidCare = (e: EventOccurrence) => careKind(e) !== null && kids.some((k) => k.id === e.for_member_id);
  const today = (byDay.get(todayKey) ?? []).filter((e) => !isKidCare(e));
  const tomorrow = (byDay.get(tomorrowKey) ?? []).filter((e) => !isKidCare(e));
  // To-dos due today (and late ones) or tomorrow sit with the day's events.
  const todosOn = (k: string) => dueTodos.filter((i) => todoDay(i) === k);
  const todayTodos = todosOn(todayKey);
  const tomorrowTodos = todosOn(tomorrowKey);
  const onTodo = (x: ListItem, done: boolean) => (done ? setDueTodos((xs) => xs.filter((y) => y.id !== x.id)) : loadEvents());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Good morning") : hour < 18 ? t("Hi") : t("Good evening");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm capitalize text-muted">{fmtDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="h1">{greeting}, {profile.display_name || t("there")}</h1>
      </div>

      <SendGift />

      {kids.map((kid) => (
        <KidCard key={kid.id} kid={kid} events={events} answers={answers} onChanged={loadEvents} />
      ))}

      {/* What's coming in the next day or so. Kids' care is in their card above. */}
      <section>
        <h2 className="h2">{t("Coming up")}</h2>
        {today.length + tomorrow.length + todayTodos.length + tomorrowTodos.length === 0 && (
          <p className="py-2 text-sm text-muted">{t("Nothing else planned.")}</p>
        )}
        {todayTodos.length > 0 && <ul className="mt-1">{todayTodos.map((i) => <TodoRow key={i.id} item={i} onDone={onTodo} />)}</ul>}
        {today.length > 0 && <div className="divide-y divide-border">{today.map((e) => <EventRow key={e.key} ev={e} day={todayKey} />)}</div>}
        {tomorrow.length + tomorrowTodos.length > 0 && (
          <>
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("Tomorrow")}</h3>
            {tomorrowTodos.length > 0 && <ul>{tomorrowTodos.map((i) => <TodoRow key={i.id} item={i} onDone={onTodo} />)}</ul>}
            <div className="divide-y divide-border">{tomorrow.map((e) => <EventRow key={e.key} ev={e} day={tomorrowKey} />)}</div>
          </>
        )}
      </section>

      <SoonCard occasions={occasions} meId={me?.id} />
      <PapersCard dates={paperDates} />

      {/* Home is also where everything the family shares lives; Me is only mine. */}
      <h2 className="h2 -mb-2">{t("Family")}</h2>
      <nav className="grid grid-cols-2 gap-3">
        <HubTile
          href="/todo"
          module="todo"
          title={t("To-do")}
          sub={todoCount === null ? "…" : todoCount === 0 ? t("Nothing left to do") : todoCount === 1 ? t("1 thing to do") : t("{n} things to do", { n: todoCount })}
        />
        <HubTile
          href="/lists"
          module="shopping"
          title={t("Shopping")}
          sub={
            (openCount === null ? "…" : openCount === 1 ? t("1 item to buy") : t("{n} items to buy", { n: openCount })) +
            (restock.length > 0 ? ` · ${t("probably running out: {items}", { items: restock.map((r) => r.item_name).join(", ") })}` : "")
          }
        />
        <HubTile
          href="/meals"
          module="meals"
          title={t("Meals")}
          empty={mealCount === 0}
          sub={mealCount === 0 ? t("Log what you eat, Hem balances the week") : t("What we ate")}
        />
        <HubTile
          href={noteCount === 0 && occasions.length > 0 ? "/brain?tab=dates" : "/brain"}
          module="brain"
          title={t("Family brain")}
          empty={noteCount === 0 && occasions.length === 0}
          sub={
            noteCount === null
              ? "…"
              : noteCount === 0 && occasions.length === 0
                ? t("Birthdays, weddings, preschool address: what Hem should know")
                : [occasions.length === 1 ? t("1 date") : t("{n} dates", { n: occasions.length }), noteCount === 1 ? t("1 note") : t("{n} notes", { n: noteCount })].join(" · ")
          }
        />
        <ExpensesTile expenses={expenses} />
        <HubTile
          href="/papers"
          module="papers"
          title={t("Papers")}
          empty={paperCount === 0}
          sub={paperCount === 0 ? t("Contracts, insurance, warranties: Hem reminds you before they end") : t("Contracts, insurance, receipts, IDs")}
        />
        <TravelsTile />
      </nav>
    </div>
  );
}

// "Charlie · today: drop-off Guillaume 08:00, pick-up ? 16:00", then the
// next preschool day (tomorrow, or Monday after a weekend).
function KidCard({ kid, events, answers, onChanged }: { kid: Member; events: EventOccurrence[]; answers: CareAvailability[]; onChanged: () => void }) {
  const { t } = useFamily();
  const hasCare = (d: Date) => isCareDay(kid, d) || CARE_KINDS.some((kind) => findSlot(events, kid, dayKey(d), kind));
  const next = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1)).find(hasCare);
  const days = [
    { label: t("Today"), date: new Date() },
    ...(next
      ? [{ label: dayKey(next) === dayKey(addDays(new Date(), 1)) ? t("Tomorrow") : fmtDate(next, { weekday: "long" }), date: next }]
      : []),
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: `linear-gradient(140deg, color-mix(in srgb, ${kid.color} 18%, var(--surface)) 0%, var(--surface) 65%)`, boxShadow: "var(--lift)" }}>
      <div className="flex items-baseline justify-between">
        <h2 className="h2">{kid.emoji} {kid.name}</h2>
        <Link href="/kids/preschool" className="text-sm font-medium text-accent">{t("Plan the week")} →</Link>
      </div>
      {days.map(({ label, date }) => {
        const k = dayKey(date);
        const planned = CARE_KINDS.map((kind) => findSlot(events, kid, k, kind));
        if (!isCareDay(kid, date) && !planned.some(Boolean)) {
          return (
            <p key={k} className="text-sm">
              <span className="font-medium">{label}</span> <span className="text-muted">· {t("No preschool")}</span>
            </p>
          );
        }
        return (
          <div key={k} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium capitalize">
              {label}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {CARE_KINDS.map((kind, i) => (
                <CareSlot key={kind} kid={kid} day={k} kind={kind} event={planned[i]} availability={slotAvailability(answers, kid, k, kind)} onChanged={onChanged} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// Friends' weddings and birthdays in the coming week (only those that concern me).
function SoonCard({ occasions, meId }: { occasions: Occasion[]; meId?: string }) {
  const { t } = useFamily();
  const soon = upcoming(occasions, 7).filter(({ o }) => !o.ours && (!o.member_ids.length || !meId || o.member_ids.includes(meId)));
  if (!soon.length) return null;
  return (
    <Link href="/brain?tab=dates" className="card flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("Soon")}</h2>
        <span className="text-muted">→</span>
      </div>
      {soon.map(({ o, day, years }) => (
        <p key={o.id} className="text-sm">
          {OCCASION_EMOJI[o.kind]} <span className="font-medium">{o.title}</span>{" "}
          <span className="text-muted">· {occasionLabel(t, o.kind, years)} · {whenLabel(t, daysAway(day), day)}</span>
        </p>
      ))}
    </Link>
  );
}

// Papers with a deadline in the next 30 days (last day to cancel, an ID
// expiring). My private ones are not named here: someone may be looking.
function PapersCard({ dates }: { dates: Deadline[] }) {
  const { t } = useFamily();
  if (!dates.length) return null;
  return (
    <Link href="/papers" className="card flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("Papers")}</h2>
        <span className="text-muted">→</span>
      </div>
      {dates.map((d) => (
        <p key={`${d.paper.id}-${d.kind}`} className="text-sm">
          <span className="font-medium">{deadlineText(t, d, d.paper.profile_id ? t("A private paper") : d.paper.title)}</span>{" "}
          <span className="text-muted">· {inDays(t, d.days)}</span>
        </p>
      ))}
    </Link>
  );
}

// "Jenny owes you 245 kr", or all square. Dashed until the first expense.
function ExpensesTile({ expenses }: { expenses: Pick<Expense, "amount" | "currency" | "paid_by" | "split_among" | "shares">[] | null }) {
  const { me, memberById, locale, t } = useFamily();
  if (expenses === null) return <HubTile href="/expenses" module="expenses" title={t("Expenses")} sub="…" />;
  if (expenses.length === 0) return <HubTile href="/expenses" module="expenses" title={t("Expenses")} sub={t("One pays, the app splits")} empty />;
  const name = (id: string) => memberById(id)?.name ?? "?";
  const x = settleUp(expenses)[0];
  const money = x ? fmtMoney(x.amount, x.currency, BCP47[locale]) : "";
  const sub = !x
    ? t("All square")
    : x.from === me?.id
      ? t("You owe {to} {amount}", { to: name(x.to), amount: money })
      : x.to === me?.id
        ? t("{from} owes you {amount}", { from: name(x.from), amount: money })
        : t("{from} owes {to} {amount}", { from: name(x.from), to: name(x.to), amount: money });
  return <HubTile href="/expenses" module="expenses" title={t("Expenses")} sub={sub} />;
}
