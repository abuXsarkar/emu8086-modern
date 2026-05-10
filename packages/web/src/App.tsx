import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import init, {
  Emulator,
} from "../../wasm-api/pkg/emu8086_wasm_api.js";
import { ASM_LANG_ID, registerAsm8086 } from "./asm8086";
import { EXAMPLES } from "./examples";
import { SevenSegment } from "./SevenSegment";
import { TrafficLight } from "./TrafficLight";
import { LedMatrix } from "./LedMatrix";
import { Stepper } from "./Stepper";
import { Screen } from "./Screen";
import { Keyboard } from "./Keyboard";
import { Printer } from "./Printer";
import { Robot } from "./Robot";
import { DebuggerListPanel } from "./DebuggerListPanel";
import { DeviceSlot } from "./DeviceSlot";
import { TweaksPanel } from "./TweaksPanel";
import { ClassroomLayer, ClassroomPill } from "./classroom/ClassroomPanel";
import { useClassroomEditor } from "./classroom/useClassroomEditor";
import { TutorialPanel } from "./tutorials/TutorialPanel";
// Importing for side effects: each plugin self-registers via the SDK.
// Adding a third-party plugin = `import "@vendor/plugin"` in `./plugins`.
import "./plugins";
import { PluginGallery } from "./PluginGallery";
import { LOCALES, useLocaleId, useStrings } from "./i18n";
import type { RunRegisters } from "./registers";
import { formatValue, evaluate } from "./debugExpr";
import { recordEvent } from "./metrics";

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
    <span key={name} className={`flag-badge${on ? " on" : ""}`}>
      {name}
    </span>
  );
}

export function App() {
  const t = useStrings();
  const [localeId, setLocaleIdValue] = useLocaleId();
  const [editorTheme, setEditorTheme] = useState<"vs-dark" | "vs">(() => {
    try {
      const v = localStorage.getItem("emu8086.editor-theme");
      return v === "vs" ? "vs" : "vs-dark";
    } catch {
      return "vs-dark";
    }
  });
  const [coreState, setCoreState] = useState<CoreState>({ kind: "loading" });
  const [source, setSource] = useState<string>(() => initialSource());
  // Classroom editor bridge: streams student edits to the teacher
  // (when joined), the teacher's edits to the broadcast channel
  // (when broadcasting), or the teacher's edits as control_buffer
  // (when controlling a student). Returns readOnly when this client
  // is the controlled student so the editor locks until release.
  const { readOnly: classroomReadOnly } = useClassroomEditor(source, setSource);
  const [result, setResult] = useState<RunResultJson | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [stepLog, setStepLog] = useState<string>("");
  const [stepLoaded, setStepLoaded] = useState<boolean>(false);
  const [memHex, setMemHex] = useState<string>("");
  // Snapshot of memHex *before* the latest refresh, so the panel can
  // highlight cells that changed since the last step. Stored in a ref
  // (not state) so it doesn't trigger an extra render.
  const memHexPrevRef = useRef<string>("");
  const [port199, setPort199] = useState<number>(0);
  const [port4, setPort4] = useState<number>(0);
  const [ledRows, setLedRows] = useState<Uint8Array>(() => new Uint8Array(8));
  const [port7, setPort7] = useState<number>(0);
  const [stepperSteps, setStepperSteps] = useState<number>(0);
  const [videoText, setVideoText] = useState<string>("");
  const [pendingKeys, setPendingKeys] = useState<number>(0);
  const [printerPaper, setPrinterPaper] = useState<string>("");
  const [robotX, setRobotX] = useState<number>(0);
  const [robotY, setRobotY] = useState<number>(0);
  const [robotHeading, setRobotHeading] = useState<number>(0);
  const [robotCommands, setRobotCommands] = useState<number>(0);
  // Debugger watches + breakpoints. Both persisted via localStorage so
  // they survive a page reload alongside the source buffer.
  const [watches, setWatches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("emu8086.watches");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  });
  const [breakpoints, setBreakpoints] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("emu8086.breakpoints");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  });
  const [breakpointHit, setBreakpointHit] = useState<string>("");
  useEffect(() => {
    try {
      localStorage.setItem("emu8086.watches", JSON.stringify(watches));
    } catch {
      /* ignore */
    }
  }, [watches]);
  useEffect(() => {
    try {
      localStorage.setItem("emu8086.breakpoints", JSON.stringify(breakpoints));
    } catch {
      /* ignore */
    }
  }, [breakpoints]);
  // Mirror Monaco's vs/vs-dark choice onto `body.dark` so the
  // token-driven CSS palette flips together with the editor theme.
  // The inline pre-paint script in index.html handles the cold-load
  // case before React mounts, avoiding a flash of light theme.
  useEffect(() => {
    document.body.classList.toggle("dark", editorTheme === "vs-dark");
  }, [editorTheme]);
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
    setMemHex((prev) => {
      memHexPrevRef.current = prev;
      return hex;
    });
  }

  /** Stable port reader handed to plugins. Reads zero before the
   *  emulator boots (registered plugins shouldn't crash on first
   *  render). */
  function readPort(n: number): number {
    return emuRef.current ? emuRef.current.port_byte(n) : 0;
  }

  function refreshDevices() {
    if (!emuRef.current) return;
    setPort199(emuRef.current.port_byte(199));
    setPort4(emuRef.current.port_byte(4));
    setLedRows(emuRef.current.led_matrix_rows());
    setPort7(emuRef.current.port_byte(7));
    setStepperSteps(emuRef.current.stepper_steps());
    setVideoText(emuRef.current.video_text());
    setPendingKeys(emuRef.current.key_buffer_len());
    setPrinterPaper(emuRef.current.printer_paper());
    const r = emuRef.current.robot_state();
    setRobotX(r[0] ?? 0);
    setRobotY(r[1] ?? 0);
    setRobotHeading(r[2] ?? 0);
    setRobotCommands(emuRef.current.robot_commands());
  }

  function pushKey(byte: number) {
    if (!emuRef.current) return;
    emuRef.current.push_key(byte);
    setPendingKeys(emuRef.current.key_buffer_len());
  }

  // The share/file-load channel doubles as a generic "click feedback"
  // toast. Routing every transient message through one slot keeps the
  // status-region a11y semantics (role="status", aria-live="polite")
  // applied uniformly without competing live regions.
  const toastTimerRef = useRef<number | null>(null);
  function flashToast(msg: string, ms = 1800) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setShareToast(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setShareToast("");
      toastTimerRef.current = null;
    }, ms);
  }

  function onShare() {
    recordEvent("share");
    const fragment = encodeShareFragment(source);
    const url = `${window.location.origin}${window.location.pathname}#code=${fragment}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => flashToast(t.shareCopied))
        .catch(() => {
          window.location.hash = `code=${fragment}`;
          flashToast(t.shareInUrl);
        });
    } else {
      window.location.hash = `code=${fragment}`;
      flashToast(t.shareInUrl);
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
    // Paper-aesthetic Monaco themes. Hex literals (not oklch) because
    // Monaco's tokenizer rejects modern color syntax. Values are
    // hand-mapped from the v2 design's --accent / --ink / --muted
    // ramps so the editor blends with the surrounding token palette.
    monacoApi.editor.defineTheme("emu-paper", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "7f1d1d", fontStyle: "bold" },
        { token: "number", foreground: "1f4a8a" },
        { token: "string", foreground: "2d8a4e" },
        { token: "comment", foreground: "5a5a55", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#f4f2ec",
        "editor.foreground": "#0c0c0c",
        "editor.lineHighlightBackground": "#ebe8df",
        "editorLineNumber.foreground": "#5a5a55",
        "editorGutter.background": "#f4f2ec",
      },
    });
    monacoApi.editor.defineTheme("emu-paper-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "c97f7f", fontStyle: "bold" },
        { token: "number", foreground: "8ab6e0" },
        { token: "string", foreground: "6cba88" },
        { token: "comment", foreground: "807c70", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#15140f",
        "editor.foreground": "#ece9df",
        "editor.lineHighlightBackground": "#1d1c16",
        "editorLineNumber.foreground": "#807c70",
        "editorGutter.background": "#15140f",
      },
    });
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
    recordEvent("run");
    setRunning(true);
    setBreakpointHit("");
    try {
      // Always run through the stateful Emulator so device state, memory,
      // step history (for Back), and keyboard input share a single source
      // of truth. Breakpoint predicates only apply when the user has set
      // any; otherwise the loop runs flat-out until halt or the cap.
      if (!emuRef.current) emuRef.current = new Emulator();
      const loadJson = emuRef.current.load_source(source);
      const loadParsed = JSON.parse(loadJson) as RunResultJson;
      if (!loadParsed.ok || loadParsed.error) {
        recordEvent("assemble_error");
        setResult(loadParsed);
        applyDiagnostic(loadParsed.error);
        lineMapRef.current = [];
        return;
      }
      lineMapRef.current = loadParsed.line_map ?? [];
      let stepsTaken = 0;
      let halted = false;
      let exit_code: number | null = null;
      let stdoutAcc = "";
      let lastRegs: RunRegisters = loadParsed.registers;
      let hit: { expr: string; index: number } | null = null;
      const cap = 1_000_000;
      const hasBreakpoints = breakpoints.length > 0;
      for (let n = 0; n < cap; n++) {
        const stepRes = JSON.parse(emuRef.current.step()) as StepResult;
        stepsTaken += 1;
        stdoutAcc += stepRes.stdout;
        lastRegs = stepRes.registers;
        if (stepRes.halted) {
          halted = true;
          exit_code = stepRes.exit_code ?? null;
          break;
        }
        if (hasBreakpoints) {
          // Stop the run as soon as ANY breakpoint expression evaluates
          // truthy. Index used so the toast can point at the offending
          // row in the breakpoint list.
          for (let i = 0; i < breakpoints.length; i++) {
            const r = evaluate(breakpoints[i], stepRes.registers);
            if (r.ok && r.truthy) {
              hit = { expr: breakpoints[i], index: i };
              break;
            }
          }
          if (hit) break;
        }
      }
      const synthesized: RunResultJson = {
        ok: true,
        stdout: stdoutAcc,
        stdout_lossy: false,
        exit_code,
        steps: stepsTaken,
        halted,
        error: null,
        registers: lastRegs,
        bytes: loadParsed.bytes,
        origin: loadParsed.origin,
        line_map: loadParsed.line_map,
      };
      if (hit) recordEvent("run_breakpoint");
      else if (halted) recordEvent("run_halted");
      else recordEvent("run_out_of_steps");
      setResult(synthesized);
      applyDiagnostic(null);
      setStepLog("");
      // Keep the step session live even on halt so Back can rewind into
      // the just-finished run. The history is in the wasm core; closing
      // it here would just hide it.
      setStepLoaded(true);
      refreshDevices();
      refreshMemHex(lastRegs);
      if (hit) {
        setBreakpointHit(`paused at \`${hit.expr}\` (#${hit.index + 1})`);
        // Highlight the source line of the *current* instruction so
        // the student can see where execution stopped.
        const ip = lastRegs.ip;
        const lm = lineMapRef.current;
        for (let i = lm.length - 1; i >= 0; i--) {
          if (ip >= lm[i][0]) {
            const sourceOff = lm[i][1];
            const lineNum = byteOffsetToLine(source, sourceOff);
            highlightLine(lineNum);
            break;
          }
        }
      } else {
        highlightLine(0);
      }
      return;
    } catch (e) {
      recordEvent("runtime_error");
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

  // Once wasm is ready, do a silent initial reset so the memory hex and
  // device panels render against the current source instead of staying
  // blank until the user first clicks something. The toast suppression
  // path (srcOverride) is reused so this doesn't fire `resetDone`.
  const initialResetDoneRef = useRef(false);
  useEffect(() => {
    if (coreState.kind !== "ready") return;
    if (initialResetDoneRef.current) return;
    initialResetDoneRef.current = true;
    onReset(source);
    // `source` is intentionally a snapshot — re-running on every keystroke
    // would clobber the user's run state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreState.kind]);

  interface StepResult {
    stdout: string;
    halted: boolean;
    mnemonic: string;
    stopped: string | null;
    exit_code: number | null;
    registers: RunRegisters;
  }

  // Reset the step session: assemble the source, point the stateful
  // Emulator at a fresh image, clear the visible step log and re-render
  // registers at the program's entry point. `srcOverride` lets callers
  // (e.g. the example picker) reset against a source they've just
  // staged, before React has flushed the `setSource` update.
  const onReset = (srcOverride?: string) => {
    if (coreState.kind !== "ready") return;
    if (srcOverride === undefined) recordEvent("reset");
    const src = srcOverride ?? source;
    if (!emuRef.current) emuRef.current = new Emulator();
    const json = emuRef.current.load_source(src);
    const parsed = JSON.parse(json) as RunResultJson;
    if (!parsed.ok) {
      setResult(parsed);
      applyDiagnostic(parsed.error);
      setStepLoaded(false);
      setBreakpointHit("");
      flashToast(t.fixErrorsFirst);
      return;
    }
    setResult(parsed);
    applyDiagnostic(null);
    setStepLog("");
    setStepLoaded(true);
    setBreakpointHit("");
    lineMapRef.current = parsed.line_map ?? [];
    // Highlight the line of the very first instruction (current IP).
    const linearIp =
      ((parsed.registers.cs ?? 0) << 4) + (parsed.registers.ip ?? 0);
    highlightLine(lineForIp(src, lineMapRef.current, linearIp));
    refreshMemHex(parsed.registers);
    refreshDevices();
    if (srcOverride === undefined) flashToast(t.resetDone);
  };

  const onBack = () => {
    if (coreState.kind !== "ready") return;
    if (!stepLoaded || !emuRef.current) return;
    const json = emuRef.current.step_back();
    const parsed = JSON.parse(json) as StepResult;
    if (!parsed.mnemonic) {
      flashToast(t.nothingToUndo);
      return;
    }
    recordEvent("back");
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
    recordEvent("step");
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
    // Stay in the step session even on halt so Back can rewind into the
    // halted instruction. The wasm history is still there.
    refreshMemHex(parsed.registers);
    refreshDevices();
  };

  const errorLine = result?.error?.line ?? 0;
  const sourceLines = useMemo(() => source.split("\n"), [source]);

  return (
    <main
      className="app-root"
      style={{
        padding: "1.5rem 2rem",
        maxWidth: 1180,
        margin: "0 auto",
        lineHeight: 1.45,
      }}
    >
      <header className="app-header">
        <div className="brand">
          <h1>{t.appTitle}</h1>
          <p className="lead">
            {t.appLead}
            <strong>{t.appLeadRunVerb}</strong>
            {".  "}
          </p>
        </div>
        <div className="header-controls">
          <select
            className="select-tokenized"
            aria-label={t.themeLabel}
            value={editorTheme}
            onChange={(e) => {
              const v = e.target.value === "vs" ? "vs" : "vs-dark";
              recordEvent("theme_change");
              setEditorTheme(v);
              try {
                localStorage.setItem("emu8086.editor-theme", v);
              } catch {
                /* ignore */
              }
            }}
            title={t.themeLabel}
          >
            <option value="vs-dark">{t.themeDark}</option>
            <option value="vs">{t.themeLight}</option>
          </select>
          <select
            className="select-tokenized"
            aria-label={t.languageLabel}
            value={localeId}
            onChange={(e) => {
              recordEvent("language_change");
              setLocaleIdValue(e.target.value as typeof localeId);
            }}
            title={t.languageLabel}
          >
            {LOCALES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <ClassroomPill />
        </div>
      </header>

      {coreState.kind === "loading" && <p>{t.loadingWasm}</p>}
      {coreState.kind === "error" && (
        <p style={{ color: "#c00" }}>{t.loadWasmFailed(coreState.message)}</p>
      )}

      {coreState.kind === "ready" && (
        <div className="app-layout">
          <aside className="left-rail" aria-label={t.loadExample}>
            <div className="pane" aria-labelledby="hd-load-example">
              <strong className="smallcaps" id="hd-load-example">{t.loadExample}</strong>
              <select
                className="full-width-select"
                aria-label={t.loadExample}
                defaultValue=""
                onChange={(e) => {
                  const ex = EXAMPLES.find((x) => x.id === e.target.value);
                  if (ex) {
                    recordEvent("example_loaded");
                    setSource(ex.source);
                    onReset(ex.source);
                    e.currentTarget.value = "";
                  }
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
            </div>
            <div className="pane" aria-labelledby="hd-drop-file">
              <strong className="smallcaps" id="hd-drop-file">{t.dropFileLabel}</strong>
              <p className="drop-hint">{t.dropFileHint}</p>
            </div>
          </aside>
          <section aria-labelledby="hd-source">
            <div className="run-toolbar">
              <strong className="smallcaps" id="hd-source">{t.source}</strong>
              <div className="run-toolbar-controls">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onReset()}
                  disabled={running}
                  title={t.resetTooltip}
                >
                  {t.reset}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={onBack}
                  disabled={running || !stepLoaded}
                  title={t.backTooltip}
                >
                  {t.back}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={onStep}
                  disabled={running}
                  title={t.stepTooltip}
                >
                  {t.step}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={onRun}
                  disabled={running}
                >
                  {running ? t.running : t.run}
                </button>
                <button
                  type="button"
                  className="btn accent"
                  onClick={onShare}
                  title={t.shareTooltip}
                >
                  {t.share}
                </button>
                <span
                  role="status"
                  aria-live="polite"
                  className="share-toast"
                >
                  {shareToast}
                </span>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                // Only accept text-file drops; suppress the browser's
                // default "open as page" behavior.
                if (
                  e.dataTransfer.types.includes("Files") ||
                  e.dataTransfer.types.includes("text/plain")
                ) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(e) => {
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                e.preventDefault();
                // Hard-cap at 1 MiB so a stray binary drop doesn't OOM
                // the editor; lab .asm files are tens of KB at most.
                if (file.size > 1024 * 1024) {
                  setShareToast("file too large (>1 MiB)");
                  setTimeout(() => setShareToast(""), 2500);
                  return;
                }
                file
                  .text()
                  .then((text) => {
                    setSource(text);
                    setShareToast(`loaded ${file.name}`);
                    setTimeout(() => setShareToast(""), 2500);
                  })
                  .catch(() => {
                    setShareToast("couldn't read file");
                    setTimeout(() => setShareToast(""), 2500);
                  });
              }}
              className="source-editor-frame pane"
            >
              <Editor
                height="100%"
                defaultLanguage={ASM_LANG_ID}
                language={ASM_LANG_ID}
                theme={editorTheme === "vs-dark" ? "emu-paper-dark" : "emu-paper"}
                value={source}
                onChange={(v) => setSource(v ?? "")}
                onMount={onEditorMount}
                options={{
                  fontFamily:
                    "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 13.5,
                  minimap: { enabled: false },
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "off",
                  tabSize: 4,
                  renderWhitespace: "selection",
                  readOnly: classroomReadOnly,
                }}
              />
            </div>

            <div className="output-region" aria-labelledby="hd-output">
              <strong className="smallcaps" id="hd-output">{t.output}</strong>
              <pre className="output-stdout mono">
                {result?.stdout || (running ? t.running : t.noOutputYet)}
              </pre>
              {result?.ok && !running && !result.error && (() => {
                // Pick one of three states. The banner addresses the
                // legacy emu8086 "did my program actually run?" UX
                // gap — students used to a modal "Program completed"
                // dialog get a clearly-styled inline equivalent here.
                const ranOut = !result.halted && result.steps > 0;
                const halted = result.halted;
                const noStdout = (result.stdout ?? "").length === 0;
                if (!ranOut && !halted) return null;
                const isHalted = halted;
                const icon = isHalted ? "✓" : "⏱";
                const title = isHalted ? t.statusHalted : t.statusOutOfSteps;
                const hint = isHalted
                  ? t.statusHaltedHint(result.steps)
                  : t.statusOutOfStepsHint(result.steps);
                return (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`status-banner ${isHalted ? "halted" : "warn"}`}
                  >
                    <div className="status-banner-title">
                      <span className={`status-dot ${isHalted ? "" : "warn"}`} />
                      <span>{icon} {title}</span>
                    </div>
                    <div className="status-banner-hint">
                      {hint}
                      {isHalted && noStdout && (
                        <>
                          {" "}
                          {t.statusNoStdoutHint}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              {result?.error && (
                <div role="alert" className="error-banner mono">
                  <div>
                    {t.errorAt(
                      result.error.stage,
                      result.error.line,
                      result.error.column,
                      result.error.message,
                    )}
                  </div>
                  {errorLine > 0 && errorLine <= sourceLines.length && (
                    <pre className="error-banner-snippet">
                      {`${errorLine.toString().padStart(3)} | ${sourceLines[errorLine - 1]}`}
                    </pre>
                  )}
                </div>
              )}
              {result?.ok && (
                <div className="exit-line mono">
                  {result.bytes > 0 && (
                    <>{t.bytesAssembled(result.bytes, hex(result.origin))} </>
                  )}
                  {result.steps > 0 && <>{t.stepsCount(result.steps)} </>}
                  {t.exitCodeLabel}{" "}
                  <code>{result.exit_code === null ? "—" : result.exit_code}</code>
                </div>
              )}
              {stepLog && (
                <details className="step-log">
                  <summary>
                    {t.stepLogSummary(stepLog.split("\n").filter(Boolean).length)}
                  </summary>
                  <pre className="step-log-pre mono">{stepLog}</pre>
                </details>
              )}
            </div>
          </section>

          <aside className="aside-region" aria-label={t.devices}>
            <section className="aside-section" aria-labelledby="hd-registers">
              <strong className="smallcaps" id="hd-registers">{t.registers}</strong>
              {result?.registers ? (
                <table className="reg-table mono">
                  <tbody>
                    {(["ax", "bx", "cx", "dx", "si", "di", "bp", "sp", "ip"] as const).map(
                      (k) => (
                        <tr key={k}>
                          <td className="reg-name">{k.toUpperCase()}</td>
                          <td className="reg-val">
                            0x{hex(result.registers[k] ?? 0)}
                          </td>
                        </tr>
                      ),
                    )}
                    {(["cs", "ds", "es", "ss"] as const).map((k) => (
                      <tr key={k}>
                        <td className="reg-name">{k.toUpperCase()}</td>
                        <td className="reg-val">
                          0x{hex(result.registers[k] ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="aside-empty">{t.noRegistersYet}</div>
              )}
            </section>

            <section className="aside-section" aria-labelledby="hd-flags">
              <strong className="smallcaps" id="hd-flags">{t.flags}</strong>
              <div className="flags-row">
                {result?.registers
                  ? FLAG_BITS.map(([name, mask]) =>
                      flagBadge(name, (result.registers.flags & mask) !== 0),
                    )
                  : null}
              </div>
            </section>

            <section className="aside-section" aria-labelledby="hd-devices">
              <strong className="smallcaps" id="hd-devices">{t.devices}</strong>
              <div className="device-row">
                <DeviceSlot id="seg" title="7-SEG · port 199" defaultPos={{ x: 80, y: 100 }}>
                  <SevenSegment value={port199} />
                </DeviceSlot>
                <DeviceSlot id="traffic" title="TRAFFIC · port 4" defaultPos={{ x: 240, y: 100 }}>
                  <TrafficLight value={port4} />
                </DeviceSlot>
                <DeviceSlot id="led" title="LED 8×8 · ports 8–F" defaultPos={{ x: 400, y: 120 }}>
                  <LedMatrix rows={ledRows} />
                </DeviceSlot>
                <DeviceSlot id="stepper" title="STEPPER · port 7" defaultPos={{ x: 580, y: 100 }}>
                  <Stepper value={port7} steps={stepperSteps} />
                </DeviceSlot>
                <DeviceSlot id="kbd" title="KEYBOARD" defaultPos={{ x: 80, y: 320 }}>
                  <Keyboard pendingKeys={pendingKeys} onKey={pushKey} />
                </DeviceSlot>
                <DeviceSlot id="printer" title="PRINTER" defaultPos={{ x: 360, y: 340 }}>
                  <Printer paper={printerPaper} />
                </DeviceSlot>
                <DeviceSlot id="robot" title="ROBOT" defaultPos={{ x: 600, y: 340 }}>
                  <Robot
                    x={robotX}
                    y={robotY}
                    heading={robotHeading}
                    commands={robotCommands}
                  />
                </DeviceSlot>
              </div>
              <div className="screen-row">
                <DeviceSlot id="screen" title="SCREEN · int 10h" defaultPos={{ x: 80, y: 480 }}>
                  <Screen text={videoText} />
                </DeviceSlot>
              </div>
              <div className="device-row">
                <PluginGallery
                  port={readPort}
                  stepCount={result?.steps ?? 0}
                />
              </div>
            </section>

            {memHex && (
              <section className="aside-section" aria-labelledby="hd-memory">
                <strong className="smallcaps" id="hd-memory">
                  {t.memory}{" "}
                  <span className="memory-range-label">
                    {t.memoryRangeLabel}
                  </span>
                </strong>
                <pre className="mem-hex mono">
                  {(() => {
                    const tokens = memHex.split(" ");
                    const prev = memHexPrevRef.current.split(" ");
                    const rowJSX: React.ReactNode[] = [];
                    for (let i = 0; i < tokens.length; i += 16) {
                      const off = (0x100 + i)
                        .toString(16)
                        .toUpperCase()
                        .padStart(4, "0");
                      const cells: React.ReactNode[] = [];
                      for (let j = 0; j < 16 && i + j < tokens.length; j++) {
                        const tok = tokens[i + j];
                        const changed =
                          prev.length > i + j && prev[i + j] !== tok;
                        cells.push(
                          <span
                            key={j}
                            className={changed ? "mem-cell changed" : "mem-cell"}
                          >
                            {j > 0 ? " " : ""}
                            {tok}
                          </span>,
                        );
                      }
                      rowJSX.push(
                        <div key={i}>
                          <span className="mem-off">{off}: </span>
                          {cells}
                        </div>,
                      );
                    }
                    return rowJSX;
                  })()}
                </pre>
              </section>
            )}

            <DebuggerListPanel
              title="watches"
              placeholder="AX, ZF, IP — register or flag"
              entries={watches}
              setEntries={setWatches}
              renderValue={(expr) =>
                result?.registers ? formatValue(expr, result.registers) : "—"
              }
            />

            <DebuggerListPanel
              title="breakpoints"
              placeholder="AX == 5 — pauses Run when truthy"
              entries={breakpoints}
              setEntries={setBreakpoints}
              renderValue={(expr) =>
                result?.registers
                  ? evaluate(expr, result.registers).ok
                    ? formatValue(expr, result.registers)
                    : "?"
                  : "—"
              }
            />
            {breakpointHit && (
              <p className="breakpoint-hit mono">{breakpointHit}</p>
            )}
          </aside>
        </div>
      )}

      <footer className="app-footer mono">
        <a href="https://github.com/abuXsarkar/emu8086-modern">{t.footerLink}</a>
        {t.footerSeparator}
        {t.footerNote}
      </footer>
      <TweaksPanel />
      <ClassroomLayer currentSource={source} />
      <TutorialPanel
        onLoadCode={(src) => {
          setSource(src);
          onReset(src);
        }}
      />
    </main>
  );
}
