// Stepper-motor peripheral driven by an 8-bit port byte. Standard
// emu8086 lab convention puts the coil-drive on port 7 with one bit
// per coil:
//
//   bit 0 = North coil   bit 1 = East coil
//   bit 2 = South coil   bit 3 = West coil
//
// "Wave drive" rotates the rotor by lighting one coil at a time
// through the sequence 1, 2, 4, 8. "Full step" lights two adjacent
// coils (3, 6, 12, 9). We compute the rotor angle as the centroid of
// the lit-coil unit vectors, so both schemes render naturally.
//
// `steps` is the total number of writes to port 7 since load — the
// rotation history. We display it as a counter so a programs that
// loops forever still gives the student a sense of motion.

interface Props {
  value: number;
  steps: number;
}

const COILS: Array<{ bit: number; cx: number; cy: number; label: string; angle: number }> = [
  { bit: 0, cx: 80, cy: 22, label: "N", angle: 270 },
  { bit: 1, cx: 138, cy: 80, label: "E", angle: 0 },
  { bit: 2, cx: 80, cy: 138, label: "S", angle: 90 },
  { bit: 3, cx: 22, cy: 80, label: "W", angle: 180 },
];

function rotorAngleDegrees(value: number): number | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const c of COILS) {
    if (((value >> c.bit) & 1) === 1) {
      const rad = (c.angle * Math.PI) / 180;
      sumX += Math.cos(rad);
      sumY += Math.sin(rad);
      count++;
    }
  }
  if (count === 0) return null;
  return (Math.atan2(sumY, sumX) * 180) / Math.PI;
}

export function Stepper({ value, steps }: Props) {
  const angle = rotorAngleDegrees(value);
  const rotorTransform = angle === null ? "" : `rotate(${angle} 80 80)`;
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <svg
        viewBox="0 0 160 160"
        width="140"
        height="140"
        style={{ background: "#0a0a0a", borderRadius: 6, padding: 4 }}
      >
        {/* Stator ring */}
        <circle cx="80" cy="80" r="50" fill="#111" stroke="#333" strokeWidth="1" />
        {/* Coils */}
        {COILS.map((c) => {
          const lit = ((value >> c.bit) & 1) === 1;
          return (
            <g key={c.bit}>
              <circle
                cx={c.cx}
                cy={c.cy}
                r="14"
                fill={lit ? "#fc3" : "#3a2a0a"}
                stroke={lit ? "#ff9" : "#222"}
                strokeWidth="1"
              />
              <text
                x={c.cx}
                y={c.cy + 4}
                textAnchor="middle"
                fontSize="10"
                fontFamily="ui-monospace, Menlo, monospace"
                fill={lit ? "#222" : "#666"}
              >
                {c.label}
              </text>
            </g>
          );
        })}
        {/* Rotor — only visible when at least one coil is lit. */}
        {angle !== null && (
          <g transform={rotorTransform}>
            <line
              x1="80"
              y1="80"
              x2="120"
              y2="80"
              stroke="#fc3"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="120" cy="80" r="4" fill="#fc3" />
            <circle cx="80" cy="80" r="6" fill="#444" stroke="#666" strokeWidth="1" />
          </g>
        )}
      </svg>
      <div
        style={{
          color: "#888",
          fontSize: 11,
          marginTop: 4,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        port 7: 0x{value.toString(16).toUpperCase().padStart(2, "0")} · {steps} step{steps === 1 ? "" : "s"}
      </div>
    </div>
  );
}
