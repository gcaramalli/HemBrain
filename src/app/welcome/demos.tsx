import { Baby, CalendarDays, Camera, CookingPot, UserRound } from "lucide-react";
import { ThinkingDots } from "@/components/thinking-dots";
import { ChatPlayer, Step } from "./chat-player";
import world from "@/lib/world-map.json";
import { BCP47, type Locale, type T } from "@/lib/i18n";
import { MODULES } from "@/lib/modules";

// Static pictures of the app for the public landing page, drawn with the
// app's own tokens so they follow light / dark mode. A made-up family:
// two parents (Alex, Sam) and a toddler (Leo). Nothing here reads data.

export const ALEX = { name: "Alex", color: "#5b8def" };
export const SAM = { name: "Sam", color: "#e07ab4" };
export const LEO = { name: "Leo", color: "#f5904a" };

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

function Who({ p }: { p: { name: string; color: string } }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Dot color={p.color} size={7} />
      {p.name}
    </span>
  );
}

// The Today screen on a phone.
export function Phone({ t }: { t: T }) {
  const rows = [
    { time: "08:00", title: t("Drop-off Leo"), p: ALEX },
    { time: "14:30", title: t("Dentist"), p: SAM },
    { time: "16:00", title: t("Pick-up Leo"), p: SAM },
  ];
  const tabs = [
    { Icon: MODULES.today.Icon, color: MODULES.today.color, on: true },
    { Icon: CalendarDays, color: MODULES.calendar.color },
    { Icon: Baby, color: MODULES.kids.color },
    { Icon: CookingPot, color: MODULES.kitchen.color },
    { Icon: UserRound, color: MODULES.me.color },
  ];
  return (
    <div className="landing-phone relative mx-auto w-[300px] shrink-0 rounded-[48px] bg-[#0d1117] p-[9px] sm:w-[320px]">
      <div className="relative flex h-[600px] flex-col gap-3 overflow-hidden rounded-[40px] bg-background px-4 pt-11 sm:h-[640px]">
        <div aria-hidden className="absolute top-3 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-[#0d1117]" />
        <div>
          <p className="eyebrow">{t("Thursday")}</p>
          <p className="text-[1.6rem] leading-tight font-bold tracking-tight">{t("Good afternoon, Sam")}</p>
        </div>
        <div className="card flex items-center gap-3 p-3">
          <span className="landing-wiggle text-2xl">🎁</span>
          <p className="text-sm leading-snug"><b>{t("A little something from")} Alex</b><br /><span className="text-muted">{t("Tap to unwrap")}</span></p>
        </div>
        <div className="card flex flex-col gap-2.5 p-3">
          <p className="text-sm font-bold">{t("Today")}</p>
          {rows.map((r) => (
            <div key={r.time} className="flex items-center gap-3">
              <span className="w-10 text-xs text-muted tabular-nums">{r.time}</span>
              <span className="h-8 w-1 rounded-full" style={{ background: r.p.color }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <Who p={r.p} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3">
            <p className="text-xs text-muted">{t("Leo slept")}</p>
            <p className="text-lg font-bold">11 h 20</p>
            <SleepBars small />
          </div>
          <div className="card p-3">
            <p className="text-xs text-muted">{t("Running out soon")}</p>
            <p className="mt-1 text-sm font-medium">🥛 {t("Milk")}</p>
            <p className="text-sm font-medium">🍌 {t("Bananas")}</p>
          </div>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex justify-around rounded-full bg-surface py-2.5" style={{ boxShadow: "var(--lift)" }}>
          {tabs.map(({ Icon, color, on }, i) => (
            <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color, background: on ? `color-mix(in srgb, ${color} 16%, transparent)` : undefined }}>
              <Icon size={20} strokeWidth={2.25} fill="currentColor" fillOpacity={0.22} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// A conversation with Hem (in Claude or ChatGPT), the connector doing the
// filing. Played message by message, Hem's dots before each answer.
export function Chat({ t }: { t: T }) {
  return (
    <ChatPlayer className="card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#111722]">
          <ThinkingDots size={4} still />
        </span>
        Hem
        <span className="chip ml-auto">Claude · ChatGPT</span>
      </div>

      <Step n={0}><Bubble>{t("Sam picks up Leo on Thursday at 4")}</Bubble></Step>
      <Step n={1} typing>
        <Filed>
          <span className="h-8 w-1 rounded-full" style={{ background: SAM.color }} />
          <div>
            <p className="text-sm font-medium">{t("Pick-up Leo")} · {t("Thu")} 16:00</p>
            <Who p={SAM} />
          </div>
          <span className="ml-auto text-xs text-muted">{t("Added to the calendar")}</span>
        </Filed>
      </Step>

      <Step n={2}>
        <Bubble>
          <span className="inline-flex items-center gap-2"><Camera size={16} /> receipt.jpg</span>
        </Bubble>
      </Step>
      <Step n={3} typing>
        <Filed>
          <span className="text-xl">🧾</span>
          <p className="text-sm"><b>{t("14 items logged")}</b> · ICA · 486 kr</p>
        </Filed>
      </Step>

      <Step n={4}><Bubble>{t("What should we cook tonight?")}</Bubble></Step>
      <Step n={5} typing>
        <p className="landing-reveal max-w-[85%] text-sm leading-relaxed">
          {t("No fish yet this week: how about salmon with dill potatoes? You bought dill on Monday, and Leo loved it last time.")}
        </p>
      </Step>
    </ChatPlayer>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <p className="landing-reveal ml-auto max-w-[85%] rounded-[20px] rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background">{children}</p>;
}

function Filed({ children }: { children: React.ReactNode }) {
  return <div className="landing-reveal flex items-center gap-3 rounded-2xl bg-accent-soft p-3">{children}</div>;
}

// A week strip: everyone who has something that day.
export function WeekStrip({ locale }: { locale: Locale }) {
  const fmt = new Intl.DateTimeFormat(BCP47[locale], { weekday: "narrow" });
  const busy = [[ALEX, LEO], [SAM], [ALEX, SAM, LEO], [SAM, LEO], [ALEX], [ALEX, SAM, LEO], [SAM]];
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {busy.map((ps, i) => {
        const day = new Date(Date.UTC(2026, 9, 5 + i));
        return (
          <div key={i} className={`flex flex-col items-center gap-1.5 rounded-2xl py-2 ${i === 3 ? "bg-foreground text-background" : "bg-accent-soft"}`}>
            <span className="text-[0.65rem] font-semibold uppercase opacity-70">{fmt.format(day)}</span>
            <span className="text-sm font-bold">{5 + i}</span>
            <span className="flex gap-0.5">{ps.map((p) => <Dot key={p.name} color={p.color} size={5} />)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Nights (tall) and naps (short) over a week.
export function SleepBars({ small }: { small?: boolean }) {
  const nights = [10.5, 11, 9.8, 11.3, 10.9, 11.6, 11.3];
  const naps = [1.5, 1.2, 2, 1.4, 1.1, 1.8, 1.5];
  const h = small ? 28 : 84;
  return (
    <div className={`mt-2 flex items-end ${small ? "gap-1" : "gap-2.5"}`} style={{ height: h }} aria-hidden>
      {nights.map((n, i) => (
        <div key={i} className="flex flex-1 flex-col justify-end gap-0.5">
          <span className="landing-grow rounded-[4px]" style={{ height: (naps[i] / 14) * h, background: MODULES.sleep.color, opacity: 0.45, animationDelay: `${i * 60}ms` }} />
          <span className="landing-grow rounded-[4px]" style={{ height: (n / 14) * h, background: MODULES.sleep.color, animationDelay: `${i * 60}ms` }} />
        </div>
      ))}
    </div>
  );
}

// Countries each of us has been to; ink where both went.
const VISITS: Record<string, string[]> = {
  SE: [ALEX.color, SAM.color], FR: [ALEX.color, SAM.color], NO: [ALEX.color, SAM.color], DK: [SAM.color], DE: [ALEX.color],
  ES: [ALEX.color, SAM.color], PT: [SAM.color], IT: [ALEX.color, SAM.color], GR: [SAM.color], GB: [ALEX.color], IS: [ALEX.color, SAM.color],
  HR: [SAM.color], MA: [ALEX.color], US: [ALEX.color, SAM.color], CA: [SAM.color], MX: [ALEX.color], JP: [ALEX.color, SAM.color],
  TH: [SAM.color], VN: [ALEX.color], AU: [ALEX.color],
};

export function DemoMap() {
  const shapes = world.shapes as Record<string, string>;
  const fill = (code: string) => {
    const c = VISITS[code];
    if (!c) return "var(--map-land)";
    return c.length > 1 ? "var(--foreground)" : c[0];
  };
  return (
    <svg viewBox={`0 0 ${world.width} 372`} className="h-auto w-full" role="img" aria-label="World map">
      {Object.entries(shapes).map(([code, d]) => (
        <path key={code} d={d} fill={fill(code)} stroke="var(--surface)" strokeWidth={0.7} />
      ))}
    </svg>
  );
}
