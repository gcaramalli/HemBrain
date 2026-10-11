import type { Metadata } from "next";
import { isLocale, translator } from "@/lib/i18n";

export const metadata: Metadata = { title: "Hembrain" };

// Public: opened from the link at the bottom of the weekly news email. A
// button rather than unsubscribing on load, so mail scanners that open links
// don't unsubscribe anyone.
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const q = await searchParams;
  const one = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) ?? "";
  const lang = one(q.lang);
  const t = translator(isLocale(lang) ? lang : "en");
  const done = one(q.done) === "1";
  const action = `/api/digest/unsubscribe?${new URLSearchParams({ u: one(q.u), s: one(q.s), lang })}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <div className="card flex flex-col gap-3">
        <h1 className="h2">{done ? t("You won't get these emails any more") : t("Stop the weekly news from Hembrain?")}</h1>
        <p className="text-sm text-muted">
          {done
            ? t("You can turn them back on in Hembrain, under Personal settings.")
            : t("You'll stop getting the short email about what's new in Hembrain. Your reminders don't change.")}
        </p>
        {!done && (
          <form method="post" action={action}>
            <button className="btn w-full">{t("Stop these emails")}</button>
          </form>
        )}
      </div>
    </main>
  );
}
