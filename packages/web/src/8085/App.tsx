import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — wasm-pack output has no .d.ts at this path; we type the shape inline below.
import init, { Emulator } from "../../../wasm-api-8085/pkg/modern8085_wasm_api.js";
import { ASM_LANG_ID, registerAsm8085 } from "./asm8085";
import { OPCODE_DOCS } from "./asm8085_docs";
import { DEFAULT_SOURCE, EXAMPLES, type Example } from "./examples";
import { ClassroomLayer, ClassroomPill } from "../classroom/ClassroomPanel";
import { useClassroomEditor } from "../classroom/useClassroomEditor";
import { LOCALES, useLocaleId, useStrings } from "../i18n";
import { SevenSegment } from "./devices/SevenSegment";
import { TrafficLight } from "./devices/TrafficLight";
import { LedBar } from "./devices/LedBar";
import { HexKeypad } from "./devices/HexKeypad";
import { Stepper } from "./devices/Stepper";
import { Printer } from "./devices/Printer";
import { Screen } from "./devices/Screen";
import { Robot, applyRobotCommand, initialRobotState, type RobotState } from "./devices/Robot";
import { Tutorials } from "./tutorials/TutorialPanel";

const STORAGE_KEY = "modern8085.source";
const THEME_KEY = "modern8085.editor-theme";
const SEEN_QUICKSTART_KEY = "modern8085.seen-quickstart";

type CoreState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type RegState = {
  a: number; b: number; c: number; d: number; e: number; h: number; l: number;
  sp: number; pc: number;
  s: boolean; z: boolean; ac: boolean; p: boolean; cy: boolean;
  ie: boolean; im: number;
  origin: number; bytes_loaded: number;
  last_stop: string | null;
  halted: boolean;
  cycles: number;
};

type LoadResult = {
  ok: boolean;
  error?: string | null;
  line?: number;
  origin: number;
  bytes_loaded: number;
  hints: Array<[number, string]>;
  symbols: Array<[string, number]>;
};

/// Decode a `#code=...` share-link fragment if present. The encoding
/// is base64url so the link survives copy/paste across chat clients
/// without needing extra escaping. Returns null if no share fragment.
function decodeShareFragment(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const encoded = params.get("code");
  if (!encoded) return null;
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
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
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function initialSource(): string {
  if (typeof window === "undefined") return DEFAULT_SOURCE;
  // A share-link in the URL beats both stored buffer and default —
  // someone went to the trouble of sending a specific program.
  const shared = decodeShareFragment();
  if (shared !== null) return shared;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SOURCE;
  } catch {
    return DEFAULT_SOURCE;
  }
}

function hex(value: number, pad: number): string {
  return value.toString(16).toUpperCase().padStart(pad, "0");
}

const REGS_8 = ["a", "b", "c", "d", "e", "h", "l"] as const;
const FLAGS = ["s", "z", "ac", "p", "cy"] as const;

export function App() {
  const t = useStrings();
  const [localeId, setLocaleIdValue] = useLocaleId();
  const [source, setSource] = useState<string>(initialSource);
  // Classroom hook syncs `source` to/from the shared session when a
  // teacher is broadcasting. readOnly goes true on a student whose
  // editor the teacher has handed control to (or that hasn't been
  // granted control yet). Same chassis as the 8086 IDE — the
  // protocol doesn't care about the ISA, it just relays text.
  const { readOnly: classroomReadOnly } = useClassroomEditor(source, setSource);
  const [coreState, setCoreState] = useState<CoreState>({ kind: "loading" });
  const [reg, setReg] = useState<RegState | null>(null);
  /// The previous register snapshot — used to compute which cells
  /// changed in the latest update so the UI can flash them. Cleared
  /// on Reset / Run-Fast (where per-instruction diffs would be too
  /// noisy to be useful).
  const prevRegRef = useRef<RegState | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [hints, setHints] = useState<Array<[number, string]>>([]);
  const [symbols, setSymbols] = useState<Array<[string, number]>>([]);
  const [memBase, setMemBase] = useState<number>(0x2050);
  const [memHex, setMemHex] = useState<string>("");
  /// Snapshot of all 256 IO ports — refreshed after every step or
  /// chunked-run tick. JS-side devices (the seven-segment shipping
  /// in this PR, plus the LED matrix / traffic light / hex keypad
  /// that follow) read from this string the same way the memory
  /// inspector reads from `memHex`.
  const [portsHex, setPortsHex] = useState<string>("00".repeat(256));
  /// Which port the seven-segment listens on. Default 00H matches
  /// the textbook lab exercise "drive a 7-seg from OUT 00H".
  const [sevenSegPort, setSevenSegPort] = useState<number>(0x00);
  /// Traffic-light listens on port 01H by default.
  const [trafficPort, setTrafficPort] = useState<number>(0x01);
  /// LED bar listens on port 02H by default.
  const [ledBarPort, setLedBarPort] = useState<number>(0x02);
  /// Hex keypad writes to port 03H by default. Students read with
  /// `IN 03H` to get the last pressed key.
  const [keypadPort, setKeypadPort] = useState<number>(0x03);
  /// Stepper motor watches port 04H.
  const [stepperPort, setStepperPort] = useState<number>(0x04);
  /// Printer port 05H — captures every OUT byte to its port via the
  /// io_log drain (no lost repeats). Buffer persists across Step
  /// ticks; Reset / clear button wipes it.
  const [printerPort, setPrinterPort] = useState<number>(0x05);
  const [printerBuffer, setPrinterBuffer] = useState<string>("");
  /// Screen device on port 06H — interprets control bytes (LF, CR,
  /// BS, FF) the way a tty would.
  const [screenPort, setScreenPort] = useState<number>(0x06);
  const [screenBuffer, setScreenBuffer] = useState<string>("");
  /// Robot turtle on port 07H — each OUT byte is a movement
  /// command (see Robot.tsx).
  const [robotPort, setRobotPort] = useState<number>(0x07);
  const [robot, setRobot] = useState<RobotState>(initialRobotState);

  /// Drain the wasm io_log and append printer-port bytes to the
  /// printer buffer. Called from every place that updates emu state
  /// (step, run loop, slow tick) so the printer keeps up with the
  /// program in any speed.
  const drainIo = useCallback(() => {
    const emu = emuRef.current;
    if (!emu) return;
    const log = emu.drain_io_log();
    if (log.length === 0) return;
    let printerAppend = "";
    let screenAppend = "";
    let screenClear = false;
    let robotState: RobotState | null = null;
    for (let i = 0; i + 3 < log.length; i += 4) {
      const port = parseInt(log.slice(i, i + 2), 16);
      const byte = parseInt(log.slice(i + 2, i + 4), 16);
      if (port === printerPort) {
        printerAppend += byte >= 0x20 && byte < 0x7F ? String.fromCharCode(byte) : ".";
      }
      if (port === screenPort) {
        // Screen handles a few control bytes like a tty.
        if (byte === 0x0A) screenAppend += "\n";
        else if (byte === 0x0D) screenAppend += "\r";
        else if (byte === 0x08) screenAppend += "\b";
        else if (byte === 0x0C) { screenAppend = ""; screenClear = true; }
        else if (byte >= 0x20 && byte < 0x7F) screenAppend += String.fromCharCode(byte);
      }
      if (port === robotPort) {
        robotState = applyRobotCommand(robotState ?? robot, byte);
      }
    }
    if (printerAppend.length > 0) {
      setPrinterBuffer((b) => (b + printerAppend).slice(-4096));
    }
    if (screenClear || screenAppend.length > 0) {
      setScreenBuffer((b) => {
        const base = screenClear ? "" : b;
        // Apply backspaces inline so the displayed buffer stays small.
        let next = base;
        for (const ch of screenAppend) {
          if (ch === "\b") next = next.slice(0, -1);
          else next += ch;
        }
        return next.slice(-4096);
      });
    }
    if (robotState !== null) {
      setRobot(robotState);
    }
  }, [printerPort, screenPort, robotPort, robot]);

  const portValueAt = useCallback(
    (port: number) => parseInt(portsHex.slice(port * 2, port * 2 + 2), 16) || 0,
    [portsHex],
  );
  const [memRadix, setMemRadix] = useState<"hex" | "dec" | "ascii">("hex");
  /// Count of explicit Step clicks since the last Reset / Run / Load /
  /// Example pick. Powers the ↶ Back button — replaying N-1 steps from
  /// a fresh emulator is O(N) but N is tiny (≤ a few hundred) for any
  /// reasonable lab program, so the simple approach is faster to
  /// implement and easier to reason about than carrying a snapshot
  /// stack across the wasm boundary.
  const [stepCount, setStepCount] = useState(0);
  /// Last example object (with its input pokes) for accurate replay
  /// when the source came from the Examples menu.
  const lastExampleRef = useRef<Example | null>(null);

  const [showQuickstart, setShowQuickstart] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      // Show once per browser/device. Anyone who's been here before
      // has already touched at least one toolbar button.
      return !localStorage.getItem(SEEN_QUICKSTART_KEY);
    } catch {
      return true;
    }
  });
  const dismissQuickstart = useCallback(() => {
    setShowQuickstart(false);
    try {
      localStorage.setItem(SEEN_QUICKSTART_KEY, "1");
    } catch { /* */ }
  }, []);
  const [theme, setTheme] = useState<"vs" | "vs-dark">(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "vs-dark" ? "vs-dark" : "vs";
    } catch {
      return "vs";
    }
  });
  const [running, setRunning] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  /// Per-step delay (ms). 0 means "as fast as the budget loop runs"
  /// — keeps the existing chunked-run path. Slow / Crawl drive a
  /// step-by-step path so students can watch each instruction
  /// execute. Educational visualization is what every existing 8085
  /// simulator I could find is missing.
  const [speed, setSpeed] = useState<"fast" | "slow" | "crawl">(() => {
    try {
      const v = localStorage.getItem("modern8085.speed");
      return v === "slow" || v === "crawl" ? v : "fast";
    } catch {
      return "fast";
    }
  });
  useEffect(() => {
    try { localStorage.setItem("modern8085.speed", speed); } catch { /* */ }
  }, [speed]);

  /// When set, picking an example from the dropdown also kicks off a
  /// Run (at the current speed). Saves a click for the common
  /// "load → run" flow students use to skim outputs.
  const [autoRun, setAutoRun] = useState<boolean>(() => {
    try { return localStorage.getItem("modern8085.autorun") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("modern8085.autorun", autoRun ? "1" : "0"); } catch { /* */ }
  }, [autoRun]);

  const emuRef = useRef<Emulator | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const abortRef = useRef(false);

  // ───── boot wasm + register Monaco lang ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    init()
      .then(() => {
        if (cancelled) return;
        emuRef.current = new Emulator();
        setCoreState({ kind: "ready" });
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        setCoreState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ───── persist source ──────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {
      /* quota / disabled */
    }
  }, [source]);

  // ───── apply theme ─────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* */ }
    if (theme === "vs-dark") document.body.classList.add("dark");
    else document.body.classList.remove("dark");
  }, [theme]);

  const updateState = useCallback((json: string) => {
    try {
      const s = JSON.parse(json) as RegState;
      setReg(s);
      // Refresh memory inspector at the current base.
      const emu = emuRef.current;
      if (emu) {
        setMemHex(emu.mem(memBase, 64));
        setPortsHex(emu.ports(0, 256));
        drainIo();
      }
    } catch (err) {
      setDiag(`internal: failed to parse state — ${String(err)}`);
    }
  }, [memBase]);

  /// Names of registers whose value just changed; cells flash for a
  /// brief moment after a Step or a Slow/Crawl tick. Cleared after a
  /// timeout matching the typical step cadence.
  const [changedRegs, setChangedRegs] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!reg) {
      prevRegRef.current = null;
      return;
    }
    const prev = prevRegRef.current;
    prevRegRef.current = reg;
    if (!prev) return;
    const diff = new Set<string>();
    for (const k of REGS_8) if (prev[k] !== reg[k]) diff.add(k);
    if (prev.sp !== reg.sp) diff.add("sp");
    if (prev.pc !== reg.pc) diff.add("pc");
    for (const f of FLAGS) if (prev[f] !== reg[f]) diff.add(f);
    if (diff.size === 0) return;
    setChangedRegs(diff);
    const t = setTimeout(() => setChangedRegs(new Set()), 700);
    return () => clearTimeout(t);
  }, [reg]);

  // ───── editor / monaco wiring ─────────────────────────────────
  const onEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerAsm8085(monaco);
    monaco.editor.setModelLanguage(editor.getModel()!, ASM_LANG_ID);
  }, []);

  const highlightCurrentLine = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const emu = emuRef.current;
    if (!editor || !monaco || !emu) return;
    const line = emu.line_for_pc();
    if (!line) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      return;
    }
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: "active-line", marginClassName: "active-line-margin" },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(line);
  }, []);

  // ───── actions ─────────────────────────────────────────────────
  const setEditorMarker = useCallback((line: number | null, message: string | null) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    if (line === null || message === null) {
      monaco.editor.setModelMarkers(model, "asm8085", []);
      return;
    }
    monaco.editor.setModelMarkers(model, "asm8085", [
      {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line),
        message,
        severity: monaco.MarkerSeverity.Error,
      },
    ]);
  }, []);

  const doLoad = useCallback((): boolean => {
    const emu = emuRef.current;
    if (!emu) return false;
    setDiag(null);
    const result = JSON.parse(emu.load(source)) as LoadResult;
    setHints(result.hints ?? []);
    setSymbols(result.symbols ?? []);
    if (!result.ok) {
      setDiag(result.error ?? "assemble failed");
      setEditorMarker(result.line && result.line > 0 ? result.line : null, result.error ?? "assemble failed");
      return false;
    }
    setEditorMarker(null, null);
    setMemBase(result.origin);
    updateState(emu.state());
    return true;
  }, [source, updateState, setEditorMarker]);

  const doStep = useCallback(() => {
    const emu = emuRef.current;
    if (!emu) return;
    if (!doLoadIfFreshSource()) return;
    updateState(emu.step());
    highlightCurrentLine();
    setStepCount((c) => c + 1);
  }, [updateState, highlightCurrentLine]);

  /// Tracks whether the editor source has changed since the last
  /// `load()` so Step / Run reassemble before stepping. Avoids the
  /// confusion of "I edited the source, why is it running the old
  /// program?" common in sim8085 and GNUSim8085.
  const lastLoadedSrcRef = useRef<string | null>(null);
  const doLoadIfFreshSource = useCallback((): boolean => {
    if (lastLoadedSrcRef.current !== source) {
      const ok = doLoad();
      if (!ok) return false;
      lastLoadedSrcRef.current = source;
    }
    return true;
  }, [doLoad, source]);

  const doRun = useCallback(async () => {
    const emu = emuRef.current;
    if (!emu) return;
    if (!doLoadIfFreshSource()) return;
    setRunning(true);
    abortRef.current = false;
    setStepCount(0); // Run resets the time-travel anchor

    // Slow / Crawl take a step-by-step path so students can watch
    // each instruction. The per-step delay drives both the visible
    // pace and how often we refresh the register pane + memory view
    // + line highlight — once per step, just like single-step.
    if (speed !== "fast") {
      const delayMs = speed === "crawl" ? 800 : 180;
      const MAX_STEPS = 100_000; // safety cap; very generous for a slow run
      for (let i = 0; i < MAX_STEPS && !abortRef.current; i++) {
        const state = JSON.parse(emu.step()) as RegState;
        setReg(state);
        highlightCurrentLine();
        setMemHex(emu.mem(memBase, 64));
        setPortsHex(emu.ports(0, 256));
        drainIo();
        if (state.halted || (state.last_stop && state.last_stop !== "BudgetExhausted")) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, delayMs));
      }
      setRunning(false);
      return;
    }

    // Fast path: chunked execution. Each chunk runs up to N
    // instructions, then we yield to the event loop so the UI stays
    // responsive and the Abort button is clickable even with an
    // infinite loop. Fix for GNUSim8085 #21 / sim8085 #67.
    const CHUNK = 50_000;
    const MAX_CHUNKS = 200; // total ~10M ops cap before forced abort
    let chunks = 0;
    while (chunks < MAX_CHUNKS && !abortRef.current) {
      const state = JSON.parse(emu.run(CHUNK, "")) as RegState;
      setReg(state);
      if (state.halted || (state.last_stop && state.last_stop !== "BudgetExhausted")) {
        break;
      }
      chunks++;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }
    setMemHex(emu.mem(memBase, 64));
    setPortsHex(emu.ports(0, 256));
    highlightCurrentLine();
    setRunning(false);
  }, [doLoadIfFreshSource, highlightCurrentLine, memBase, speed]);

  const doAbort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const doDownload = useCallback(() => {
    // Save the editor source as a .a85 file. No server round-trip,
    // no network — pure browser API.
    const blob = new Blob([source], { type: "text/x-asm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // First non-empty line that looks like a label or comment makes a
    // decent default file name; fall back to a stable name.
    const firstLine = source.split("\n").find((l) => l.trim().length > 0);
    const stem =
      firstLine?.replace(/^[;\s]*/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 32) ||
      "program";
    a.download = `${stem}.a85`;
    a.click();
    URL.revokeObjectURL(url);
    setDiag(`Saved as ${a.download}.`);
  }, [source]);

  const doShare = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#code=${encodeShareFragment(source)}`;
    try {
      await navigator.clipboard.writeText(url);
      setDiag("Share link copied to clipboard.");
    } catch {
      // Fallback: just put it in the URL bar so the user can copy it.
      window.location.hash = `code=${encodeShareFragment(source)}`;
      setDiag("Share link is now in the URL bar — copy it from there.");
    }
  }, [source]);

  const doReset = useCallback(() => {
    const emu = emuRef.current;
    if (!emu) return;
    emu.reset();
    lastLoadedSrcRef.current = null;
    lastExampleRef.current = null;
    setDiag(null);
    setHints([]);
    setSymbols([]);
    setMemHex("");
    setReg(null);
    setStepCount(0);
    setPortsHex("00".repeat(256));
    setPrinterBuffer("");
    setScreenBuffer("");
    setRobot(initialRobotState);
    decorationsRef.current = editorRef.current?.deltaDecorations(decorationsRef.current, []) ?? [];
  }, []);

  /// Replay the program from a clean emulator state up to `n` Step
  /// executions, re-applying the input pokes from the last loaded
  /// Example if there was one. Used by the ↶ Back button.
  const doReplay = useCallback(
    (n: number) => {
      const emu = emuRef.current;
      if (!emu) return;
      emu.reset();
      const load = JSON.parse(emu.load(source)) as LoadResult;
      if (!load.ok) return;
      setMemBase(load.origin);
      const ex = lastExampleRef.current;
      if (ex?.inputs) {
        for (const i of ex.inputs) emu.poke(i.addr, i.value);
      }
      for (let i = 0; i < n; i++) emu.step();
      updateState(emu.state());
      highlightCurrentLine();
    },
    [source, updateState, highlightCurrentLine],
  );

  const doBack = useCallback(() => {
    if (stepCount === 0) return;
    const target = stepCount - 1;
    setStepCount(target);
    doReplay(target);
  }, [stepCount, doReplay]);

  /// Reset + Run in one click. The common "I edited the source,
  /// what does the new version do from scratch?" loop.
  const doRestart = useCallback(async () => {
    doReset();
    // doReset() wipes the loaded-source ref, so doRun() will reassemble.
    await doRun();
  }, [doReset, doRun]);

  // ───── keyboard shortcuts ─────────────────────────────────────
  // Editor-level (Monaco focused): Ctrl+Enter Run, Ctrl+. Step, Ctrl+S Save.
  // We attach at the document level so the shortcuts work whether
  // focus is in the editor or in the side panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ? → toggle help overlay (no modifier required; matches
      // common keyboard-shortcut help conventions).
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const inEditable =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
        if (!inEditable) {
          e.preventDefault();
          setShowHelp((v) => !v);
          return;
        }
      }
      if (e.key === "Escape" && showHelp) {
        setShowHelp(false);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      // Avoid clashing with browser-native finds, etc. We only handle
      // a small set of keys we know aren't used elsewhere.
      if (e.key === "Enter") {
        e.preventDefault();
        void doRun();
      } else if (e.key === ".") {
        e.preventDefault();
        doStep();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        doDownload();
      } else if (e.key === "k" || e.key === "K") {
        // Cmd/Ctrl-K → Share link (common "copy URL" shortcut).
        e.preventDefault();
        void doShare();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [doRun, doStep, doDownload, doShare, showHelp]);

  const loadExample = useCallback(
    (ex: Example) => {
      setSource(ex.source);
      lastLoadedSrcRef.current = null;
      lastExampleRef.current = ex;
      setStepCount(0);
      setDiag(null);
      dismissQuickstart();
      // Pre-load inputs into memory after the source is loaded.
      // We have to defer one tick so doLoad runs against the new source.
      setTimeout(() => {
        const emu = emuRef.current;
        if (!emu) return;
        const loadOk = doLoad();
        if (loadOk && ex.inputs) {
          for (const i of ex.inputs) emu.poke(i.addr, i.value);
          updateState(emu.state());
        }
        if (ex.outputAddr) setMemBase(ex.outputAddr);
        // If auto-run is on, kick the program off after the inputs
        // settle. We defer another tick so React's source-state
        // update propagates before doRun() reads it.
        if (loadOk && autoRun) {
          lastLoadedSrcRef.current = ex.source; // skip re-load in doRun
          setTimeout(() => { void doRun(); }, 0);
        }
      }, 0);
    },
    [doLoad, updateState, dismissQuickstart, autoRun, doRun],
  );

  // ───── memory inspector formatting ─────────────────────────────
  const memCells = useMemo(() => {
    const out: Array<{ addr: number; cell: string }> = [];
    for (let i = 0; i < memHex.length / 2; i++) {
      const hexByte = memHex.slice(i * 2, i * 2 + 2);
      const v = parseInt(hexByte, 16);
      let cell = hexByte;
      if (memRadix === "dec") cell = v.toString(10).padStart(3, " ");
      else if (memRadix === "ascii") cell = v >= 0x20 && v < 0x7F ? String.fromCharCode(v) : ".";
      out.push({ addr: memBase + i, cell });
    }
    return out;
  }, [memHex, memBase, memRadix]);

  // ───── render ──────────────────────────────────────────────────
  return (
    <div className="ide-root">
      <header className="ide-header">
        <div className="ide-brand">
          <span className="brand-mark">modern</span>
          <span className="brand-mark brand-strong">8085</span>
          <span className="brand-tag">— Intel 8085 IDE</span>
        </div>
        <nav className="ide-nav">
          <a href="/8085/about/" className="ide-nav-link" title="What modern8085 is + why it exists">
            about
          </a>
          <a href="/8085/docs/" className="ide-nav-link" title="Reference + dialect + mnemonic table">
            docs
          </a>
          <a href="/labs/" className="ide-nav-link" title="All lab tools in the family">
            🧪 Labs
          </a>
          <a href="/" className="ide-nav-link" title="The sibling 8086 IDE">
            modern8086
          </a>
          <a
            href="https://github.com/abuXsarkar/modern8086"
            className="ide-nav-link"
            target="_blank"
            rel="noreferrer"
          >
            source
          </a>
          <select
            className="ide-locale"
            aria-label={t.languageLabel}
            value={localeId}
            onChange={(e) => setLocaleIdValue(e.target.value as typeof localeId)}
            title={t.languageLabel}
          >
            {LOCALES.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <ClassroomPill />
          <button
            type="button"
            className="ide-theme-toggle"
            onClick={() => setShowHelp(true)}
            title="Help (?)"
            aria-label="Help"
          >
            ?
          </button>
          <button
            type="button"
            className="ide-theme-toggle"
            onClick={() => setTheme((th) => (th === "vs" ? "vs-dark" : "vs"))}
            aria-label="Toggle dark mode"
          >
            {theme === "vs" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>

      <main className="ide-main">
        <section className="ide-editor-pane">
          {showQuickstart && (
            <div className="ide-quickstart" role="status">
              <span>
                <strong>New here?</strong> Open the <em>Examples</em> menu for a textbook lab program,
                or just press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run what's loaded.
              </span>
              <button
                type="button"
                className="ide-quickstart-x"
                onClick={dismissQuickstart}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          <div className="ide-toolbar">
            <button
              type="button"
              className="ide-btn ide-btn-primary"
              onClick={doRun}
              title="Ctrl/Cmd+Enter"
              disabled={coreState.kind !== "ready" || running}
            >
              {running ? t.running : `▶ ${t.run}`}
            </button>
            {running && (
              <button type="button" className="ide-btn ide-btn-warning" onClick={doAbort}>
                Abort
              </button>
            )}
            <button
              type="button"
              className="ide-btn"
              onClick={doStep}
              title="Ctrl/Cmd+."
              disabled={coreState.kind !== "ready" || running}
            >
              ⤵ {t.step}
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doBack}
              title="Step back one instruction (replays from start)"
              disabled={coreState.kind !== "ready" || running || stepCount === 0}
            >
              ↶ Back
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doReset}
              disabled={coreState.kind !== "ready" || running}
            >
              ⟲ {t.reset}
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doRestart}
              title="Reset then Run from scratch"
              disabled={coreState.kind !== "ready" || running}
            >
              ↻ Restart
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doShare}
              title="Copy a shareable link (Ctrl/Cmd+K)"
              disabled={running}
            >
              🔗 Share
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doDownload}
              title="Save as .a85 file (Ctrl/Cmd+S)"
              disabled={running}
            >
              ⬇ Save
            </button>
            <select
              className="ide-select"
              value={speed}
              title="Run speed — Slow + Crawl step one instruction at a time so you can watch each register change"
              onChange={(e) => setSpeed(e.target.value as "fast" | "slow" | "crawl")}
            >
              <option value="fast">Fast</option>
              <option value="slow">Slow (180ms)</option>
              <option value="crawl">Crawl (800ms)</option>
            </select>
            <label className="ide-checkbox" title="Auto-Run after picking an Example">
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(e) => setAutoRun(e.target.checked)}
              />
              auto-run
            </label>
            <select
              className="ide-select"
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                if (!isNaN(idx) && EXAMPLES[idx]) loadExample(EXAMPLES[idx]);
                e.target.value = "";
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Examples ▾
              </option>
              {EXAMPLES.map((ex, i) => (
                <option key={ex.name} value={i}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ide-editor-wrap">
            <Editor
              height="100%"
              language={ASM_LANG_ID}
              theme={theme}
              value={source}
              onChange={(v) => setSource(v ?? "")}
              onMount={onEditorMount}
              options={{
                fontSize: 14,
                fontFamily: '"Geist Mono", "Fira Mono", monospace',
                minimap: { enabled: false },
                lineNumbersMinChars: 3,
                renderLineHighlight: "none",
                tabSize: 8,
                insertSpaces: true,
                scrollBeyondLastLine: false,
                wordWrap: "off",
                automaticLayout: true,
                readOnly: classroomReadOnly,
              }}
            />
          </div>
        </section>

        <aside className="ide-side">
          <div className="ide-panel">
            <h2 className="ide-panel-h">CPU</h2>
            {reg ? (
              <div className="reg-grid">
                {REGS_8.map((k) => (
                  <div key={k} className={`reg-cell ${changedRegs.has(k) ? "reg-flash" : ""}`}>
                    <span className="reg-name">{k.toUpperCase()}</span>
                    <span className="reg-value mono">{hex(reg[k], 2)}</span>
                  </div>
                ))}
                <div className={`reg-cell wide ${changedRegs.has("sp") ? "reg-flash" : ""}`}>
                  <span className="reg-name">SP</span>
                  <span className="reg-value mono">{hex(reg.sp, 4)}</span>
                </div>
                <div className={`reg-cell wide ${changedRegs.has("pc") ? "reg-flash" : ""}`}>
                  <span className="reg-name">PC</span>
                  <span className="reg-value mono">{hex(reg.pc, 4)}</span>
                </div>
              </div>
            ) : (
              <p className="ide-muted">{t.noRegistersYet}</p>
            )}
          </div>

          <div className="ide-panel">
            <h2 className="ide-panel-h">Flags</h2>
            <div className="flag-row">
              {FLAGS.map((f) => {
                const on = reg ? Boolean(reg[f]) : false;
                const flashed = changedRegs.has(f);
                return (
                  <span
                    key={f}
                    className={`flag-chip ${on ? "flag-on" : ""} ${flashed ? "flag-flash" : ""}`}
                    title={f.toUpperCase()}
                  >
                    {f.toUpperCase()} {on ? "1" : "0"}
                  </span>
                );
              })}
            </div>
            {reg && reg.cycles > 0 && (
              <p className="ide-tiny mono">~{reg.cycles.toLocaleString()} cycles · {reg.last_stop ?? "—"}</p>
            )}
          </div>

          <div className="ide-panel">
            <h2 className="ide-panel-h">
              Memory
              <span className="ide-panel-controls">
                <button
                  type="button"
                  className={`ide-chip ${memRadix === "hex" ? "on" : ""}`}
                  onClick={() => setMemRadix("hex")}
                >
                  hex
                </button>
                <button
                  type="button"
                  className={`ide-chip ${memRadix === "dec" ? "on" : ""}`}
                  onClick={() => setMemRadix("dec")}
                >
                  dec
                </button>
                <button
                  type="button"
                  className={`ide-chip ${memRadix === "ascii" ? "on" : ""}`}
                  onClick={() => setMemRadix("ascii")}
                >
                  ascii
                </button>
              </span>
            </h2>
            <div className="ide-mem-base">
              base{" "}
              <input
                type="text"
                className="mono"
                value={hex(memBase, 4) + "H"}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9A-Fa-f]/g, "");
                  const v = parseInt(cleaned, 16);
                  if (!isNaN(v)) {
                    setMemBase(v & 0xFFFF);
                    const emu = emuRef.current;
                    if (emu) setMemHex(emu.mem(v & 0xFFFF, 64));
                  }
                }}
              />
            </div>
            <div className="mem-grid mono">
              {memCells.length === 0 && <span className="ide-muted">—</span>}
              {memCells.map((c) => (
                <span key={c.addr} className="mem-cell" title={hex(c.addr, 4) + "H"}>
                  {c.cell}
                </span>
              ))}
            </div>
          </div>

          <Tutorials
            onLoadCode={(src) => {
              setSource(src);
              lastLoadedSrcRef.current = null;
              lastExampleRef.current = null;
              setStepCount(0);
              setDiag(null);
              dismissQuickstart();
            }}
          />

          <div className="ide-panel">
            <h2 className="ide-panel-h">Devices</h2>
            <div className="devices-stack">
              <SevenSegment value={portValueAt(sevenSegPort)} port={sevenSegPort} />
              <TrafficLight value={portValueAt(trafficPort)} port={trafficPort} />
              <LedBar value={portValueAt(ledBarPort)} port={ledBarPort} />
              <Stepper value={portValueAt(stepperPort)} port={stepperPort} />
              <HexKeypad
                port={keypadPort}
                onPress={(v) => {
                  const emu = emuRef.current;
                  if (!emu) return;
                  emu.poke_port(keypadPort, v);
                  // Refresh the ports snapshot so any device pointed
                  // at the same port reflects the new value
                  // immediately. (keypad writes don't produce an io
                  // log entry — only OUT does — so no drain needed.)
                  setPortsHex(emu.ports(0, 256));
                }}
              />
              <Printer
                port={printerPort}
                buffer={printerBuffer}
                onClear={() => setPrinterBuffer("")}
              />
              <Screen
                port={screenPort}
                buffer={screenBuffer}
                onClear={() => setScreenBuffer("")}
              />
              <Robot
                port={robotPort}
                state={robot}
                onClear={() => setRobot(initialRobotState)}
              />
            </div>
            <details className="devices-config">
              <summary className="ide-tiny">configure ports ▾</summary>
              <PortInput label="7-seg" value={sevenSegPort} onChange={setSevenSegPort} />
              <PortInput label="traffic" value={trafficPort} onChange={setTrafficPort} />
              <PortInput label="LED bar" value={ledBarPort} onChange={setLedBarPort} />
              <PortInput label="stepper" value={stepperPort} onChange={setStepperPort} />
              <PortInput label="keypad" value={keypadPort} onChange={setKeypadPort} />
              <PortInput label="printer" value={printerPort} onChange={setPrinterPort} />
              <PortInput label="screen" value={screenPort} onChange={setScreenPort} />
              <PortInput label="robot" value={robotPort} onChange={setRobotPort} />
            </details>
          </div>

          {symbols.length > 0 && (
            <div className="ide-panel">
              <h2 className="ide-panel-h">Symbols</h2>
              <div className="sym-list mono">
                {symbols.map(([name, addr]) => {
                  const text = `${hex(addr, 4)}H`;
                  return (
                    <button
                      key={name}
                      type="button"
                      className="sym-row sym-row-clickable"
                      title={`Copy ${text} to clipboard`}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(text);
                          setDiag(`Copied ${name} = ${text}`);
                        } catch {
                          setDiag(`Couldn't copy — clipboard blocked`);
                        }
                      }}
                    >
                      <span>{name}</span>
                      <span>{text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hints.length > 0 && (
            <div className="ide-panel ide-panel-hints">
              <h2 className="ide-panel-h">Auto-fixes applied</h2>
              <ul className="hint-list">
                {hints.map(([line, msg], i) => (
                  <li key={i}>
                    <span className="hint-line">line {line}:</span> {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diag && (
            <div className="ide-panel ide-panel-error">
              <h2 className="ide-panel-h">Diagnostic</h2>
              <pre className="ide-diag mono">{diag}</pre>
            </div>
          )}

          {coreState.kind === "loading" && (
            <div className="ide-panel">
              <p className="ide-muted">{t.loadingWasm}</p>
            </div>
          )}
          {coreState.kind === "error" && (
            <div className="ide-panel ide-panel-error">
              <p className="ide-diag">{coreState.message}</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="ide-foot">
        <span>
          modern8085 · sibling to{" "}
          <a href="https://modern8086.com">modern8086</a> · MIT · {EXAMPLES.length} bundled examples ·{" "}
          {Object.keys(OPCODE_DOCS).length} mnemonic docs · press <kbd>?</kbd> for help
        </span>
      </footer>

      {showHelp && (
        <div
          className="ide-help-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHelp(false);
          }}
        >
          <div className="ide-help" role="dialog" aria-modal="true" aria-label="Help">
            <header className="ide-help-h">
              <span>modern8085 · keyboard + tips</span>
              <button
                type="button"
                className="ide-help-x"
                onClick={() => setShowHelp(false)}
                aria-label="Close help"
              >
                ×
              </button>
            </header>
            <section className="ide-help-body">
              <h3>Keyboard shortcuts</h3>
              <table className="ide-help-table">
                <tbody>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Run</td></tr>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>.</kbd></td><td>Step one instruction</td></tr>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save as .a85 file</td></tr>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Copy shareable URL</td></tr>
                  <tr><td><kbd>?</kbd></td><td>Toggle this help</td></tr>
                  <tr><td><kbd>Esc</kbd></td><td>Close this help</td></tr>
                </tbody>
              </table>

              <h3>First steps</h3>
              <ol>
                <li>Pick a program from the <em>Examples ▾</em> menu — it pre-loads any input bytes for you.</li>
                <li>Click <em>▶ Run</em>, or use <em>⤵ Step</em> to walk one instruction at a time.</li>
                <li>Hover any mnemonic in the editor for its inline reference.</li>
                <li>Step too far? Click <em>↶ Back</em> — it replays from the start to the previous step.</li>
              </ol>

              <h3>Memory inspector</h3>
              <p>
                The right pane shows 64 bytes from the base address you type in. Toggle the display between
                hex / decimal / ASCII without re-running. Default base is the program origin (e.g. <code>2000H</code>);
                examples that produce output at <code>3050H</code> auto-scroll there after run.
              </p>

              <h3>Dialect</h3>
              <p>
                Canonical Intel 8085 syntax — <code>;</code> comments, hex with the trailing <code>H</code>{" "}
                (and a leading <code>0</code> when the first digit is A–F: <code>0FFH</code> not <code>FFH</code>).{" "}
                Paste from sim8085 / GNUSim8085 / OshonSoft / textbook PDFs usually works — the assembler
                silently auto-fixes the common mistakes and surfaces a note on the side panel when it does.
              </p>

              <h3>About / source</h3>
              <p>
                modern8085 is the 8085 sibling of <a href="https://modern8086.com">modern8086</a>. Both ship
                from the same monorepo at{" "}
                <a href="https://github.com/abuXsarkar/modern8086">github.com/abuXsarkar/modern8086</a>. MIT licensed.
                For the whole family roster see <a href="/labs/">/labs/</a>.
              </p>
            </section>
          </div>
        </div>
      )}

      <ClassroomLayer currentSource={source} />
    </div>
  );
}

function PortInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="port-input-row">
      <span className="ide-tiny">{label}</span>
      <input
        type="text"
        className="mono"
        value={value.toString(16).toUpperCase().padStart(2, "0") + "H"}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9A-Fa-f]/g, "");
          const v = parseInt(cleaned, 16);
          if (!isNaN(v)) onChange(v & 0xFF);
        }}
      />
    </label>
  );
}
