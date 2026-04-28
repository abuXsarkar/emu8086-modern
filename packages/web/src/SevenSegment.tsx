// 7-segment display driven by an 8-bit port byte. Standard segment
// layout is the one emu8086's lab manuals assume:
//
//   bit 0 = top         (a)
//   bit 1 = top-right   (b)
//   bit 2 = bottom-right(c)
//   bit 3 = bottom      (d)
//   bit 4 = bottom-left (e)
//   bit 5 = top-left    (f)
//   bit 6 = middle      (g)
//   bit 7 = decimal point
//
// We render the seven main segments + the optional dot using an SVG so
// the rendering scales crisply on any DPI.

interface Props {
  value: number;
  label?: string;
}

interface Seg {
  d: string; // SVG path
  bit: number;
}

// Coordinate system: 100 wide, 160 tall. Origin top-left.
const SEGMENTS: Seg[] = [
  { bit: 0, d: "M20 12 L80 12 L72 20 L28 20 Z" }, // top
  { bit: 1, d: "M82 14 L82 70 L74 78 L74 22 Z" }, // top-right
  { bit: 2, d: "M82 88 L82 144 L74 138 L74 80 Z" }, // bottom-right
  { bit: 3, d: "M20 146 L80 146 L72 138 L28 138 Z" }, // bottom
  { bit: 4, d: "M18 88 L18 144 L26 138 L26 80 Z" }, // bottom-left
  { bit: 5, d: "M18 14 L18 70 L26 78 L26 22 Z" }, // top-left
  { bit: 6, d: "M20 79 L28 71 L72 71 L80 79 L72 87 L28 87 Z" }, // middle
];

export function SevenSegment({ value, label }: Props) {
  const lit = (bit: number) => ((value >> bit) & 1) === 1;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <svg
        viewBox="0 0 100 160"
        width="80"
        height="120"
        style={{ background: "#0a0a0a", borderRadius: 6, padding: 4 }}
      >
        {SEGMENTS.map(({ d, bit }) => (
          <path
            key={bit}
            d={d}
            fill={lit(bit) ? "#f33" : "#3a0a0a"}
            stroke={lit(bit) ? "#f99" : "none"}
            strokeWidth="0.5"
          />
        ))}
        {/* Decimal point */}
        <circle
          cx="92"
          cy="146"
          r="4"
          fill={lit(7) ? "#f33" : "#3a0a0a"}
          stroke={lit(7) ? "#f99" : "none"}
          strokeWidth="0.5"
        />
      </svg>
      <div style={{ color: "#888", fontSize: 11, marginTop: 4, fontFamily: "ui-monospace, Menlo, monospace" }}>
        {label ?? "port 199"}: 0x{value.toString(16).toUpperCase().padStart(2, "0")}
      </div>
    </div>
  );
}
