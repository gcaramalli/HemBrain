// Hembrain's signature: the icon's three dots (the family, and Claude
// thinking), pulsing while something is being read or worked out.
const DOTS = ["#5b8def", "#e07ab4", "#f5904a"];

export function ThinkingDots({ size = 10, label }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center" style={{ gap: size * 0.45 }}>
      {DOTS.map((c, i) => (
        <span key={c} className="thinking-dot rounded-full" style={{ width: size, height: size, background: c, animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}
