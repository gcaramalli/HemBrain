"use client";

import { useFamily } from "./family-context";

export function MemberSelect({ value, onChange, placeholder = "Nobody" }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const { members } = useFamily();
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>
      ))}
    </select>
  );
}

export function MemberBadge({ id }: { id: string | null }) {
  const { memberById } = useFamily();
  const m = memberById(id);
  if (!m) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: m.color }} />
      {m.name}
    </span>
  );
}

// Several people at once (who an event is about): a pill per member, none picked = `empty`.
export function MemberPicker({ value, onChange, empty }: { value: string[]; onChange: (ids: string[]) => void; empty: string }) {
  const { members } = useFamily();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : members.filter((m) => m.id === id || value.includes(m.id)).map((m) => m.id));
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => {
        const on = value.includes(m.id);
        return (
          <button
            type="button"
            key={m.id}
            aria-pressed={on}
            onClick={() => toggle(m.id)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-foreground bg-foreground text-background" : "border-border"}`}
          >
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: m.color }} />
            {m.name}
          </button>
        );
      })}
      {!value.length && <span className="self-center text-xs text-muted">{empty}</span>}
    </div>
  );
}
