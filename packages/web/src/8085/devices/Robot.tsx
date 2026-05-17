/// Turtle-graphics robot — interprets its port as a one-byte
/// command:
///   0x01 → forward
///   0x02 → backward
///   0x03 → turn left 90°
///   0x04 → turn right 90°
///   0x05 → pen down
///   0x06 → pen up
/// Anything else is a no-op. The parent component owns the
/// trail/state; this device renders an SVG canvas of where the
/// robot has been.
///
/// Lab use: state-machine driving the bot through a square (FWD, R,
/// FWD, R, FWD, R, FWD) — the bot traces a square on the canvas.

export interface RobotState {
  /** Cell coordinates inside the 16×16 grid. */
  x: number;
  y: number;
  /** Heading in 0..3 (0=north, 1=east, 2=south, 3=west). */
  heading: number;
  /** True when the pen leaves a trail. */
  penDown: boolean;
  /** Trail of `(x, y)` cells visited with pen down. */
  trail: Array<[number, number]>;
}

export interface RobotProps {
  port: number;
  state: RobotState;
  onClear: () => void;
}

const CELL = 8; // px per grid cell
const GRID = 16; // 16x16 cells
const SVG = CELL * GRID;

export function Robot({ port, state, onClear }: RobotProps) {
  const cx = state.x * CELL + CELL / 2;
  const cy = state.y * CELL + CELL / 2;
  const arrow = headingPoints(state.heading, cx, cy);
  return (
    <div className="device-wrap">
      <div className="device-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H · robot
        <button
          type="button"
          onClick={onClear}
          className="printer-clear"
          title="Reset robot"
        >
          reset
        </button>
      </div>
      <svg
        viewBox={`0 0 ${SVG} ${SVG}`}
        width={SVG}
        height={SVG}
        className="robot-svg"
        role="img"
        aria-label="robot turtle canvas"
      >
        {/* grid */}
        {Array.from({ length: GRID + 1 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={i * CELL}
            y1={0}
            x2={i * CELL}
            y2={SVG}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth="0.5"
          />
        ))}
        {Array.from({ length: GRID + 1 }, (_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={i * CELL}
            x2={SVG}
            y2={i * CELL}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth="0.5"
          />
        ))}
        {/* trail */}
        {state.trail.length > 1 && (
          <polyline
            points={state.trail.map(([x, y]) => `${x * CELL + CELL / 2},${y * CELL + CELL / 2}`).join(" ")}
            fill="none"
            stroke="#1E3A8A"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
        {/* robot arrow */}
        <polygon points={arrow} fill={state.penDown ? "#dc2626" : "#9ca3af"} />
      </svg>
    </div>
  );
}

function headingPoints(h: number, cx: number, cy: number): string {
  const r = CELL / 2 - 0.5;
  // Vertices for an arrow pointing north, then rotated.
  const pts = [
    [cx, cy - r],
    [cx + r * 0.7, cy + r * 0.6],
    [cx - r * 0.7, cy + r * 0.6],
  ] as [number, number][];
  const angle = (h * Math.PI) / 2; // 0..3 → 0..1.5π
  return pts
    .map(([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
      const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
      return `${(cx + rx).toFixed(2)},${(cy + ry).toFixed(2)}`;
    })
    .join(" ");
}

/// Apply a one-byte command to a robot state. Pure function so it's
/// trivial to unit-test the lab logic; the parent calls it with the
/// drained io_log entries that match the robot port.
export function applyRobotCommand(state: RobotState, cmd: number): RobotState {
  const out: RobotState = { ...state, trail: state.trail.slice() };
  switch (cmd) {
    case 0x01: { // forward
      const [dx, dy] = stepDelta(state.heading);
      out.x = clamp(state.x + dx);
      out.y = clamp(state.y + dy);
      if (state.penDown) out.trail.push([out.x, out.y]);
      break;
    }
    case 0x02: { // backward
      const [dx, dy] = stepDelta(state.heading);
      out.x = clamp(state.x - dx);
      out.y = clamp(state.y - dy);
      if (state.penDown) out.trail.push([out.x, out.y]);
      break;
    }
    case 0x03: out.heading = (state.heading + 3) % 4; break; // left
    case 0x04: out.heading = (state.heading + 1) % 4; break; // right
    case 0x05:
      out.penDown = true;
      // Seed the trail at the current spot when we pick the pen up
      if (out.trail.length === 0 || out.trail[out.trail.length - 1][0] !== state.x || out.trail[out.trail.length - 1][1] !== state.y) {
        out.trail.push([state.x, state.y]);
      }
      break;
    case 0x06: out.penDown = false; break;
    default: break;
  }
  return out;
}

function stepDelta(h: number): [number, number] {
  switch (h % 4) {
    case 0: return [0, -1];
    case 1: return [1, 0];
    case 2: return [0, 1];
    case 3: return [-1, 0];
    default: return [0, 0];
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(GRID - 1, v));
}

export const initialRobotState: RobotState = {
  x: GRID / 2,
  y: GRID / 2,
  heading: 0,
  penDown: true,
  trail: [[GRID / 2, GRID / 2]],
};
