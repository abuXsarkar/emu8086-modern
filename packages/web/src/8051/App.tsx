import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — wasm-pack output has no .d.ts at this path; we type the shape inline.
import init, { Emulator } from "../../../wasm-api-8051/pkg/modern8051_wasm_api.js";
import { ASM_LANG_ID, registerAsm8051 } from "./asm8051";
import { DEFAULT_SOURCE, EXAMPLES, type Example } from "./examples";
import { Mark51 } from "./Mark51";
import { LOCALES, useLocaleId, useStrings } from "../i18n";
import { ClassroomLayer, ClassroomPill } from "../classroom/ClassroomPanel";
import { useClassroomEditor } from "../classroom/useClassroomEditor";
import { Devices8051, type PortEvent } from "./devices/Devices";
import { Tutorials } from "./tutorials/TutorialPanel";

const STORAGE_KEY = "modern8051.source";
const THEME_KEY = "modern8051.editor-theme";
const RUN_BUDGET = 1_000_000;
const REG_FLASH_MS = 700;

type CoreState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type RegState = {
  a: number;
  b: number;
  dptr: number;
  sp: number;
  pc: number;
  cy: boolean;
  ac: boolean;
  f0: boolean;
  rs1: boolean;
  rs0: boolean;
  ov: boolean;
  f1: boolean;
  p: boolean;
  r: number[];
  origin: number;
  bytes_loaded: number;
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

type MemSpace = "idata" | "xdata" | "code";

function hex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const INITIAL_SOURCE = (() => {
  const shared = decodeShareFragment();
  if (shared) return shared;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_SOURCE;
})();

export function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);
  // Classroom relay — read-only flag drives the editor's `readOnly`
  // option so a student session can't type while the teacher holds
  // control. Source-broadcast plumbing lives inside the hook.
  const { readOnly: classroomReadOnly } = useClassroomEditor(source, setSource);
  const strings = useStrings();
  const [localeId, setLocaleId] = useLocaleId();
  const [core, setCore] = useState<CoreState>({ kind: "loading" });
  const [reg, setReg] = useState<RegState | null>(null);
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [activeExample, setActiveExample] = useState<Example | null>(null);
  const [memSpace, setMemSpace] = useState<MemSpace>("idata");
  const [memBase, setMemBase] = useState(0x00);
  const [ioLog, setIoLog] = useState<Array<[number, number]>>([]);
  // `deviceEvents` is a per-render batch passed to the devices panel.
  // It's reset every time we hand off a batch — devices consume each
  // batch exactly once and accumulate their own derived state.
  const [deviceEvents, setDeviceEvents] = useState<PortEvent[]>([]);
  const [deviceResetKey, setDeviceResetKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [theme, setTheme] = useState<"vs" | "vs-dark">(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "vs-dark" ? "vs-dark" : "vs";
    } catch {
      return "vs";
    }
  });

  const emuRef = useRef<Emulator | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const runRafRef = useRef<number | null>(null);
  const prevRegRef = useRef<RegState | null>(null);
  const [flashed, setFlashed] = useState<Set<string>>(new Set());

  // Boot the wasm module + Emulator instance once.
  useEffect(() => {
    let cancelled = false;
    init()
      .then(() => {
        if (cancelled) return;
        emuRef.current = new Emulator();
        setCore({ kind: "ready" });
      })
      .catch((err: unknown) => {
        setCore({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist source.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {
      /* ignore quota */
    }
  }, [source]);

  // Persist theme; mirror into body class so CSS reacts pre-paint.
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    document.body.classList.toggle("dark", theme === "vs-dark");
  }, [theme]);

  const reloadFromSource = useCallback(() => {
    const emu = emuRef.current;
    if (!emu) return null;
    const result = JSON.parse(emu.load(source)) as LoadResult;
    setLoad(result);
    if (result.ok) {
      const state = JSON.parse(emu.state()) as RegState;
      setReg(state);
      prevRegRef.current = state;
      setFlashed(new Set());
      setIoLog([]);
    }
    return result;
  }, [source]);

  // Auto-(re)assemble on source change once the core is ready.
  useEffect(() => {
    if (core.kind !== "ready") return;
    reloadFromSource();
  }, [core.kind, reloadFromSource]);

  const diffFlash = useCallback((next: RegState) => {
    const prev = prevRegRef.current;
    if (!prev) {
      prevRegRef.current = next;
      return;
    }
    const fields: Array<keyof RegState> = [
      "a",
      "b",
      "dptr",
      "sp",
      "pc",
      "cy",
      "ac",
      "ov",
      "p",
      "rs0",
      "rs1",
    ];
    const changed = new Set<string>();
    for (const f of fields) {
      if (prev[f] !== next[f]) changed.add(f);
    }
    for (let i = 0; i < 8; i++) {
      if (prev.r?.[i] !== next.r?.[i]) changed.add(`r${i}`);
    }
    if (changed.size > 0) {
      setFlashed(changed);
      setTimeout(() => setFlashed(new Set()), REG_FLASH_MS);
    }
    prevRegRef.current = next;
  }, []);

  const drainIo = useCallback(() => {
    const emu = emuRef.current;
    if (!emu) return;
    const hexStr = emu.drain_io_log();
    if (!hexStr) return;
    const events: PortEvent[] = [];
    for (let i = 0; i < hexStr.length; i += 4) {
      const port = parseInt(hexStr.slice(i, i + 2), 16);
      const byte = parseInt(hexStr.slice(i + 2, i + 4), 16);
      events.push([port, byte]);
    }
    if (events.length > 0) {
      setIoLog((prev) => [...prev, ...events].slice(-64));
      setDeviceEvents(events);
    }
  }, []);

  const handleStep = useCallback(() => {
    const emu = emuRef.current;
    if (!emu || !load?.ok) return;
    const state = JSON.parse(emu.step()) as RegState;
    setReg(state);
    diffFlash(state);
    drainIo();
  }, [load?.ok, diffFlash, drainIo]);

  const handleRun = useCallback(() => {
    const emu = emuRef.current;
    if (!emu || !load?.ok) return;
    setRunning(true);
    const bps = [...breakpoints].map((b) => "0x" + b.toString(16)).join(",");
    const tick = () => {
      const state = JSON.parse(emu.run(50_000, bps)) as RegState;
      setReg(state);
      diffFlash(state);
      drainIo();
      const stoppedAtBp = state.last_stop?.startsWith("Breakpoint");
      if (state.halted || stoppedAtBp || state.cycles > RUN_BUDGET) {
        setRunning(false);
        runRafRef.current = null;
        return;
      }
      runRafRef.current = requestAnimationFrame(tick);
    };
    runRafRef.current = requestAnimationFrame(tick);
  }, [load?.ok, breakpoints, diffFlash, drainIo]);

  const handleStop = useCallback(() => {
    if (runRafRef.current != null) {
      cancelAnimationFrame(runRafRef.current);
      runRafRef.current = null;
    }
    setRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    handleStop();
    const emu = emuRef.current;
    if (!emu) return;
    emu.reset();
    reloadFromSource();
    setDeviceResetKey((k) => k + 1);
  }, [handleStop, reloadFromSource]);

  // Latest snapshot of P0..P3 — devices use this for state-driven
  // displays (7-seg, LED bar, traffic light) so they reflect the
  // current port byte even when no new write happened. Read directly
  // from IDATA at the SFR addresses.
  const portValues = useMemo(() => {
    const emu = emuRef.current;
    if (!emu || !reg) return { p0: 0, p1: 0, p2: 0, p3: 0 };
    const idata = emu.idata(0x80, 0x40);
    const at = (addr: number) => parseInt(idata.slice((addr - 0x80) * 2, (addr - 0x80) * 2 + 2), 16);
    return { p0: at(0x80), p1: at(0x90), p2: at(0xa0), p3: at(0xb0) };
  }, [reg]);

  // Keypad input — write directly to the port SFR. Wired to the
  // Devices8051's `poke` callback.
  const pokePort = useCallback((addr: number, value: number) => {
    const emu = emuRef.current;
    if (!emu) return;
    emu.poke_idata(addr, value);
    // Refresh the register snapshot so the UI shows the new port value.
    setReg(JSON.parse(emu.state()) as RegState);
  }, []);

  // Cancel any in-flight run on unmount.
  useEffect(
    () => () => {
      if (runRafRef.current != null) cancelAnimationFrame(runRafRef.current);
    },
    [],
  );

  // Pre-load example inputs (IDATA / XDATA).
  const applyExample = useCallback(
    (ex: Example) => {
      handleStop();
      setSource(ex.source);
      setActiveExample(ex);
      const emu = emuRef.current;
      if (!emu) return;
      // Reload, then pre-poke inputs.
      const result = JSON.parse(emu.load(ex.source)) as LoadResult;
      setLoad(result);
      if (ex.idata) {
        for (const { addr, value } of ex.idata) emu.poke_idata(addr, value);
      }
      if (ex.xdata) {
        for (const { addr, value } of ex.xdata) emu.poke_xdata(addr, value);
      }
      const state = JSON.parse(emu.state()) as RegState;
      setReg(state);
      prevRegRef.current = state;
      if (ex.outputSpace) setMemSpace(ex.outputSpace);
      if (typeof ex.outputAddr === "number") {
        setMemBase(ex.outputAddr & 0xfff0);
      }
    },
    [handleStop],
  );

  // Active-line highlight in the editor.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const emu = emuRef.current;
    if (!editor || !monaco || !emu || !reg) return;
    const line = emu.line_for_pc();
    if (line && line > 0) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: "active-line",
            linesDecorationsClassName: "active-line-margin",
          },
        },
      ]);
    } else if (decorationsRef.current.length) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }
  }, [reg]);

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerAsm8051(monaco);
    // Gutter-click → breakpoint needs a line→PC API we'll add in a
    // follow-up; for now breakpoints are set by PC via the toolbar.
  };

  const memBytes = useMemo(() => {
    const emu = emuRef.current;
    if (!emu || !reg) return "";
    if (memSpace === "idata") return emu.idata(memBase, 128);
    if (memSpace === "xdata") return emu.xdata(memBase, 128);
    return emu.code(memBase, 128);
  }, [reg, memBase, memSpace]);

  const memSpan = memSpace === "idata" ? 0x100 : 0x10000;
  const symbols = load?.symbols ?? [];
  const hints = load?.hints ?? [];

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = window.location.origin + window.location.pathname;
    return `${base}#code=${encodeShareFragment(source)}`;
  }, [source]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      alert("Share link copied.");
    } catch {
      window.prompt("Copy this link:", shareLink);
    }
  }, [shareLink]);

  // Toggle a breakpoint by typed PC (hex). Lightweight v0 input
  // — gutter-click wiring needs a line→pc API we'll add later.
  const promptBreakpoint = useCallback(() => {
    const input = window.prompt("Breakpoint PC (hex):", "");
    if (!input) return;
    const pc = parseInt(input.replace(/^0x/i, ""), 16);
    if (!Number.isFinite(pc)) return;
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(pc)) next.delete(pc);
      else next.add(pc);
      return next;
    });
  }, []);

  if (core.kind === "loading") {
    return <div className="ide-root"><div className="ide-panel">{strings.loadingWasm}</div></div>;
  }
  if (core.kind === "error") {
    return (
      <div className="ide-root">
        <div className="ide-panel ide-panel-error">
          <h3>{strings.loadWasmFailed(core.message)}</h3>
        </div>
      </div>
    );
  }

  const flagClass = (key: string, on: boolean) =>
    `flag-chip${on ? " flag-on" : ""}${flashed.has(key) ? " flag-flash" : ""}`;
  const regFlash = (key: string) => (flashed.has(key) ? " reg-flash" : "");

  return (
    <div className="ide-root">
      <header className="ide-header">
        <div className="ide-brand">
          <Mark51 size={28} />
          <span className="brand-mark">
            <span className="brand-strong">modern8051</span>
            <span className="brand-tag">Intel 8051 IDE</span>
          </span>
        </div>
        <nav className="ide-nav">
          <a className="ide-nav-link" href="/labs/">labs</a>
          <a className="ide-nav-link" href="/">8086</a>
          <a className="ide-nav-link" href="/8085/">8085</a>
          <ClassroomPill />
          <select
            className="ide-locale"
            value={localeId}
            onChange={(e) => setLocaleId(e.target.value as typeof localeId)}
            aria-label="Language"
          >
            {LOCALES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            className="ide-theme-toggle"
            onClick={() => setTheme(theme === "vs" ? "vs-dark" : "vs")}
            aria-label="Toggle theme"
          >
            {theme === "vs" ? "dark" : "light"}
          </button>
        </nav>
      </header>
      <ClassroomLayer currentSource={source} />

      <main className="ide-main">
        <section className="ide-editor-pane">
          <div className="ide-toolbar">
            <button
              className="ide-btn ide-btn-primary"
              onClick={running ? handleStop : handleRun}
              disabled={!load?.ok || reg?.halted}
            >
              {running ? strings.running : strings.run}
            </button>
            <button className="ide-btn" onClick={handleStep} disabled={!load?.ok || reg?.halted}>
              {strings.step}
            </button>
            <button className="ide-btn" onClick={handleReset}>
              {strings.reset}
            </button>
            <button className="ide-btn" onClick={promptBreakpoint}>
              + Breakpoint
            </button>
            <button className="ide-btn" onClick={handleShare}>
              {strings.share}
            </button>
            <select
              className="ide-select"
              value={activeExample?.name ?? ""}
              onChange={(e) => {
                const ex = EXAMPLES.find((x) => x.name === e.target.value);
                if (ex) applyExample(ex);
              }}
            >
              <option value="">Examples…</option>
              {EXAMPLES.map((ex) => (
                <option key={ex.name} value={ex.name}>
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
              onMount={onEditorMount}
              onChange={(v) => setSource(v ?? "")}
              options={{
                fontFamily: "Geist Mono, ui-monospace, monospace",
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                glyphMargin: true,
                tabSize: 8,
                insertSpaces: true,
                readOnly: classroomReadOnly,
              }}
            />
          </div>
        </section>

        <aside className="ide-side">
          {activeExample && (
            <div className="ide-panel">
              <div className="ide-panel-h">{activeExample.name}</div>
              <p className="ide-tiny">{activeExample.description}</p>
            </div>
          )}

          <div className="ide-panel">
            <div className="ide-panel-h">{strings.devices}</div>
            <Devices8051
              events={deviceEvents}
              portValues={portValues}
              poke={pokePort}
              resetKey={deviceResetKey}
            />
          </div>

          <Tutorials onLoadCode={(src) => { handleStop(); setSource(src); }} />

          <div className="ide-panel">
            <div className="ide-panel-h">{strings.registers}</div>
            {reg && (
              <>
                <div className="reg-grid">
                  <div className={"reg-cell" + regFlash("a")}>
                    <span className="reg-name">A</span>
                    <span className="reg-value mono">{hex(reg.a, 2)}</span>
                  </div>
                  <div className={"reg-cell" + regFlash("b")}>
                    <span className="reg-name">B</span>
                    <span className="reg-value mono">{hex(reg.b, 2)}</span>
                  </div>
                  <div className={"reg-cell wide" + regFlash("dptr")}>
                    <span className="reg-name">DPTR</span>
                    <span className="reg-value mono">{hex(reg.dptr, 4)}</span>
                  </div>
                  <div className={"reg-cell" + regFlash("sp")}>
                    <span className="reg-name">SP</span>
                    <span className="reg-value mono">{hex(reg.sp, 2)}</span>
                  </div>
                  <div className={"reg-cell wide" + regFlash("pc")}>
                    <span className="reg-name">PC</span>
                    <span className="reg-value mono">{hex(reg.pc, 4)}</span>
                  </div>
                  {reg.r.map((v, i) => (
                    <div key={i} className={"reg-cell" + regFlash(`r${i}`)}>
                      <span className="reg-name">R{i}</span>
                      <span className="reg-value mono">{hex(v, 2)}</span>
                    </div>
                  ))}
                </div>
                <p className="ide-tiny">
                  Bank {reg.rs1 ? 2 : 0 | (reg.rs0 ? 1 : 0)} · {reg.cycles} cyc
                  {reg.last_stop ? ` · ${reg.last_stop}` : ""}
                </p>
              </>
            )}
          </div>

          <div className="ide-panel">
            <div className="ide-panel-h">{strings.flags}</div>
            {reg && (
              <div className="flag-row">
                <span className={flagClass("cy", reg.cy)}>CY</span>
                <span className={flagClass("ac", reg.ac)}>AC</span>
                <span className={flagClass("f0", reg.f0)}>F0</span>
                <span className={flagClass("rs1", reg.rs1)}>RS1</span>
                <span className={flagClass("rs0", reg.rs0)}>RS0</span>
                <span className={flagClass("ov", reg.ov)}>OV</span>
                <span className={flagClass("f1", reg.f1)}>F1</span>
                <span className={flagClass("p", reg.p)}>P</span>
              </div>
            )}
          </div>

          <div className="ide-panel">
            <div className="ide-panel-h">
              {strings.memory}
              <span className="ide-panel-controls">
                {(["idata", "xdata", "code"] as MemSpace[]).map((s) => (
                  <button
                    key={s}
                    className={`ide-chip${memSpace === s ? " on" : ""}`}
                    onClick={() => setMemSpace(s)}
                  >
                    {s}
                  </button>
                ))}
              </span>
            </div>
            <div className="ide-mem-base">
              base 0x
              <input
                value={hex(memBase, memSpace === "idata" ? 2 : 4)}
                onChange={(e) => {
                  const n = parseInt(e.target.value || "0", 16);
                  if (!Number.isFinite(n)) return;
                  const masked = (n & (memSpan - 1)) & ~0x0f;
                  setMemBase(masked);
                }}
              />
            </div>
            <div className="mem-grid">
              {Array.from({ length: Math.min(64, memBytes.length / 2) }).map((_, i) => (
                <span key={i} className="mem-cell mono">
                  {memBytes.slice(i * 2, i * 2 + 2)}
                </span>
              ))}
            </div>
          </div>

          {ioLog.length > 0 && (
            <div className="ide-panel">
              <div className="ide-panel-h">
                I/O activity
                <span className="ide-panel-controls">
                  <button className="ide-chip" onClick={() => setIoLog([])}>clear</button>
                </span>
              </div>
              <div className="ioact-list">
                {ioLog.slice(-12).map(([port, byte], i) => (
                  <div key={i} className="ioact-row mono">
                    <span className="ioact-port">P{port.toString(16).toUpperCase()}</span>
                    <span className="ioact-byte">{hex(byte, 2)}</span>
                    <span className="ioact-ascii">
                      {byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : "·"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {breakpoints.size > 0 && (
            <div className="ide-panel">
              <div className="ide-panel-h">Breakpoints</div>
              <div className="ide-tiny mono">
                {[...breakpoints].sort((a, b) => a - b).map((bp) => (
                  <div key={bp}>
                    <button
                      className="sym-row-clickable"
                      onClick={() =>
                        setBreakpoints((prev) => {
                          const next = new Set(prev);
                          next.delete(bp);
                          return next;
                        })
                      }
                    >
                      0x{hex(bp, 4)} ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {symbols.length > 0 && (
            <div className="ide-panel">
              <div className="ide-panel-h">Symbols</div>
              <div className="sym-list mono">
                {symbols.slice(0, 16).map(([name, addr]) => (
                  <div key={name} className="sym-row">
                    <span>{name}</span>
                    <span>{hex(addr, 4)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hints.length > 0 && (
            <div className="ide-panel ide-panel-hints">
              <div className="ide-panel-h">Tolerance hints</div>
              <ul className="hint-list">
                {hints.map(([line, msg], i) => (
                  <li key={i}>
                    <span className="hint-line">L{line}</span> · {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {load && !load.ok && (
            <div className="ide-panel ide-panel-error">
              <div className="ide-panel-h">Assembler error</div>
              <pre className="ide-diag">{load.error}</pre>
            </div>
          )}
        </aside>
      </main>

      <footer className="ide-foot">
        modern8051 · sibling to modern8086 + modern8085 · part of the modern8086 family ·{" "}
        <a href="https://github.com/abuXsarkar/modern8086">github</a>
      </footer>
    </div>
  );
}
