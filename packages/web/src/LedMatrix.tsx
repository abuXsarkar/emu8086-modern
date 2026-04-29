// 8×8 LED matrix peripheral, the standard pattern in 8086 lab manuals
// for sprite / scrolling-text exercises.
//
//   port 10 (0x0A) = row address (0..7, modulo 8)
//   port  9 (0x09) = row data (one bit per column; bit 0 = leftmost lamp)
//
// A program lights row r by writing r to port 10, then the 8-pixel
// pattern to port 9. To paint the full grid the program loops through
// rows 0..7 and the host re-reads `led_matrix_rows()` after each step.
//
// We render with an SVG so the lamps stay crisp at any DPI and so a
// future "click a pixel" interaction can be added later without
// reaching for a canvas.

interface Props {
  rows: Uint8Array | number[];
}

const LIT = "#3f3";
const DIM = "#0a3a0a";
const STROKE_LIT = "#9f9";
const SIZE = 144;
const PAD = 8;
const COLS = 8;
const ROWS = 8;
const STEP = (SIZE - PAD * 2) / COLS;
const RADIUS = STEP * 0.36;

export function LedMatrix({ rows }: Props) {
  const lamp = (row: number, col: number): boolean => {
    const byte = rows[row] ?? 0;
    return ((byte >> col) & 1) === 1;
  };
  const total = (() => {
    let count = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (lamp(r, c)) count++;
      }
    }
    return count;
  })();
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
        width={SIZE}
        height={SIZE}
        style={{ background: "#0a0a0a", borderRadius: 6, padding: 4 }}
      >
        {Array.from({ length: ROWS }).map((_, r) =>
          Array.from({ length: COLS }).map((_, c) => {
            const on = lamp(r, c);
            const cx = PAD + STEP / 2 + c * STEP;
            const cy = PAD + STEP / 2 + r * STEP;
            return (
              <circle
                key={`${r}-${c}`}
                cx={cx}
                cy={cy}
                r={RADIUS}
                fill={on ? LIT : DIM}
                stroke={on ? STROKE_LIT : "none"}
                strokeWidth="0.5"
              />
            );
          }),
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
        ports 9/10: {total}/64 lit
      </div>
    </div>
  );
}
