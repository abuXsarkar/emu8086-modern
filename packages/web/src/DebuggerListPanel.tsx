// Reusable list panel for the IDE's watches + breakpoints. Each entry
// is a free-text expression evaluated against the current register
// snapshot via debugExpr; the parent decides what `renderValue` does
// with the result. The panel itself only manages add / remove / edit.

import { useState } from "react";

interface Props {
  title: string;
  placeholder: string;
  entries: string[];
  setEntries: (next: string[]) => void;
  renderValue: (expr: string) => string;
}

export function DebuggerListPanel({
  title,
  placeholder,
  entries,
  setEntries,
  renderValue,
}: Props) {
  const [draft, setDraft] = useState<string>("");
  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setEntries([...entries, trimmed]);
    setDraft("");
  };
  return (
    <div style={{ marginTop: "1rem" }}>
      <strong style={{ display: "block", marginBottom: 4 }}>{title}</strong>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 12,
        }}
      >
        {entries.map((expr, idx) => (
          <li
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 2,
            }}
          >
            <span style={{ color: "#666", minWidth: 22 }}>{idx + 1}.</span>
            <span style={{ flex: "0 0 auto", minWidth: 110 }}>{expr}</span>
            <span style={{ flex: 1, color: "#0a8" }}>{renderValue(expr)}</span>
            <button
              type="button"
              onClick={() => setEntries(entries.filter((_, i) => i !== idx))}
              aria-label={`remove ${expr}`}
              style={{
                padding: "0 6px",
                border: "1px solid #888",
                borderRadius: 3,
                background: "#fff",
                color: "#222",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ×
            </button>
          </li>
        ))}
        {entries.length === 0 && (
          <li style={{ color: "#888", marginBottom: 2 }}>(none)</li>
        )}
      </ul>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: "0.2rem 0.4rem",
            border: "1px solid #888",
            borderRadius: 3,
            background: "#fff",
            color: "#222",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 12,
          }}
        />
        <button
          type="button"
          onClick={add}
          style={{
            padding: "0 8px",
            border: "1px solid #0a8",
            borderRadius: 3,
            background: "#0a8",
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          add
        </button>
      </div>
    </div>
  );
}
