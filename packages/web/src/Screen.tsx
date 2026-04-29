// Text-mode "screen" peripheral mirroring DOS B800:0000 video memory.
//
// The wasm-api `video_text()` getter returns 25 lines of 80 characters
// each, separated by newlines. Non-printable bytes are already
// translated to spaces on the Rust side; the attribute byte is
// dropped (we render monochrome — adding color is a future iteration
// once we expose the attribute bytes too).
//
// We only render this device when the buffer has actually been
// touched, so the IDE doesn't show a blank 80×25 wall for programs
// that don't use video memory.

interface Props {
  text: string;
}

function isAllBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 0x20 && c !== 0x0A) return false;
  }
  return true;
}

export function Screen({ text }: Props) {
  if (isAllBlank(text)) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
      }}
    >
      <pre
        style={{
          background: "#000",
          color: "#cfc",
          padding: "6px 8px",
          borderRadius: 6,
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 10,
          lineHeight: 1.05,
          margin: 0,
          border: "1px solid #2a2a2a",
          letterSpacing: "0.5px",
          whiteSpace: "pre",
        }}
      >
        {text}
      </pre>
      <div
        style={{
          color: "#888",
          fontSize: 11,
          marginTop: 4,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        text mode B800:0000 (80×25)
      </div>
    </div>
  );
}
