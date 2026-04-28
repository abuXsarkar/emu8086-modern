import { useEffect, useState } from "react";
import init, { greet, version } from "../../core/pkg/emu8086_core.js";

type CoreState =
  | { kind: "loading" }
  | { kind: "ready"; version: string; greeting: string }
  | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<CoreState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    init()
      .then(() => {
        if (cancelled) return;
        setState({
          kind: "ready",
          version: version(),
          greeting: greet("Abu"),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2.5rem",
        maxWidth: 760,
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ marginBottom: "0.25rem" }}>emu8086-modern</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Modern, open-source 8086 emulator and assembly IDE for students.
      </p>

      <section
        style={{
          marginTop: "2rem",
          padding: "1rem 1.25rem",
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>M0 hello-wasm probe</h2>
        {state.kind === "loading" && <p>Loading wasm core…</p>}
        {state.kind === "ready" && (
          <>
            <p>
              <strong>core version:</strong> <code>{state.version}</code>
            </p>
            <p>
              <strong>greet():</strong> {state.greeting}
            </p>
            <p style={{ color: "#0a7" }}>JS↔Rust boundary verified.</p>
          </>
        )}
        {state.kind === "error" && (
          <p style={{ color: "#c00" }}>Failed to load wasm: {state.message}</p>
        )}
      </section>

      <p style={{ marginTop: "2rem", color: "#666" }}>
        See the <a href="https://github.com/abuXsarkar/emu8086-modern">repository</a>{" "}
        for the roadmap and build plan. The full editor and debugger arrive in M3.
      </p>
    </main>
  );
}
