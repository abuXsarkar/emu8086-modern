/// Hex keypad input device. Sixteen buttons (0–F) in a 4×4 grid.
/// Clicking a button writes its hex value into the configured port
/// so the next `IN portN` returns it. The last pressed key is
/// highlighted so you can see what just landed.
///
/// Classic 8085 lab: poll the keypad port, branch on the value,
/// drive a seven-segment from the same digit.

import { useState } from "react";

export interface HexKeypadProps {
  port: number;
  /** Called with the byte value (0..15) when a key is pressed. */
  onPress: (value: number) => void;
}

const LAYOUT: number[][] = [
  [0x1, 0x2, 0x3, 0xC],
  [0x4, 0x5, 0x6, 0xD],
  [0x7, 0x8, 0x9, 0xE],
  [0xA, 0x0, 0xB, 0xF],
];

export function HexKeypad({ port, onPress }: HexKeypadProps) {
  const [last, setLast] = useState<number | null>(null);
  return (
    <div className="device-wrap">
      <div className="device-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H · hex keypad
      </div>
      <div className="keypad-grid">
        {LAYOUT.flat().map((v) => (
          <button
            key={v}
            type="button"
            className={`keypad-key mono ${last === v ? "keypad-key-active" : ""}`}
            onClick={() => {
              onPress(v);
              setLast(v);
              // Auto-clear the highlight after a moment so a follow-up
              // press of the same key is visibly distinct.
              setTimeout(() => setLast((cur) => (cur === v ? null : cur)), 350);
            }}
            aria-label={`hex ${v.toString(16).toUpperCase()}`}
          >
            {v.toString(16).toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
