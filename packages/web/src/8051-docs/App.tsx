import { useEffect, useState } from "react";
import { OPCODE_DOCS } from "../8051/asm8051_docs";
import { EXAMPLES } from "../8051/examples";

const THEME_KEY = "modern8051.editor-theme";

const GROUPS: Array<{ title: string; mnems: string[] }> = [
  {
    title: "Data transfer",
    mnems: ["MOV", "MVI", "LXI", "LDA", "STA", "LHLD", "SHLD", "LDAX", "STAX", "XCHG"],
  },
  {
    title: "Arithmetic",
    mnems: [
      "ADD", "ADC", "ADI", "ACI", "SUB", "SBB", "SUI", "SBI",
      "INR", "DCR", "INX", "DCX", "DAD", "DAA",
    ],
  },
  {
    title: "Logical / rotate",
    mnems: [
      "ANA", "ANI", "ORA", "ORI", "XRA", "XRI", "CMP", "CPI",
      "RLC", "RRC", "RAL", "RAR", "CMA", "CMC", "STC",
    ],
  },
  {
    title: "Branch",
    mnems: [
      "JMP", "JNZ", "JZ", "JNC", "JC", "JPO", "JPE", "JP", "JM",
      "CALL", "RET", "PCHL", "RST",
    ],
  },
  {
    title: "Stack / IO / control",
    mnems: ["PUSH", "POP", "XTHL", "SPHL", "IN", "OUT", "HLT", "NOP", "EI", "DI", "RIM", "SIM"],
  },
  {
    title: "Directives",
    mnems: ["ORG", "EQU", "DB", "DW", "DS", "END"],
  },
];

const TOLERANCE_RULES: Array<{ pattern: string; rewrite: string }> = [
  { pattern: "FFH (no leading 0)", rewrite: "0FFH" },
  { pattern: "0xNN / 0XNN", rewrite: "NN H form (leading 0 if needed)" },
  { pattern: "// or # line comments", rewrite: ";" },
  { pattern: ", #N immediate prefix (6502/ARM habit)", rewrite: ", N" },
  { pattern: "Smart quotes ' ' \" \"", rewrite: "ASCII ' \"" },
  { pattern: "UTF-8 BOM at file start", rewrite: "stripped" },
  { pattern: "1010_1100B (underscored binary)", rewrite: "1010 1100 B" },
];

export function App() {
  const [theme, setTheme] = useState<"vs" | "vs-dark">(() => {
    try {
      const v = localStorage.getItem(THEME_KEY) ?? localStorage.getItem("modern8086.editor-theme");
      return v === "vs-dark" ? "vs-dark" : "vs";
    } catch {
      return "vs";
    }
  });
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* */ }
    if (theme === "vs-dark") document.body.classList.add("dark");
    else document.body.classList.remove("dark");
  }, [theme]);

  return (
    <div className="docs-root">
      <header className="docs-header">
        <a href="/8051/" className="docs-brand">
          <span className="docs-brand-mark">modern</span>
          <span className="docs-brand-strong">8051</span>
          <span className="docs-brand-tag">— docs</span>
        </a>
        <nav className="docs-nav">
          <a href="/8051/">IDE</a>
          <a href="/labs/">Labs</a>
          <a href="https://github.com/abuXsarkar/modern8086" target="_blank" rel="noreferrer">source</a>
          <button
            type="button"
            className="docs-theme-toggle"
            onClick={() => setTheme((t) => (t === "vs" ? "vs-dark" : "vs"))}
            aria-label="Toggle dark mode"
          >
            {theme === "vs" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>

      <main className="docs-main">
        <section className="docs-section">
          <h1 className="docs-h1">
            A 60-second tour of <em>modern8051</em>.
          </h1>
          <p className="docs-lede">
            Open the <a href="/8051/">IDE</a>, pick a program from <em>Examples ▾</em>, hit{" "}
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. That's the whole workflow. Everything else is just polish.
          </p>
        </section>

        <Section title="Workflow">
          <ol>
            <li>
              <strong>Pick or write a program.</strong> The Examples menu has {EXAMPLES.length} canonical
              lab programs (Add, Sort, Fibonacci, Prime, etc.) sourced from GeeksforGeeks / Tutorialspoint
              and patched where the upstream source had bugs. Each pre-loads its input bytes so Run just works.
            </li>
            <li>
              <strong>Run, step, restart.</strong> Run executes to <code>HLT</code> in chunks so an infinite
              loop never freezes the page — there's an Abort button while it runs. Step walks one instruction
              at a time. <em>↶ Back</em> rewinds via replay-from-start; works for any number of prior steps.
            </li>
            <li>
              <strong>Inspect.</strong> Register pane on the right shows A/B/C/D/E/H/L + SP/PC + the five
              flags. Memory inspector defaults to the program origin and toggles between hex / decimal / ASCII.
              Type any 16-bit address in the base box to jump.
            </li>
            <li>
              <strong>Share.</strong> The 🔗 Share button copies a self-contained URL to your clipboard.
              No account, no server. Paste it into a chat and anyone with a browser can run your exact program.
            </li>
          </ol>
        </Section>

        <Section title="Keyboard shortcuts">
          <table className="docs-table">
            <tbody>
              <tr><td><kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Run</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>.</kbd></td><td>Step one instruction</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save as .a51 file</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Copy shareable URL</td></tr>
              <tr><td><kbd>?</kbd></td><td>Help overlay</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Close help</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Dialect">
          <p>
            Canonical Intel 8051 syntax: <code>;</code> comments to EOL, hex with the trailing{" "}
            <code>H</code> suffix (and a leading <code>0</code> when the first digit is A–F, so{" "}
            <code>0FFH</code> not <code>FFH</code>), <code>LABEL:</code> with the colon, one instruction
            per line, decimal default, binary with the trailing <code>B</code>. Directives:{" "}
            <code>ORG</code>, <code>EQU</code>, <code>DB</code>, <code>DW</code>, <code>DS</code>,{" "}
            <code>END</code>.
          </p>
          <p>
            Default <code>ORG</code> when not specified is <code>2000H</code> (matches every textbook /
            GfG example). Need <code>4200H</code> for a Vinytics / Dynalog trainer? Just write{" "}
            <code>ORG 4200H</code> at the top.
          </p>
          <h3>Tolerance auto-fixes</h3>
          <p>
            The preprocessor silently fixes the highest-yield cross-dialect mistakes before parsing — the
            kind of thing you trip on when pasting from sim8051, GNUSim8051, OshonSoft, or a textbook PDF.
            Each fix appears in the IDE's <em>Auto-fixes applied</em> side panel so you can see what was rewritten.
          </p>
          <table className="docs-table">
            <thead>
              <tr><th>What we accept</th><th>What we rewrite it to</th></tr>
            </thead>
            <tbody>
              {TOLERANCE_RULES.map((r, i) => (
                <tr key={i}><td><code>{r.pattern}</code></td><td><code>{r.rewrite}</code></td></tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Memory layout convention">
          <p>The bundled examples standardise on:</p>
          <table className="docs-table">
            <tbody>
              <tr><td><code>2000H+</code></td><td>code</td></tr>
              <tr><td><code>2050H+</code></td><td>inputs (often a count byte then data)</td></tr>
              <tr><td><code>3050H+</code></td><td>outputs</td></tr>
            </tbody>
          </table>
          <p>
            That means the memory inspector preset works for every shipped example — change the base in
            the right pane only if your own program uses a different region.
          </p>
        </Section>

        <Section title="Mnemonic reference">
          <p className="docs-muted">
            Hover any mnemonic in the editor for these same notes inline. {Object.keys(OPCODE_DOCS).length}{" "}
            entries total.
          </p>
          {GROUPS.map((g) => (
            <div key={g.title} className="docs-group">
              <h3>{g.title}</h3>
              <table className="docs-table docs-mnem-table">
                <tbody>
                  {g.mnems.map((m) => {
                    const d = OPCODE_DOCS[m];
                    if (!d) return null;
                    return (
                      <tr key={m}>
                        <td className="docs-mnem-name mono">{m}</td>
                        <td>
                          <div className="docs-mnem-sum">
                            {d.summary}
                            {d.cycles && (
                              <span className="docs-mnem-cycles mono"> · {d.cycles} T-states</span>
                            )}
                          </div>
                          <div className="docs-mnem-det">{d.detail}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </Section>

        <Section title="CLI">
          <p>
            The same core + assembler is also a headless binary, useful for CI / autograding:
          </p>
          <pre className="docs-pre">{`# from source (until first release tag):
cargo install --git https://github.com/abuXsarkar/modern8086 modern8051-cli

m51 run prog.a51 \\
  --poke 2050=12H --poke 2051=34H \\
  --max-steps 100000 \\
  --mem-dump 3050,16`}</pre>
          <p>
            Exit codes: <code>0</code> = clean HLT, <code>1</code> = budget exhausted / IO trap / invalid
            opcode / breakpoint, <code>2</code> = couldn't read input or assemble failed.
          </p>
        </Section>

        <Section title="Why this exists">
          <p>
            Existing 8051 tools have one or more of: install hell (Windows-only, Java-required, broken on
            M1 Macs), 1998-era UI, infinite loops that freeze the whole app, no share-via-URL, no examples
            bundled, no inline mnemonic docs. modern8051 fixes all of those.
          </p>
          <p>
            Sibling tool to <a href="https://modern8086.com">modern8086</a>. Same chassis, same brand,
            same MIT license; distinct ISA because the 8051 is genuinely a different architecture.
          </p>
        </Section>
      </main>

      <footer className="docs-foot">
        modern8051 · MIT ·{" "}
        <a href="https://github.com/abuXsarkar/modern8086">source</a> ·{" "}
        <a href="/labs/">the whole family</a>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="docs-section">
      <h2 className="docs-h2">{title}</h2>
      {children}
    </section>
  );
}
