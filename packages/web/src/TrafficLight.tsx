// Traffic-light peripheral driven by an 8-bit port byte. The standard
// emu8086 lab layout maps bits to the 12 physical lamps a 4-way
// intersection needs, but with only 8 bits there's room for 4 lights ×
// 2 colors. We use:
//
//   bit 0 = North red    bit 1 = North green
//   bit 2 = South red    bit 3 = South green
//   bit 4 = East  red    bit 5 = East  green
//   bit 6 = West  red    bit 7 = West  green
//
// Yellow phases are usually programmed by lighting both red and green
// briefly; that still works visually here.

interface Props {
  value: number;
}

interface Lamp {
  bit: number;
  color: "red" | "green";
  cx: number;
  cy: number;
  label: string;
}

const LAMPS: Lamp[] = [
  // North (top)
  { bit: 0, color: "red", cx: 80, cy: 24, label: "N" },
  { bit: 1, color: "green", cx: 100, cy: 24, label: "N" },
  // South (bottom)
  { bit: 2, color: "red", cx: 80, cy: 156, label: "S" },
  { bit: 3, color: "green", cx: 100, cy: 156, label: "S" },
  // East (right)
  { bit: 4, color: "red", cx: 156, cy: 80, label: "E" },
  { bit: 5, color: "green", cx: 156, cy: 100, label: "E" },
  // West (left)
  { bit: 6, color: "red", cx: 24, cy: 80, label: "W" },
  { bit: 7, color: "green", cx: 24, cy: 100, label: "W" },
];

function lampFill(color: "red" | "green", lit: boolean): string {
  if (color === "red") return lit ? "#f33" : "#3a0a0a";
  return lit ? "#3f3" : "#0a3a0a";
}

export function TrafficLight({ value }: Props) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <svg
        viewBox="0 0 180 180"
        width="160"
        height="160"
        style={{ background: "#0a0a0a", borderRadius: 6, padding: 4 }}
      >
        {/* Roads */}
        <rect x="60" y="0" width="60" height="180" fill="#222" />
        <rect x="0" y="60" width="180" height="60" fill="#222" />
        {/* Lane markers */}
        <line x1="90" y1="0" x2="90" y2="180" stroke="#444" strokeWidth="1" strokeDasharray="6 6" />
        <line x1="0" y1="90" x2="180" y2="90" stroke="#444" strokeWidth="1" strokeDasharray="6 6" />
        {/* Lamps */}
        {LAMPS.map((l) => {
          const lit = ((value >> l.bit) & 1) === 1;
          return (
            <circle
              key={l.bit}
              cx={l.cx}
              cy={l.cy}
              r="8"
              fill={lampFill(l.color, lit)}
              stroke={lit ? (l.color === "red" ? "#f99" : "#9f9") : "#222"}
              strokeWidth="1"
            />
          );
        })}
      </svg>
      <div
        style={{
          color: "#888",
          fontSize: 11,
          marginTop: 4,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        port 4: 0x{value.toString(16).toUpperCase().padStart(2, "0")}
      </div>
    </div>
  );
}
