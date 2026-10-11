"use client";

import { useFamily } from "@/components/family-context";
import { ListsView } from "@/components/lists-view";
import { CalendarSegments, PageHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";

// Calendar → To-do: who does what, by when. Next to the calendar because
// to-dos are about time and people, not about the kitchen.
export default function TodoPage() {
  const { t } = useFamily();
  return (
    <ListsView
      kind="todo"
      header={(newList) => (
        <>
          <PageHeader title={t("Calendar")} module="calendar" action={<button className="btn" onClick={newList}>+ {t("List")}</button>}>
            <CalendarSegments />
          </PageHeader>
          <PageHem topic="todo" />
        </>
      )}
    />
  );
}
