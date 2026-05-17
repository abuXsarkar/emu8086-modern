import { useMemo } from "react";

/// One 8-bit IO port → seven-segment-display bits.
///
/// Port-to-segment mapping (the de-facto trainer-kit convention):
///   bit 0 → a (top bar)
///   bit 1 → b (upper right)
///   bit 2 → c (lower right)
///   bit 3 → d (bottom bar)
///   bit 4 → e (lower left)
///   bit 5 → f (upper left)
///   bit 6 → g (middle bar)
///   bit 7 → dp (decimal point)
///
/// `OUT 00H` from a student program lights the matching segments.

export interface SevenSegmentProps {
  /** Current port value (0..255). */
  value: number;
  /** Which port the segment listens on, shown in the corner label. */
  port: number;
}

type Seg = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "dp";

const SEGMENT_BIT: Record<Seg, number> = {
  a: 0x01, b: 0x02, c: 0x04, d: 0x08, e: 0x10, f: 0x20, g: 0x40, dp: 0x80,
};

/// Standard digit→segment lookup. Useful for the IDE to label what
/// the current port byte would render as if it matches a digit.
const DIGIT_PATTERN: Record<number, Seg[]> = {
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
  3: ["a", "b", "g", "c", "d"],
  4: ["f", "g", "b", "c"],
  5: ["a", "f", "g", "c", "d"],
  6: ["a", "f", "g", "e", "c", "d"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"],
};

function matchedDigit(value: number): string | null {
  const masked = value & 0x7F; // ignore dp for digit-matching
  for (const [digit, segs] of Object.entries(DIGIT_PATTERN)) {
    let mask = 0;
    for (const s of segs) mask |= SEGMENT_BIT[s];
    if (masked === mask) return digit;
  }
  return null;
}

export function SevenSegment({ value, port }: SevenSegmentProps) {
  const lit = useMemo(() => {
    const out: Record<Seg, boolean> = {
      a: false, b: false, c: false, d: false,
      e: false, f: false, g: false, dp: false,
    };
    (Object.keys(SEGMENT_BIT) as Seg[]).forEach((seg) => {
      out[seg] = (value & SEGMENT_BIT[seg]) !== 0;
    });
    return out;
  }, [value]);

  const digit = matchedDigit(value);
  const off = "rgba(0,0,0,0.06)";
  const on = "#dc2626";

  return (
    <div className="sevenseg-wrap">
      <div className="sevenseg-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H ·{" "}
        {value.toString(16).toUpperCase().padStart(2, "0")}H
        {digit !== null && <> · "{digit}"</>}
      </div>
      <svg
        viewBox="0 0 60 100"
        width="60"
        height="100"
        className="sevenseg-svg"
        role="img"
        aria-label={`seven-segment showing ${value.toString(16).toUpperCase().padStart(2, "0")}H`}
      >
        {/* a — top */}
        <polygon points="10,6 50,6 46,12 14,12" fill={lit.a ? on : off} />
        {/* b — upper right */}
        <polygon points="51,8 56,12 56,46 52,50 48,46 48,14" fill={lit.b ? on : off} />
        {/* c — lower right */}
        <polygon points="51,52 56,56 56,90 52,94 48,90 48,58" fill={lit.c ? on : off} />
        {/* d — bottom */}
        <polygon points="14,94 46,94 50,90 10,90" fill={lit.d ? on : off} />
        {/* e — lower left */}
        <polygon points="9,52 12,56 12,90 8,94 4,90 4,56" fill={lit.e ? on : off} />
        {/* f — upper left */}
        <polygon points="9,8 12,12 12,46 8,50 4,46 4,12" fill={lit.f ? on : off} />
        {/* g — middle */}
        <polygon points="11,50 49,50 46,53 14,53" fill={lit.g ? on : off} />
        {/* dp */}
        <circle cx="58" cy="94" r="3" fill={lit.dp ? on : off} />
      </svg>
    </div>
  );
}
