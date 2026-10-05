import type { Metadata } from "next";
import { ThinkingDots } from "@/components/thinking-dots";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, BellRing, Globe, HeartHandshake, KeyRound, Languages, Lock, Moon, Smartphone, UsersRound } from "lucide-react";
import { isLocale, LOCALES, translator, type Locale } from "@/lib/i18n";
import { MODULES, type ModuleId } from "@/lib/modules";
import { ModuleIcon } from "@/components/module-icon";
import { ALEX, Chat, DemoMap, Dot, LEO, Phone, SAM, SleepBars, WeekStrip } from "./demos";

// Public landing page: what Hembrain is and how to start a family.
// Signed-out visitors to "/" land here (see src/proxy.ts). There is no
// profile yet, so the language comes from ?lang= or the browser.
// Translatable strings in the arrays below live in `title:` / `body:` fields
// (scripts/check-i18n.mjs reads them from this file).

const TITLE = "Hembrain — the family brain";

export const metadata: Metadata = {
  title: TITLE,
  description: "Calendar, kids, kitchen, travels and the family's memory in one place, and Hem, your assistant in Claude or ChatGPT, fills it in for you. Create your family in a minute.",
};

async function pickLocale(lang: string | string[] | undefined): Promise<Locale> {
  if (isLocale(lang)) return lang;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return "en";
}

const SAYINGS = [
  { title: "Sam picks up Leo on Thursday at 4" },
  { title: "We're out of oat milk" },
  { title: "Leo napped from 12:30 to 14:10" },
  { title: "What should we cook tonight?" },
  { title: "Add Lisbon in May 2019, the three of us" },
  { title: "Anna and Tom's wedding was on 14 June 2014" },
  { title: "Leo needs rain boots, size 25" },
  { title: "We had salmon and potatoes tonight" },
  { title: "Put the budget on Monday's team meeting" },
];

const PRIVACY = [
  { icon: UsersRound, title: "Your family, and only yours", body: "Each family only ever sees its own calendar, lists and notes. The database itself enforces it, not just the screens." },
  { icon: Lock, title: "A space nobody else sees", body: "Your private tiles, gift ideas and work space are yours alone. Not your partner, not even the family admin." },
  { icon: HeartHandshake, title: "Kids without an account", body: "Children are part of the family from day one: their routine, their sizes, their naps. No email, no password." },
];

const STEPS = [
  { title: "Create your family", body: "Choose a family name, then enter your first name, email and a password. You become the family's admin." },
  { title: "Confirm and sign in", body: "If we send you a confirmation email, open the link, then sign in." },
  { title: "Add your people", body: "Tap your avatar, top right, then Family: add the children (no account needed) and invite your partner with a personal link." },
  { title: "Make it yours", body: "Add Hembrain to your home screen, turn on the evening reminder and connect Hem to Claude or ChatGPT in Settings → Reminders & AI." },
];

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const { lang } = await searchParams;
  const locale = await pickLocale(lang);
  const t = translator(locale);

  return (
    <div className="landing relative overflow-x-clip">
      {/* Soft light in the module colours, drifting behind the hero. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[900px] overflow-hidden">
        <span className="landing-blob" style={{ background: MODULES.calendar.color, left: "-10%", top: "-8%" }} />
        <span className="landing-blob" style={{ background: MODULES.kids.color, right: "-12%", top: "8%", animationDelay: "-6s" }} />
        <span className="landing-blob" style={{ background: MODULES.travels.color, left: "30%", top: "38%", animationDelay: "-12s" }} />
      </div>

      <nav className="sticky top-0 z-30 backdrop-blur-xl [background:color-mix(in_srgb,var(--background)_72%,transparent)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={`/welcome?lang=${locale}`} className="flex items-center gap-2 text-[1.05rem] font-bold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={28} height={28} className="rounded-[8px]" /> Hembrain
          </Link>
          <div className="flex items-center gap-1 text-sm sm:gap-3">
            <div className="hidden items-center gap-0.5 rounded-full bg-accent-soft p-0.5 sm:flex">
              {LOCALES.map((l) => (
                <Link
                  key={l.id}
                  href={`/welcome?lang=${l.id}`}
                  hrefLang={l.id}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${l.id === locale ? "bg-[var(--pill)] text-foreground shadow-sm" : "text-muted"}`}
                >
                  {l.id.toUpperCase()}
                </Link>
              ))}
            </div>
            <Link href="/login" className="px-2 font-medium">{t("Sign in")}</Link>
            <Link href="/signup" className="btn min-h-9 px-4 py-1.5 text-sm">{t("Get started")}</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-24">
        <div className="flex flex-col items-start gap-6">
          <span className="landing-in inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold" style={{ boxShadow: "var(--lift)" }}>
            <ThinkingDots size={6} still />
            {t("New: sleep, meals, travels and a work space")}
          </span>
          <h1 className="landing-in text-[3.1rem] leading-[0.98] font-bold tracking-[-0.045em] text-balance sm:text-[4.6rem]" style={{ animationDelay: "80ms" }}>
            {t("The family")} <span className="landing-gradient">{t("brain.")}</span>
          </h1>
          <p className="landing-in max-w-xl text-lg text-muted text-pretty sm:text-xl" style={{ animationDelay: "160ms" }}>
            {t("Calendar, kids, kitchen, travels and everything you need to remember, in one place the whole family shares. Just tell Hem, it files it for you.")}
          </p>
          <div className="landing-in flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link href="/signup" className="btn px-6 text-base">
              {t("Create your family")} <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="btn-ghost px-5 text-base">{t("I already have an account")}</Link>
          </div>
          <p className="landing-in flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted" style={{ animationDelay: "320ms" }}>
            <span className="inline-flex items-center gap-1.5"><Smartphone size={15} /> {t("iPhone, Android, computer")}</span>
            <span className="inline-flex items-center gap-1.5"><Languages size={15} /> English · Français · Svenska</span>
          </p>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <div className="landing-in relative" style={{ animationDelay: "200ms" }}>
            <Phone t={t} />
            <FloatCard className="top-16 -left-8 sm:-left-28" delay="0s">
              <span className="text-lg">🌙</span>
              <span><b>{t("Leo is asleep")}</b><br /><span className="text-muted">{t("since 19:05")}</span></span>
            </FloatCard>
            <FloatCard className="top-[46%] -right-6 sm:-right-24" delay="-2s">
              <ModuleIcon id="preschool" size={30} />
              <span><b>{t("Friday pick-up")}</b><br /><span className="inline-flex items-center gap-1 text-muted"><Dot color={ALEX.color} size={7} /> {t("Alex is going")}</span></span>
            </FloatCard>
            <FloatCard className="bottom-24 -left-6 sm:-left-20" delay="-4s">
              <span className="text-lg">🇵🇹</span>
              <span><b>{t("New country!")}</b><br /><span className="text-muted">Portugal · 2019</span></span>
            </FloatCard>
          </div>
        </div>
      </header>

      {/* Things you can say, scrolling */}
      <section aria-label={t("Things you can say")} className="relative border-y border-border py-5">
        <div className="landing-marquee flex w-max gap-3 pr-3">
          {[...SAYINGS, ...SAYINGS].map((s, i) => (
            <span key={i} aria-hidden={i >= SAYINGS.length} className="rounded-full bg-surface px-4 py-2 text-sm whitespace-nowrap" style={{ boxShadow: "var(--lift)" }}>
              “{t(s.title)}”
            </span>
          ))}
        </div>
      </section>

      <main className="relative mx-auto flex max-w-6xl flex-col gap-28 px-4 py-24 sm:px-6">
        {/* Hem, the family's assistant (through Claude or ChatGPT) */}
        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Eyebrow color="var(--foreground)"><ThinkingDots size={6} still /> {t("Meet Hem, in Claude or ChatGPT")}</Eyebrow>
            <h2 className="landing-h2">{t("No forms. Just say it.")}</h2>
            <p className="text-lg text-muted text-pretty">
              {t("Hem is the family's assistant. Connect it once to your Claude or ChatGPT, then say it, paste it or snap a photo: an appointment, a receipt, a list of twenty weddings. Hem files it in the right place and answers from what your family actually knows.")}
            </p>
            <ul className="flex flex-col gap-2.5 text-[0.95rem]">
              {[
                t("Drop-offs and pick-ups in plain words"),
                t("Receipts read line by line, feeding what runs out"),
                t("Dinner ideas that balance your week"),
                t("Bedtime advice from your kid's real nights"),
              ].map((x) => (
                <li key={x} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.7rem] text-background">✓</span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <Chat t={t} />
        </section>

        {/* Bento */}
        <section className="flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow color={MODULES.today.color}>{t("What's inside")}</Eyebrow>
            <h2 className="landing-h2">{t("Everything a family juggles. One place.")}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-6">
            <Tile module="calendar" className="md:col-span-4" title={t("Calendar")} body={t("Everyone in their own colour. Repeating events, to-dos with a due date, birthdays and the dates you celebrate every year.")}>
              <WeekStrip locale={locale} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <MiniEvent time="09:30" title={t("Swimming lessons")} p={LEO} />
                <MiniEvent time="18:00" title={t("Dinner at Anna's")} p={SAM} />
              </div>
            </Tile>

            <Tile module="preschool" className="md:col-span-2" title={t("Drop-off & pick-up")} body={t("Each parent says if they can. One taps “I'm going”. A heads-up when nobody is down yet.")}>
              <div className="flex flex-col gap-2">
                <Slot label={t("Mon · Pick-up 16:00")} who={SAM} state={t("I'm going")} />
                <Slot label={t("Tue · Drop-off 08:00")} who={ALEX} state={t("I can")} />
                <div className="flex items-center justify-between rounded-2xl border border-dashed border-border px-3 py-2 text-sm">
                  <span>{t("Wed · Pick-up 16:00")}</span>
                  <span className="font-semibold" style={{ color: MODULES.kids.color }}>{t("Nobody yet")}</span>
                </div>
              </div>
            </Tile>

            <Tile module="sleep" className="md:col-span-2" title={t("Sleep")} body={t("Naps and nights, wakings counted. Tap when they fall asleep, tap when they wake.")}>
              <SleepBars />
            </Tile>

            <Tile module="wardrobe" className="md:col-span-2" title={t("Wardrobe")} body={t("Sizes, what fits, what's missing before the season turns.")}>
              <div className="flex flex-wrap gap-1.5">
                <span className="chip">👕 {t("Size")} 92</span>
                <span className="chip">👟 25</span>
                <span className="chip" style={{ background: "color-mix(in srgb, #e07ab4 20%, transparent)" }}>{t("Need: winter overall")}</span>
                <span className="chip line-through opacity-60">{t("Rain boots 23")}</span>
              </div>
            </Tile>

            <Tile module="food" className="md:col-span-2" title={t("Food")} body={t("What they ate and how it went.")}>
              <div className="flex flex-col gap-1.5 text-sm">
                <p className="flex justify-between"><span>{t("Salmon & potatoes")}</span><span>😍</span></p>
                <p className="flex justify-between"><span>{t("Lentil soup")}</span><span>🙂</span></p>
                <p className="flex justify-between"><span>{t("Broccoli")}</span><span>🙅</span></p>
              </div>
            </Tile>

            <Tile module="shopping" className="md:col-span-3" title={t("Shopping that learns")} body={t("Sorted by aisle, shared live. Check things off and Hembrain learns your rhythm, then tells you what's probably running out.")}>
              <div className="flex flex-col gap-1.5 text-sm">
                {[t("Oat milk"), t("Nappies, size 5"), t("Dill")].map((x, i) => (
                  <p key={x} className="flex items-center gap-2.5">
                    <span className={`h-4 w-4 rounded-full border-2 ${i === 2 ? "border-foreground bg-foreground" : "border-border"}`} />
                    <span className={i === 2 ? "text-muted line-through" : ""}>{x}</span>
                  </p>
                ))}
                <p className="mt-1 rounded-2xl px-3 py-2 text-xs font-medium" style={{ background: "color-mix(in srgb, #f2b441 20%, transparent)" }}>
                  {t("Probably running out: coffee, in about 2 days")}
                </p>
              </div>
            </Tile>

            <Tile module="meals" className="md:col-span-3" title={t("Meals & recipes")} body={t("What you ate, balanced over the week. Your recipes, favourites first, and ideas when nobody knows what to cook.")}>
              <div className="flex flex-wrap gap-1.5">
                {[["🐟", t("Fish"), 2], ["🥦", t("Vegetables"), 6], ["🫘", t("Legumes"), 1], ["🍝", t("Starches"), 5], ["🥩", t("Meat"), 3]].map(([e, label, n]) => (
                  <span key={String(label)} className="chip gap-1">{e} {label} <b>{n}</b></span>
                ))}
              </div>
            </Tile>

            <Tile module="travels" className="md:col-span-6" title={t("Travels")} body={t("Every country each of you has been to, on one map, in your colours. Stripes where you went together, and a timeline of every trip.")}>
              <div className="relative mx-auto w-full max-w-4xl">
                <DemoMap />
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="inline-flex items-center gap-1.5"><Dot color={ALEX.color} size={10} /> Alex · 14</span>
                  <span className="inline-flex items-center gap-1.5"><Dot color={SAM.color} size={10} /> Sam · 15</span>
                  <span className="inline-flex items-center gap-1.5 text-muted"><Globe size={14} /> {t("9 together")}</span>
                </div>
              </div>
            </Tile>

            <Tile module="brain" className="md:col-span-2" title={t("The family brain")} body={t("Door codes, allergies, the preschool's address. And the dates that matter: weddings, friends' birthdays, with a reminder the evening before.")}>
              <div className="flex flex-col gap-1.5 text-sm">
                <p className="flex justify-between"><span>💍 {t("Anna & Tom")}</span><span className="text-muted">{t("12 years")}</span></p>
                <p className="flex justify-between"><span>🎂 {t("Grandma")}</span><span className="text-muted">{t("Sunday")}</span></p>
              </div>
            </Tile>

            <Tile module="private" className="md:col-span-2" title={t("Your private space")} body={t("Your own lists, notes and gift ideas by person. Nobody else sees them.")}>
              <div className="grid grid-cols-3 gap-1.5 text-center text-xl">
                {["🎁", "📚", "🏃"].map((e) => <span key={e} className="rounded-2xl bg-accent-soft py-2">{e}</span>)}
              </div>
            </Tile>

            <Tile module="work" className="md:col-span-2" title={t("Work, without the noise")} body={t("People, projects and meeting agendas that build themselves from what you need to give or discuss.")}>
              <div className="flex flex-col gap-1.5 text-sm">
                <p className="flex items-center gap-2"><span className="chip">{t("Monday 1:1")}</span> 3 {t("points")}</p>
                <p className="flex items-center gap-2"><span className="chip">{t("Waiting")}</span> {t("Budget from Maria")}</p>
              </div>
            </Tile>
          </div>
        </section>

        {/* The evening message */}
        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 flex justify-center lg:order-1">
            <div className="relative w-full max-w-sm">
              <div className="landing-reveal flex items-start gap-3 rounded-[26px] bg-surface/80 p-4 backdrop-blur" style={{ boxShadow: "var(--lift)" }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-lg">🏡</span>
                <div className="min-w-0 text-sm">
                  <p className="flex justify-between font-semibold">Hembrain <span className="font-normal text-muted">19:00</span></p>
                  <p className="font-medium">{t("Tomorrow")}</p>
                  <p className="text-muted">{t("Alex drops off Leo at 8:00 · Dentist at 14:30 · Grandma's birthday 🎂")}</p>
                </div>
              </div>
              <div className="landing-reveal mt-3 flex items-start gap-3 rounded-[26px] bg-surface/60 p-4 opacity-70 backdrop-blur" style={{ boxShadow: "var(--lift)" }}>
                <span className="text-2xl">🎁</span>
                <p className="text-sm"><b>{t("Sam sent you a little something")}</b><br /><span className="text-muted">☕ {t("Coffee's on me tomorrow")}</span></p>
              </div>
            </div>
          </div>
          <div className="order-1 flex flex-col gap-5 lg:order-2">
            <Eyebrow color={MODULES.connections.color}><BellRing size={14} /> {t("Reminders")}</Eyebrow>
            <h2 className="landing-h2">{t("It speaks first. But rarely.")}</h2>
            <p className="text-lg text-muted text-pretty">
              {t("One message in the evening beats ten notifications: who does tomorrow's drop-off, what's coming up, whose birthday it is. And now and then, a little something from the person you love.")}
            </p>
          </div>
        </section>

        {/* Privacy */}
        <section className="flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow color={MODULES.private.color}><KeyRound size={14} /> {t("Private by design")}</Eyebrow>
            <h2 className="landing-h2">{t("Your family's memory belongs to your family.")}</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PRIVACY.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card landing-reveal flex flex-col gap-3 p-6">
                <Icon size={26} strokeWidth={2} />
                <h3 className="text-lg font-bold">{t(title)}</h3>
                <p className="text-muted">{t(body)}</p>
              </div>
            ))}
          </div>
          <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><Moon size={15} /> {t("Dark mode, night blue")}</span>
            <span className="inline-flex items-center gap-1.5"><Smartphone size={15} /> {t("On your home screen like an app")}</span>
            <span className="inline-flex items-center gap-1.5"><Languages size={15} /> {t("Each of you in your own language")}</span>
          </p>
        </section>

        {/* Steps */}
        <section className="flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow color={MODULES.todo.color}>{t("Get started in a few minutes")}</Eyebrow>
            <h2 className="landing-h2">{t("Four steps, then it just runs.")}</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card landing-reveal flex flex-col gap-3 p-5">
                <span className="text-5xl leading-none font-bold tracking-tighter text-muted/40">{i + 1}</span>
                <h3 className="font-bold">{t(s.title)}</h3>
                <p className="text-sm text-muted">{t(s.body)}</p>
              </li>
            ))}
          </ol>
          <p className="rounded-[22px] bg-accent-soft p-4 text-sm">
            <b>{t("Invited by someone?")}</b>{" "}
            {t("Use the link they sent you instead: it adds you to their family rather than creating a new one.")}
          </p>
        </section>

        {/* Final call */}
        <section className="landing-reveal relative overflow-hidden rounded-[36px] bg-foreground px-6 py-16 text-center text-background sm:px-12 sm:py-24">
          <div aria-hidden className="landing-glow pointer-events-none absolute inset-0">
            <span className="landing-blob" style={{ background: MODULES.travels.color, left: "-20%", top: "-40%" }} />
            <span className="landing-blob" style={{ background: MODULES.wardrobe.color, right: "-20%", bottom: "-50%", animationDelay: "-8s" }} />
          </div>
          <div className="relative flex flex-col items-center gap-6">
            <span className="text-5xl">🏡</span>
            <h2 className="max-w-2xl text-[2.4rem] leading-[1.02] font-bold tracking-[-0.035em] text-balance sm:text-6xl">
              {t("Nobody has to keep it all in their head anymore.")}
            </h2>
            <p className="max-w-lg text-lg opacity-70">{t("Create your family in a minute. Invite the others when you're ready.")}</p>
            <Link href="/signup" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-background px-7 py-3 text-base font-semibold text-foreground transition-transform active:scale-[0.97]">
              {t("Create your family")} <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-8 text-sm text-muted sm:px-6">
        <span className="font-semibold text-foreground">🏡 Hembrain</span>
        <div className="flex flex-wrap items-center gap-4">
          {LOCALES.map((l) => (
            <Link key={l.id} href={`/welcome?lang=${l.id}`} hrefLang={l.id} className={l.id === locale ? "text-foreground" : ""}>{l.label}</Link>
          ))}
          <Link href="/login">{t("Sign in")}</Link>
          <Link href="/signup">{t("Create your family")}</Link>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.1em] uppercase" style={{ color }}>
      {children}
    </span>
  );
}

function FloatCard({ className, delay, children }: { className: string; delay: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className={`landing-float absolute z-10 hidden sm:flex items-center gap-2.5 rounded-2xl bg-surface/85 px-3.5 py-2.5 text-xs leading-snug backdrop-blur-md ${className}`}
      style={{ boxShadow: "0 12px 40px -12px rgba(28,27,25,0.35)", animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function Tile({ module, className, title, body, children }: { module: ModuleId; className: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <article className={`card landing-reveal flex flex-col gap-4 p-5 sm:p-6 ${className}`}>
      <div className="flex items-start gap-3">
        <ModuleIcon id={module} size={40} />
        <div className="min-w-0">
          <h3 className="text-lg leading-tight font-bold">{title}</h3>
          <p className="mt-1 text-sm text-muted text-pretty">{body}</p>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </article>
  );
}

function MiniEvent({ time, title, p }: { time: string; title: string; p: { name: string; color: string } }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-3 py-2">
      <span className="h-7 w-1 rounded-full" style={{ background: p.color }} />
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">{title}</p>
        <p className="text-xs text-muted">{time} · {p.name}</p>
      </div>
    </div>
  );
}

function Slot({ label, who, state }: { label: string; who: { name: string; color: string }; state: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm" style={{ background: `color-mix(in srgb, ${who.color} 16%, transparent)` }}>
      <span>{label}</span>
      <span className="inline-flex items-center gap-1.5 font-semibold"><Dot color={who.color} size={8} /> {who.name} · {state}</span>
    </div>
  );
}
