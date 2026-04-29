import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import init, {
  compile_and_run,
  Emulator,
} from "../../wasm-api/pkg/emu8086_wasm_api.js";
import { ASM_LANG_ID, registerAsm8086 } from "./asm8086";
import { EXAMPLES } from "./examples";
import { SevenSegment } from "./SevenSegment";
import { TrafficLight } from "./TrafficLight";
import { LedMatrix } from "./LedMatrix";
import { Stepper } from "./Stepper";
import { Screen } from "./Screen";
import { LOCALES, useLocaleId, useStrings } from "./i18n";

const STORAGE_KEY = "emu8086-modern.source";

type CoreState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/// Decode a share-link fragment, e.g. "#code=eyJ...". Returns the
/// decoded source on success, or null if the fragment is missing or
/// unreadable. Encoding is base64url so the link survives copy/paste
/// across chat clients without escaping issues.
function decodeShareFragment(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const encoded = params.get("code");
  if (!encoded) return null;
  try {
    // base64url → standard base64 → bytes → UTF-8 string.
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

function encodeShareFragment(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  // base64url: + → -, / → _, drop trailing =
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function initialSource(): string {
  // A share-link in the URL beats both stored buffer and default —
  // someone went to the trouble of sending a specific program.
  const shared = decodeShareFragment();
  if (shared !== null) return shared;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim().length > 0) return stored;
  } catch {
    // localStorage may be unavailable (private browsing, sandboxed iframe).
  }
  return EXAMPLES[0].source;
}

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
  line_map: Array<[number, number]>;
}

/// Convert a byte offset in the source string to a 1-based line number.
function byteOffsetToLine(source: string, byteOffset: number): number {
  let line = 1;
  const limit = Math.min(byteOffset, source.length);
  for (let i = 0; i < limit; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/// Find the source line corresponding to the largest line_map entry whose
/// IP <= the given linear ip. Returns 0 if no match.
function lineForIp(
  source: string,
  lineMap: Array<[number, number]>,
  linearIp: number,
): number {
  let bestByte = -1;
  for (const [ip, byte] of lineMap) {
    if (ip <= linearIp && ip > bestByte) {
      bestByte = byte;
    }
  }
  if (bestByte < 0) return 0;
  return byteOffsetToLine(source, bestByte);
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
        border: "1px solid #2a2a2a",
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
  const t = useStrings();
  const [localeId, setLocaleIdValue] = useLocaleId();
  const [coreState, setCoreState] = useState<CoreState>({ kind: "loading" });
  const [source, setSource] = useState<string>(() => initialSource());
  const [result, setResult] = useState<RunResultJson | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [stepLog, setStepLog] = useState<string>("");
  const [stepLoaded, setStepLoaded] = useState<boolean>(false);
  const [memHex, setMemHex] = useState<string>("");
  const [port199, setPort199] = useState<number>(0);
  const [port4, setPort4] = useState<number>(0);
  const [ledRows, setLedRows] = useState<Uint8Array>(() => new Uint8Array(8));
  const [port7, setPort7] = useState<number>(0);
  const [stepperSteps, setStepperSteps] = useState<number>(0);
  const [videoText, setVideoText] = useState<string>("");
  const [shareToast, setShareToast] = useState<string>("");
  const emuRef = useRef<Emulator | null>(null);
  const lineMapRef = useRef<Array<[number, number]>>([]);
  const decorationsRef = useRef<string[]>([]);

  // Pull a 256-byte slice of memory at DS:0x100 (the .com origin) and
  // render it as a 16×16 hex grid. Called after every reset / step /
  // step_back so the panel mirrors the live state.
  function refreshMemHex(regs: RunRegisters | undefined) {
    if (!emuRef.current || !regs) return;
    const ds = regs.ds ?? 0;
    const hex = emuRef.current.memory_hex(ds, 0x0100, 256);
    setMemHex(hex);
  }

  function refreshDevices() {
    if (!emuRef.current) return;
    setPort199(emuRef.current.port_byte(199));
    setPort4(emuRef.current.port_byte(4));
    setLedRows(emuRef.current.led_matrix_rows());
    setPort7(emuRef.current.port_byte(7));
    setStepperSteps(emuRef.current.stepper_steps());
    setVideoText(emuRef.current.video_text());
  }

  function onShare() {
    const fragment = encodeShareFragment(source);
    const url = `${window.location.origin}${window.location.pathname}#code=${fragment}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setShareToast(t.shareCopied);
          window.setTimeout(() => setShareToast(""), 1800);
        })
        .catch(() => {
          window.location.hash = `code=${fragment}`;
          setShareToast(t.shareInUrl);
          window.setTimeout(() => setShareToast(""), 1800);
        });
    } else {
      window.location.hash = `code=${fragment}`;
      setShareToast(t.shareInUrl);
      window.setTimeout(() => setShareToast(""), 1800);
    }
  }

  // Persist on every edit, throttled implicitly by React's batching.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, source);
    } catch {
      // ignore — see initialSource for the same defensive pattern.
    }
  }, [source]);

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

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const runRef = useRef<() => void>(() => {});

  const onEditorMount: OnMount = (editor, monacoApi: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monacoApi;
    registerAsm8086(monacoApi);
    // Ctrl/Cmd+Enter runs the program. We close over a ref so the
    // command always sees the latest `onRun` (closures inside Monaco
    // commands aren't re-bound on re-render).
    editor.addCommand(
      monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.Enter,
      () => {
        runRef.current();
      },
    );
  };

  // Decorate the source line corresponding to the next instruction
  // about to execute. Cleared on Reset, refreshed on each Step. We
  // use Monaco's line decoration with a colored gutter glyph so the
  // current-IP line stands out without competing with diagnostic
  // squiggles.
  function highlightLine(line: number) {
    const editor = editorRef.current;
    if (!editor) return;
    if (line <= 0) {
      decorationsRef.current = editor.deltaDecorations(
        decorationsRef.current,
        [],
      );
      return;
    }
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      [
        {
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: "currentLineHighlight",
            linesDecorationsClassName: "currentLineGlyph",
          },
        },
      ],
    );
    editor.revealLineInCenterIfOutsideViewport(line);
  }

  // Project the assembler's diagnostic onto a Monaco marker so the
  // offending line gets a red squiggle. We compute the column from the
  // byte span (`error.column` is 1-based already from the wasm-api).
  function applyDiagnostic(error: RunErrorJson | null) {
    const editor = editorRef.current;
    const m = monacoRef.current;
    if (!editor || !m) return;
    const model = editor.getModel();
    if (!model) return;
    if (!error) {
      m.editor.setModelMarkers(model, "asm8086", []);
      return;
    }
    const lineLength = model.getLineLength(error.line) + 1;
    const startColumn = Math.max(1, Math.min(error.column, lineLength));
    const spanWidth = Math.max(1, error.end - error.start);
    const endColumn = Math.min(startColumn + spanWidth, lineLength);
    m.editor.setModelMarkers(model, "asm8086", [
      {
        startLineNumber: error.line,
        startColumn,
        endLineNumber: error.line,
        endColumn,
        message: `${error.stage} error: ${error.message}`,
        severity: m.MarkerSeverity.Error,
      },
    ]);
  }

  const onRun = () => {
    if (coreState.kind !== "ready") return;
    setRunning(true);
    try {
      const json = compile_and_run(source, 1_000_000);
      const parsed = JSON.parse(json) as RunResultJson;
      setResult(parsed);
      applyDiagnostic(parsed.error);
      // Run-to-completion clears the per-step highlight: there's no
      // single "current" instruction left.
      lineMapRef.current = parsed.line_map ?? [];
      highlightLine(0);
      setStepLog("");
      setStepLoaded(false);
    } catch (e) {
      const err: RunErrorJson = {
        stage: "host",
        message: e instanceof Error ? e.message : String(e),
        line: 0,
        column: 0,
        start: 0,
        end: 0,
      };
      setResult({
        ok: false,
        stdout: "",
        stdout_lossy: false,
        exit_code: null,
        steps: 0,
        halted: false,
        error: err,
        registers: {} as RunRegisters,
        bytes: 0,
        origin: 0,
        line_map: [],
      });
    } finally {
      setRunning(false);
    }
  };
  // Keep the ref pointing at the latest onRun closure.
  useEffect(() => {
    runRef.current = onRun;
  });

  interface StepResult {
    stdout: string;
    halted: boolean;
    mnemonic: string;
    stopped: string | null;
    exit_code: number | null;
    registers: RunRegisters;
  }

  // Reset the step session: assemble the current source, point the
  // stateful Emulator at a fresh image, clear the visible step log
  // and re-render registers at the program's entry point.
  const onReset = () => {
    if (coreState.kind !== "ready") return;
    if (!emuRef.current) emuRef.current = new Emulator();
    const json = emuRef.current.load_source(source);
    const parsed = JSON.parse(json) as RunResultJson;
    if (!parsed.ok) {
      setResult(parsed);
      applyDiagnostic(parsed.error);
      setStepLoaded(false);
      return;
    }
    setResult(parsed);
    applyDiagnostic(null);
    setStepLog("");
    setStepLoaded(true);
    lineMapRef.current = parsed.line_map ?? [];
    // Highlight the line of the very first instruction (current IP).
    const linearIp =
      ((parsed.registers.cs ?? 0) << 4) + (parsed.registers.ip ?? 0);
    highlightLine(lineForIp(source, lineMapRef.current, linearIp));
    refreshMemHex(parsed.registers);
    refreshDevices();
  };

  const onBack = () => {
    if (coreState.kind !== "ready") return;
    if (!stepLoaded || !emuRef.current) return;
    const json = emuRef.current.step_back();
    const parsed = JSON.parse(json) as StepResult;
    if (!parsed.mnemonic) return; // empty history
    // The core has already truncated cpu.stdout to the pre-step length;
    // pull the synced view so the output panel un-prints any byte that
    // the rolled-back instruction had emitted.
    const syncedStdout = emuRef.current.stdout();
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        stdout: syncedStdout,
        registers: parsed.registers,
        halted: parsed.halted,
        exit_code: parsed.exit_code ?? prev.exit_code,
      };
    });
    setStepLog((prev) =>
      prev.replace(/[^\n]*\n$/, ""),
    );
    const linearIp =
      ((parsed.registers.cs ?? 0) << 4) + (parsed.registers.ip ?? 0);
    highlightLine(lineForIp(source, lineMapRef.current, linearIp));
    refreshMemHex(parsed.registers);
    refreshDevices();
  };

  const onStep = () => {
    if (coreState.kind !== "ready") return;
    if (!stepLoaded) {
      onReset();
      return;
    }
    if (!emuRef.current) return;
    const json = emuRef.current.step();
    const parsed = JSON.parse(json) as StepResult;
    setResult((prev) => {
      const baseline: RunResultJson = prev ?? {
        ok: true,
        stdout: "",
        stdout_lossy: false,
        exit_code: null,
        steps: 0,
        halted: false,
        error: null,
        registers: parsed.registers,
        bytes: 0,
        origin: 0,
        line_map: [],
      };
      return {
        ...baseline,
        stdout: baseline.stdout + parsed.stdout,
        registers: parsed.registers,
        halted: parsed.halted,
        exit_code: parsed.exit_code ?? baseline.exit_code,
      };
    });
    setStepLog((prev) => prev + parsed.mnemonic + (parsed.stopped ? ` [${parsed.stopped}]` : "") + "\n");
    // Move the current-IP highlight to the next instruction.
    const linearIp = ((parsed.registers.cs ?? 0) << 4) + (parsed.registers.ip ?? 0);
    highlightLine(parsed.halted ? 0 : lineForIp(source, lineMapRef.current, linearIp));
    if (parsed.halted) {
      setStepLoaded(false);
    }
    refreshMemHex(parsed.registers);
    refreshDevices();
  };

  const errorLine = result?.error?.line ?? 0;
  const sourceLines = useMemo(() => source.split("\n"), [source]);

  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "1.5rem 2rem",
        maxWidth: 1180,
        margin: "0 auto",
        lineHeight: 1.45,
      }}
    >
      <header
        style={{
          marginBottom: "1rem",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 0 }}>{t.appTitle}</h1>
          <p style={{ color: "#666", marginTop: "0.25rem" }}>
            {t.appLead}
            <strong>{t.appLeadRunVerb}</strong>
            {".  "}
          </p>
        </div>
        <select
          aria-label={t.languageLabel}
          value={localeId}
          onChange={(e) =>
            setLocaleIdValue(e.target.value as typeof localeId)
          }
          style={{
            padding: "0.25rem 0.5rem",
            border: "1px solid #ccc",
            borderRadius: 4,
            background: "#fff",
            fontSize: 12,
          }}
          title={t.languageLabel}
        >
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </header>

      {coreState.kind === "loading" && <p>{t.loadingWasm}</p>}
      {coreState.kind === "error" && (
        <p style={{ color: "#c00" }}>{t.loadWasmFailed(coreState.message)}</p>
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
              <strong>{t.source}</strong>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const ex = EXAMPLES.find((x) => x.id === e.target.value);
                    if (ex) {
                      setSource(ex.source);
                      e.currentTarget.value = "";
                    }
                  }}
                  style={{
                    padding: "0.35rem 0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    background: "#fff",
                    fontSize: 13,
                  }}
                  title={t.loadExampleTooltip}
                >
                  <option value="" disabled>
                    {t.loadExample}
                  </option>
                  {EXAMPLES.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onReset}
                  disabled={running}
                  style={{
                    padding: "0.4rem 0.8rem",
                    background: "#fff",
                    color: "#222",
                    border: "1px solid #888",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  title={t.resetTooltip}
                >
                  {t.reset}
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  disabled={running || !stepLoaded}
                  style={{
                    padding: "0.4rem 0.8rem",
                    background: "#fff",
                    color: "#222",
                    border: "1px solid #888",
                    borderRadius: 4,
                    cursor: stepLoaded ? "pointer" : "not-allowed",
                    fontWeight: 600,
                    opacity: stepLoaded ? 1 : 0.5,
                  }}
                  title={t.backTooltip}
                >
                  {t.back}
                </button>
                <button
                  type="button"
                  onClick={onStep}
                  disabled={running}
                  style={{
                    padding: "0.4rem 0.8rem",
                    background: "#fff",
                    color: "#222",
                    border: "1px solid #888",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  title={t.stepTooltip}
                >
                  {t.step}
                </button>
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
                  {running ? t.running : t.run}
                </button>
                <button
                  type="button"
                  onClick={onShare}
                  style={{
                    padding: "0.4rem 0.8rem",
                    background: "#fff",
                    color: "#222",
                    border: "1px solid #888",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  title={t.shareTooltip}
                >
                  {t.share}
                </button>
                {shareToast && (
                  <span style={{ color: "#0a7", fontSize: 13, marginLeft: 4 }}>
                    {shareToast}
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #2a2a2a",
                borderRadius: 4,
                overflow: "hidden",
                height: 420,
              }}
            >
              <Editor
                height="100%"
                defaultLanguage={ASM_LANG_ID}
                language={ASM_LANG_ID}
                theme="vs-dark"
                value={source}
                onChange={(v) => setSource(v ?? "")}
                onMount={onEditorMount}
                options={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 14,
                  minimap: { enabled: false },
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "off",
                  tabSize: 4,
                  renderWhitespace: "selection",
                }}
              />
            </div>

            <div style={{ marginTop: "1rem" }}>
              <strong>{t.output}</strong>
              <pre
                style={{
                  background: "#111",
                  color: "#eee",
                  padding: "0.75rem",
                  borderRadius: 4,
                  minHeight: 80,
                  whiteSpace: "pre-wrap",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {result?.stdout || (running ? t.running : t.noOutputYet)}
              </pre>
              {result?.error && (
                <div
                  style={{
                    background: "#fee",
                    border: "1px solid #c66",
                    padding: "0.6rem 0.8rem",
                    borderRadius: 4,
                    marginTop: "0.5rem",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 13,
                    color: "#900",
                  }}
                >
                  <div>
                    {t.errorAt(
                      result.error.stage,
                      result.error.line,
                      result.error.column,
                      result.error.message,
                    )}
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
                  {result.bytes > 0 && (
                    <>{t.bytesAssembled(result.bytes, hex(result.origin))} </>
                  )}
                  {result.steps > 0 && <>{t.stepsCount(result.steps)} </>}
                  {t.exitCodeLabel}{" "}
                  <code>{result.exit_code === null ? "—" : result.exit_code}</code>
                </div>
              )}
              {stepLog && (
                <details style={{ marginTop: "1rem" }}>
                  <summary style={{ cursor: "pointer", color: "#666", fontSize: 13 }}>
                    {t.stepLogSummary(stepLog.split("\n").filter(Boolean).length)}
                  </summary>
                  <pre
                    style={{
                      background: "#111",
                      color: "#aaa",
                      padding: "0.5rem 0.75rem",
                      borderRadius: 4,
                      maxHeight: 200,
                      overflow: "auto",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 12,
                    }}
                  >
                    {stepLog}
                  </pre>
                </details>
              )}
            </div>
          </section>

          <aside>
            <strong>{t.registers}</strong>
            {result?.registers ? (
              <table
                style={{
                  borderCollapse: "collapse",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
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
                {t.noRegistersYet}
              </div>
            )}

            <div style={{ marginTop: "1rem" }}>
              <strong>{t.flags}</strong>
              <div style={{ marginTop: 4 }}>
                {result?.registers
                  ? FLAG_BITS.map(([name, mask]) =>
                      flagBadge(name, (result.registers.flags & mask) !== 0),
                    )
                  : null}
              </div>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <strong style={{ display: "block", marginBottom: 4 }}>{t.devices}</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                <SevenSegment value={port199} />
                <TrafficLight value={port4} />
                <LedMatrix rows={ledRows} />
                <Stepper value={port7} steps={stepperSteps} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Screen text={videoText} />
              </div>
            </div>

            {memHex && (
              <div style={{ marginTop: "1rem" }}>
                <strong style={{ display: "block", marginBottom: 4 }}>
                  {t.memory}{" "}
                  <span style={{ color: "#888", fontWeight: 400, fontSize: 12 }}>
                    {t.memoryRangeLabel}
                  </span>
                </strong>
                <pre
                  style={{
                    background: "#111",
                    color: "#ddd",
                    padding: "0.5rem 0.6rem",
                    borderRadius: 4,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 11,
                    margin: 0,
                    maxHeight: 200,
                    overflow: "auto",
                  }}
                >
                  {(() => {
                    const tokens = memHex.split(" ");
                    const rows: string[] = [];
                    for (let i = 0; i < tokens.length; i += 16) {
                      const off = (0x100 + i)
                        .toString(16)
                        .toUpperCase()
                        .padStart(4, "0");
                      rows.push(`${off}: ${tokens.slice(i, i + 16).join(" ")}`);
                    }
                    return rows.join("\n");
                  })()}
                </pre>
              </div>
            )}
          </aside>
        </div>
      )}

      <footer style={{ marginTop: "2rem", color: "#666", fontSize: 13 }}>
        <a href="https://github.com/abuXsarkar/emu8086-modern">{t.footerLink}</a>
        {t.footerSeparator}
        {t.footerNote}
      </footer>
    </main>
  );
}
