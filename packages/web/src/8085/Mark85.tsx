/// Brand mark for modern8085 — same DIP-package construction as the
/// 8086 mark in src/about/Landing.tsx (square outline, pin-1 notch
/// top-left, four corner pins, centred mnemonic). Differs only in
/// the centred text: `0x85` instead of `0x86`.

export function Mark85({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <rect x="4" y="4" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <polygon points="4,4 16,4 4,16" fill="var(--paper)" />
      <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="56" cy="8" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="56" cy="56" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="8" cy="56" r="0.8" fill="currentColor" opacity="0.5" />
      <text
        x="32"
        y="32"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Geist Mono, ui-monospace, monospace"
        fontWeight="600"
        fontSize="20"
        fill="currentColor"
      >
        0<tspan fill="var(--accent)">x</tspan>85
      </text>
    </svg>
  );
}
