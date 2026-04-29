// Virtual robot peripheral. The wasm-api walks `out_log` to give us
// (x, y, heading) — heading 0=N, 1=E, 2=S, 3=W. We render a 9×9 grid
// centered at the origin with the robot at its current cell.

interface Props {
  x: number;
  y: number;
  heading: number;
  commands: number;
}

const HEADING_LABEL = ["N", "E", "S", "W"];
const HEADING_ROTATION = [0, 90, 180, 270];

const GRID_HALF = 4; // grid spans -4..+4 in each axis (9 cells per side)
const CELL = 14;
const SIZE = (GRID_HALF * 2 + 1) * CELL;

export function Robot({ x, y, heading, commands }: Props) {
  // Clamp the rendered position to the visible grid; programs that
  // walk far still get a meaningful "edge of the world" position.
  const clamp = (v: number) => Math.max(-GRID_HALF, Math.min(GRID_HALF, v));
  const rx = (clamp(x) + GRID_HALF + 0.5) * CELL;
  const ry = (clamp(y) + GRID_HALF + 0.5) * CELL;
  const rotation = HEADING_ROTATION[heading & 3] ?? 0;
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="140"
        height="140"
        style={{ background: "#0a0a0a", borderRadius: 6, padding: 4 }}
      >
        {/* Grid lines */}
        {Array.from({ length: GRID_HALF * 2 + 2 }, (_, i) => (
          <g key={i}>
            <line
              x1={i * CELL}
              y1={0}
              x2={i * CELL}
              y2={SIZE}
              stroke="#1f1f1f"
              strokeWidth={0.5}
            />
            <line
              x1={0}
              y1={i * CELL}
              x2={SIZE}
              y2={i * CELL}
              stroke="#1f1f1f"
              strokeWidth={0.5}
            />
          </g>
        ))}
        {/* Origin marker */}
        <circle
          cx={(GRID_HALF + 0.5) * CELL}
          cy={(GRID_HALF + 0.5) * CELL}
          r={2}
          fill="#444"
        />
        {/* Robot */}
        <g transform={`translate(${rx}, ${ry}) rotate(${rotation})`}>
          <circle r={5} fill="#0a8" stroke="#0fc" strokeWidth={1} />
          {/* Heading arrow */}
          <line x1={0} y1={0} x2={0} y2={-7} stroke="#fff" strokeWidth={1.5} />
          <polygon points="0,-9 -2,-6 2,-6" fill="#fff" />
        </g>
      </svg>
      <div
        style={{
          color: "#888",
          fontSize: 11,
          marginTop: 4,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        port 0x12 · ({x},{y}) {HEADING_LABEL[heading & 3] ?? "?"} · {commands} cmd
        {commands === 1 ? "" : "s"}
      </div>
    </div>
  );
}
