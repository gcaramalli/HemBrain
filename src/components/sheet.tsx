"use client";

import { useFamily } from "./family-context";

// Bottom sheet used for add/edit forms on mobile.
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { t } = useFamily();
  if (!open) return null;
  return (
    <div data-sheet className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="h2">{title}</h2>
          <button onClick={onClose} className="text-muted" aria-label={t("Close")}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
