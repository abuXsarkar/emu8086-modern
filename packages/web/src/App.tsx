import { useEffect, useMemo, useState } from "react";
import init, { compile_and_run } from "../../wasm-api/pkg/emu8086_wasm_api.js";

type CoreState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const SAMPLE = `; hello.asm — type a program and click Run.
;
; Try changing the message, or replacing it with your own
; computation. The full ISA is documented in the project README.

org 100h

    mov dx, msg
    mov ah, 9
    int 21h

    mov ax, 4C00h
    int 21h

msg: db "Hello, world!$"
`;

interface RunRegisters {
  ax: number;
  bx: number;
  cx: number;
  dx: number;
  si: number;
  di: number;
  bp: number;
  sp: number;
  ip: number;
  cs: number;
  ds: number;
  es: number;
  ss: number;
  flags: number;
}

interface RunErrorJson {
  stage: string;
  message: string;
  line: number;
  column: number;
  start: number;
  end: number;
}

interface RunResultJson {
  ok: boolean;
  stdout: string;
  stdout_lossy: boolean;
  exit_code: number | null;
  steps: number;
  halted: boolean;
  error: RunErrorJson | null;
  registers: RunRegisters;
  bytes: number;
  origin: number;
}

const FLAG_BITS: Array<[string, number]> = [
  ["CF", 1 << 0],
  ["PF", 1 << 2],
  ["AF", 1 << 4],
  ["ZF", 1 << 6],
  ["SF", 1 << 7],
  ["TF", 1 << 8],
  ["IF", 1 << 9],
  ["DF", 1 << 10],
  ["OF", 1 << 11],
];

function hex(n: number, w = 4): string {
  return n.toString(16).toUpperCase().padStart(w, "0");
}

function flagBadge(name: string, on: boolean) {
  return (
    <span
      key={name}
      style={{
        display: "inline-block",
        padding: "0 6px",
        marginRight: 6,
        border: "1px solid #ccc",
        borderRadius: 4,
        background: on ? "#0a7" : "#222",
        color: on ? "#000" : "#888",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {name}
    </span>
  );
}

export function App() {
  const [coreState, setCoreState] = useState<CoreState>({ kind: "loading" });
  const [source, setSource] = useState<string>(SAMPLE);
  const [result, setResult] = useState<RunResultJson | null>(null);
  const [running, setRunning] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    init()
      .then(() => {
        if (cancelled) return;
        setCoreState({ kind: "ready" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCoreState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRun = () => {
    if (coreState.kind !== "ready") return;
    setRunning(true);
    try {
      const json = compile_and_run(source, 1_000_000);
      const parsed = JSON.parse(json) as RunResultJson;
      setResult(parsed);
    } catch (e) {
      setResult({
        ok: false,
        stdout: "",
        stdout_lossy: false,
        exit_code: null,
        steps: 0,
        halted: false,
        error: {
          stage: "host",
          message: e instanceof Error ? e.message : String(e),
          line: 0,
          column: 0,
          start: 0,
          end: 0,
        },
        registers: {} as RunRegisters,
        bytes: 0,
        origin: 0,
      });
    } finally {
      setRunning(false);
    }
  };

  const errorLine = result?.error?.line ?? 0;
  const sourceLines = useMemo(() => source.split("\n"), [source]);

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "1.5rem 2rem",
        maxWidth: 1100,
        margin: "0 auto",
        lineHeight: 1.45,
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ marginBottom: 0 }}>emu8086-modern</h1>
        <p style={{ color: "#666", marginTop: "0.25rem" }}>
          A modern, open-source 8086 emulator and assembly IDE for students.
          Edit, click <strong>Run</strong>, see the result.
        </p>
      </header>

      {coreState.kind === "loading" && <p>Loading wasm core…</p>}
      {coreState.kind === "error" && (
        <p style={{ color: "#c00" }}>Failed to load wasm: {coreState.message}</p>
      )}

      {coreState.kind === "ready" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: "1rem",
          }}
        >
          <section>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <strong>source</strong>
              <button
                type="button"
                onClick={onRun}
                disabled={running}
                style={{
                  padding: "0.4rem 1rem",
                  background: "#0a7",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: running ? "default" : "pointer",
                  fontWeight: 600,
                }}
              >
                {running ? "running…" : "Run"}
              </button>
            </div>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%",
                height: 360,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 14,
                padding: "0.5rem",
                border: "1px solid #ccc",
                borderRadius: 4,
                resize: "vertical",
              }}
            />

            <div style={{ marginTop: "1rem" }}>
              <strong>output</strong>
              <pre
                style={{
                  background: "#111",
                  color: "#eee",
                  padding: "0.75rem",
                  borderRadius: 4,
                  minHeight: 80,
                  whiteSpace: "pre-wrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {result?.stdout || (running ? "running…" : "(no output yet — click Run)")}
              </pre>
              {result?.error && (
                <div
                  style={{
                    background: "#fee",
                    border: "1px solid #c66",
                    padding: "0.6rem 0.8rem",
                    borderRadius: 4,
                    marginTop: "0.5rem",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 13,
                    color: "#900",
                  }}
                >
                  <div>
                    <strong>{result.error.stage} error</strong> at line{" "}
                    {result.error.line}, column {result.error.column}: {result.error.message}
                  </div>
                  {errorLine > 0 && errorLine <= sourceLines.length && (
                    <pre
                      style={{
                        marginTop: 6,
                        marginBottom: 0,
                        background: "#fff",
                        padding: "0.4rem",
                        borderRadius: 3,
                        color: "#222",
                      }}
                    >
                      {`${errorLine.toString().padStart(3)} | ${sourceLines[errorLine - 1]}`}
                    </pre>
                  )}
                </div>
              )}
              {result?.ok && (
                <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                  {result.bytes} bytes assembled (origin = 0x{hex(result.origin)});{" "}
                  {result.steps.toLocaleString()} steps;{" "}
                  exit code{" "}
                  <code>{result.exit_code === null ? "—" : result.exit_code}</code>
                </div>
              )}
            </div>
          </section>

          <aside>
            <strong>registers</strong>
            {result?.registers ? (
              <table
                style={{
                  borderCollapse: "collapse",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                <tbody>
                  {(["ax", "bx", "cx", "dx", "si", "di", "bp", "sp", "ip"] as const).map(
                    (k) => (
                      <tr key={k}>
                        <td style={{ padding: "2px 8px", color: "#888" }}>{k.toUpperCase()}</td>
                        <td style={{ padding: "2px 0", color: "#000" }}>
                          0x{hex(result.registers[k] ?? 0)}
                        </td>
                      </tr>
                    ),
                  )}
                  {(["cs", "ds", "es", "ss"] as const).map((k) => (
                    <tr key={k}>
                      <td style={{ padding: "2px 8px", color: "#888" }}>{k.toUpperCase()}</td>
                      <td style={{ padding: "2px 0", color: "#000" }}>
                        0x{hex(result.registers[k] ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                run a program to see registers
              </div>
            )}

            <div style={{ marginTop: "1rem" }}>
              <strong>flags</strong>
              <div style={{ marginTop: 4 }}>
                {result?.registers
                  ? FLAG_BITS.map(([name, mask]) =>
                      flagBadge(name, (result.registers.flags & mask) !== 0),
                    )
                  : null}
              </div>
            </div>
          </aside>
        </div>
      )}

      <footer style={{ marginTop: "2rem", color: "#666", fontSize: 13 }}>
        <a href="https://github.com/abuXsarkar/emu8086-modern">github</a> ·{" "}
        full IDE (Monaco editor, time-travel debugger, devices) arrives in M3-M4 — see ROADMAP.md.
      </footer>
    </main>
  );
}
