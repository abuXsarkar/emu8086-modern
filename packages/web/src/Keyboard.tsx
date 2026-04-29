// Keyboard peripheral. Captures keystrokes inside a focused textbox
// and pushes them as ASCII bytes into the emulator's keyboard FIFO,
// where the program drains them via `IN AL, 0x60`, INT 16h AH=00h,
// or INT 21h AH=01h/06h.
//
// We only forward printable bytes plus a small set of control codes
// (Enter → 0x0D, Backspace → 0x08, Tab → 0x09, Esc → 0x1B, Ctrl+C →
// 0x03). The textbox itself is a controlled empty string — we don't
// echo here; the program is responsible for echoing back through
// stdout. This matches the polling-loop pattern in
// examples/keyboard.asm.

import { useRef } from "react";

interface Props {
  pendingKeys: number;
  onKey: (byte: number) => void;
}

const SPECIAL: Record<string, number> = {
  Enter: 0x0d,
  Backspace: 0x08,
  Tab: 0x09,
  Escape: 0x1b,
};

export function Keyboard({ pendingKeys, onKey }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+C → 0x03 (the example's exit sentinel).
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      onKey(0x03);
      return;
    }
    const special = SPECIAL[e.key];
    if (special !== undefined) {
      e.preventDefault();
      onKey(special);
      return;
    }
    if (e.key.length === 1) {
      const code = e.key.charCodeAt(0);
      // Printable ASCII only; ignore the rest (arrow keys, F-keys,
      // etc.) for now — they need scancode plumbing we don't have.
      if (code >= 0x20 && code <= 0x7e) {
        e.preventDefault();
        onKey(code);
      }
    }
  };

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value=""
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        placeholder="click here & type"
        aria-label="Keyboard input — keystrokes feed the emulator's keyboard FIFO"
        style={{
          width: 160,
          background: "#0a0a0a",
          color: "#0f0",
          border: "1px solid #333",
          borderRadius: 6,
          padding: "6px 8px",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 12,
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#0a8";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#333";
        }}
      />
      <div
        style={{
          color: "#888",
          fontSize: 11,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        ports 0x60/0x64 · {pendingKeys} pending
      </div>
    </div>
  );
}
