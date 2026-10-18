// Hembrain's signature: the icon's three dots (the family, and Claude
// thinking), pulsing while something is being read or worked out. Drawn as
// little lit spheres (a highlight top left, a darker rim, a soft shadow) that
// squash as they land: the same light as the 3D scenes, in CSS (they are used
// in many places at once, too many for WebGL canvases).
const DOTS = ["#5b8def", "#e07ab4", "#f5904a"];

// `still`: drawn without the pulse (e.g. while pulling to refresh).
export function ThinkingDots({ size = 10, label, still }: { size?: number; label?: string; still?: boolean }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center" style={{ gap: size * 0.45 }}>
      {DOTS.map((c, i) => (
        <span
          key={c}
          className={`${still ? "" : "thinking-dot "}rounded-full`}
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle at 34% 28%, color-mix(in srgb, ${c} 35%, white) 0%, ${c} 48%, color-mix(in srgb, ${c} 72%, black) 100%)`,
            boxShadow: `0 ${size * 0.22}px ${size * 0.35}px -${size * 0.12}px rgb(17 23 34 / 0.35)`,
            animationDelay: `${i * 160}ms`,
          }}
        />
      ))}
    </span>
  );
}
