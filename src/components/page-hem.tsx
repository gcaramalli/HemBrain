"use client";

import { AskHem, type AskTopic } from "./ask-hem";
import { useFamily } from "./family-context";
import type { Member } from "@/lib/types";

type PageTopic = Extract<AskTopic, "week" | "todo" | "shopping" | "recipes" | "purchases" | "kid_week" | "preschool" | "wardrobe" | "brain" | "papers" | "travels" | "expenses" | "work">;

// Hem at the top of a page: one line on what it sees here and the question
// you'd most likely ask it. Hidden without an AI key (the page has its own hints).
export function PageHem({ topic, kid }: { topic: PageTopic; kid?: Member }) {
  const { t } = useFamily();
  const name = kid?.name ?? "";
  const lines: Record<PageTopic, { intro: string; question: string; more?: string }> = {
    week: { intro: t("I keep an eye on the week: who's where, who drops off, who picks up."), question: t("Anything to sort out this week?") },
    todo: { intro: t("I've gone through your to-do lists."), question: t("What should I tackle first?") },
    shopping: { intro: t("I know what you usually buy and what's about to run out."), question: t("Am I forgetting anything?") },
    recipes: { intro: t("I know your recipes, and the ones you haven't made in a while."), question: t("Which recipe should we make again?"), more: t("Another idea?") },
    purchases: { intro: t("I follow how often you buy things."), question: t("What's about to run out?") },
    kid_week: { intro: t("I'm following {name}'s nights, meals and clothes.", { name }), question: t("How is {name} doing this week?", { name }) },
    preschool: { intro: t("I see who drops {name} off and who picks up this week.", { name }), question: t("Is the week covered?") },
    wardrobe: { intro: t("I know {name}'s sizes and what's in the wardrobe.", { name }), question: t("What does {name} need now?", { name }) },
    brain: { intro: t("I read everything you write down here."), question: t("Anything to prepare soon?") },
    papers: { intro: t("I keep an eye on your contracts and their deadlines."), question: t("Anything to cancel or renegotiate?") },
    travels: { intro: t("I know where each of you has been."), question: t("Where could we go next?"), more: t("Another idea?") },
    expenses: { intro: t("I keep the tally between you."), question: t("Where do we stand?") },
    work: { intro: t("I've got your work list in mind."), question: t("What should I focus on?") },
  };
  const line = lines[topic];
  return (
    <AskHem
      topic={topic}
      kidId={kid?.id}
      intro={line.intro}
      question={line.question}
      more={line.more ? { label: line.more } : undefined}
      hint=""
      fold
    />
  );
}
