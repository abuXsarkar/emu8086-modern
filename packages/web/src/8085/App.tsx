import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — wasm-pack output has no .d.ts at this path; we type the shape inline below.
import init, { Emulator } from "../../../wasm-api-8085/pkg/modern8085_wasm_api.js";
import { ASM_LANG_ID, registerAsm8085 } from "./asm8085";
import { OPCODE_DOCS } from "./asm8085_docs";
import { DEFAULT_SOURCE, EXAMPLES, type Example } from "./examples";

const STORAGE_KEY = "modern8085.source";
const THEME_KEY = "modern8085.editor-theme";

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
  const [source, setSource] = useState<string>(initialSource);
  const [coreState, setCoreState] = useState<CoreState>({ kind: "loading" });
  const [reg, setReg] = useState<RegState | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [hints, setHints] = useState<Array<[number, string]>>([]);
  const [symbols, setSymbols] = useState<Array<[string, number]>>([]);
  const [memBase, setMemBase] = useState<number>(0x2050);
  const [memHex, setMemHex] = useState<string>("");
  const [memRadix, setMemRadix] = useState<"hex" | "dec" | "ascii">("hex");
  const [theme, setTheme] = useState<"vs" | "vs-dark">(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "vs-dark" ? "vs-dark" : "vs";
    } catch {
      return "vs";
    }
  });
  const [running, setRunning] = useState(false);

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
      if (emu) setMemHex(emu.mem(memBase, 64));
    } catch (err) {
      setDiag(`internal: failed to parse state — ${String(err)}`);
    }
  }, [memBase]);

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
    // Chunked execution loop. Each chunk runs up to N instructions,
    // then we yield to the event loop so the UI stays responsive and
    // the Abort button is clickable even with an infinite loop in
    // the student's program. This is the fix for GNUSim8085 #21 /
    // sim8085 #67.
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
    highlightCurrentLine();
    setRunning(false);
  }, [doLoadIfFreshSource, highlightCurrentLine, memBase]);

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
    setDiag(null);
    setHints([]);
    setSymbols([]);
    setMemHex("");
    setReg(null);
    decorationsRef.current = editorRef.current?.deltaDecorations(decorationsRef.current, []) ?? [];
  }, []);

  const loadExample = useCallback(
    (ex: Example) => {
      setSource(ex.source);
      lastLoadedSrcRef.current = null;
      setDiag(null);
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
      }, 0);
    },
    [doLoad, updateState],
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
          <button
            type="button"
            className="ide-theme-toggle"
            onClick={() => setTheme((t) => (t === "vs" ? "vs-dark" : "vs"))}
            aria-label="Toggle dark mode"
          >
            {theme === "vs" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>

      <main className="ide-main">
        <section className="ide-editor-pane">
          <div className="ide-toolbar">
            <button
              type="button"
              className="ide-btn ide-btn-primary"
              onClick={doRun}
              disabled={coreState.kind !== "ready" || running}
            >
              {running ? "Running…" : "▶ Run"}
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
              disabled={coreState.kind !== "ready" || running}
            >
              ⤵ Step
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doReset}
              disabled={coreState.kind !== "ready" || running}
            >
              ⟲ Reset
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doShare}
              title="Copy a shareable link to this exact program"
              disabled={running}
            >
              🔗 Share
            </button>
            <button
              type="button"
              className="ide-btn"
              onClick={doDownload}
              title="Save the editor contents as a .a85 file"
              disabled={running}
            >
              ⬇ Save
            </button>
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
                  <div key={k} className="reg-cell">
                    <span className="reg-name">{k.toUpperCase()}</span>
                    <span className="reg-value mono">{hex(reg[k], 2)}</span>
                  </div>
                ))}
                <div className="reg-cell wide">
                  <span className="reg-name">SP</span>
                  <span className="reg-value mono">{hex(reg.sp, 4)}</span>
                </div>
                <div className="reg-cell wide">
                  <span className="reg-name">PC</span>
                  <span className="reg-value mono">{hex(reg.pc, 4)}</span>
                </div>
              </div>
            ) : (
              <p className="ide-muted">Load a program to see registers.</p>
            )}
          </div>

          <div className="ide-panel">
            <h2 className="ide-panel-h">Flags</h2>
            <div className="flag-row">
              {FLAGS.map((f) => {
                const on = reg ? Boolean(reg[f]) : false;
                return (
                  <span key={f} className={`flag-chip ${on ? "flag-on" : ""}`} title={f.toUpperCase()}>
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

          {symbols.length > 0 && (
            <div className="ide-panel">
              <h2 className="ide-panel-h">Symbols</h2>
              <div className="sym-list mono">
                {symbols.map(([name, addr]) => (
                  <div key={name} className="sym-row">
                    <span>{name}</span>
                    <span>{hex(addr, 4)}H</span>
                  </div>
                ))}
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
              <p className="ide-muted">Loading 8085 core…</p>
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
          {Object.keys(OPCODE_DOCS).length} mnemonic docs
        </span>
      </footer>
    </div>
  );
}
