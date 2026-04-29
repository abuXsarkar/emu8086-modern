// LPT1-style printer peripheral. The emulator reconstructs the paper
// buffer by walking `out_log` for writes to port 0x378; this view
// just renders the resulting string in a paper-shaped panel. Bytes
// 0x20..0x7E are printable; LF is a line break; FF clears the page;
// CR is dropped. Other non-printable bytes show as `·`.

interface Props {
  paper: string;
}

export function Printer({ paper }: Props) {
  // Show the last ~12 lines so the panel doesn't grow unbounded; the
  // student's program may print many pages over a long run.
  const visible = paper.split("\n").slice(-12).join("\n");
  const blank = paper.length === 0;
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
      }}
    >
      <pre
        aria-label="Printer paper"
        style={{
          width: 200,
          minHeight: 120,
          margin: 0,
          background: "#f4f1e7",
          color: "#222",
          border: "1px solid #c9c2a8",
          borderTop: "6px solid #8a7a3a",
          borderRadius: 4,
          padding: "10px 12px",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 11,
          lineHeight: 1.4,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {blank ? "(no output yet)" : visible}
      </pre>
      <div
        style={{
          color: "#888",
          fontSize: 11,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        port 0x378 · {paper.length} char{paper.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
