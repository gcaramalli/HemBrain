"use client";

import { useState } from "react";
import { KitchenHeader } from "@/components/page-header";
import { PageHem } from "@/components/page-hem";
import { Pantry } from "@/components/pantry";
import { Purchases } from "@/components/purchases";
import { ReceiptScan } from "@/components/receipt-scan";

// Kitchen → Purchases: what was bought (list, receipts, by hand). Feeds the
// "running out soon" prediction on the shopping list.
export default function PurchasesPage() {
  const [refresh, setRefresh] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <KitchenHeader action={<ReceiptScan onLogged={() => setRefresh((n) => n + 1)} />} />
      <PageHem topic="purchases" />
      <Pantry refreshKey={refresh} />
      <Purchases refreshKey={refresh} />
    </div>
  );
}
