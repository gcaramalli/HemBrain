"use client";

import { useFamily } from "@/components/family-context";
import { ListsView } from "@/components/lists-view";
import { KitchenHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";

// Kitchen → Shopping.
export default function ShoppingPage() {
  const { t } = useFamily();
  return (
    <ListsView
      kind="grocery"
      header={(newList) => (
        <>
          <KitchenHeader action={<button className="btn" onClick={newList}>+ {t("List")}</button>} />
          <PageHem topic="shopping" />
        </>
      )}
    />
  );
}
