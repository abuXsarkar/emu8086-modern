import { useEffect, useState } from "react";
import { Mark51 } from "../8051/Mark51";

const THEME_KEY = "modern8051.editor-theme";

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
    <div className="m51land-root">
      <header className="m51land-header">
        <a href="/8051/" className="m51land-brand">
          <Mark51 size={26} />
          <span>modern</span>
          <span className="m51land-brand-strong">8051</span>
        </a>
        <nav className="m51land-nav">
          <a href="/8051/">Open the IDE</a>
          <a href="/8051/docs/">Docs</a>
          <a href="/labs/">Labs</a>
          <a href="https://github.com/abuXsarkar/modern8086" target="_blank" rel="noreferrer">GitHub</a>
          <button
            type="button"
            className="m51land-theme"
            onClick={() => setTheme((t) => (t === "vs" ? "vs-dark" : "vs"))}
            aria-label="Toggle dark mode"
          >
            {theme === "vs" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>

      <main>
        <Hero />
        <ForStudents />
        <Devices />
        <Pedagogy />
        <Classroom />
        <Sharing />
        <Family />
        <Credits />
      </main>

      <footer className="m51land-foot">
        <a href="/8051/">↺ Open the IDE</a> · <a href="/8051/docs/">Docs</a> ·{" "}
        <a href="https://github.com/abuXsarkar/modern8086" target="_blank" rel="noreferrer">Source</a> ·{" "}
        MIT — free forever
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section className="m51land-slide m51land-hero">
      <h1 className="m51land-h1">
        Intel <em>8051</em> in the browser.
      </h1>
      <p className="m51land-sub">
        Full ISA emulator (256 opcodes, 3-space memory) + Monaco IDE + 8 live trainer-kit devices bound to
        P0–P3 + classroom mode. Loads in a tab, runs offline as a PWA, ships zero install friction.
      </p>
      <p className="m51land-cta-row">
        <a className="m51land-cta m51land-cta-primary" href="/8051/">▶ Open the IDE</a>
        <a className="m51land-cta" href="/8051/docs/">Read the docs</a>
      </p>
      <p className="m51land-meta mono">
        sibling to <a href="/">modern8086</a> · same chassis · MIT
      </p>
    </section>
  );
}

function ForStudents() {
  return (
    <section className="m51land-slide">
      <h2>For students</h2>
      <ul className="m51land-checklist">
        <li><strong>Hover any mnemonic</strong> for an inline reference with machine-cycle counts.</li>
        <li><strong>Tab-complete</strong> mnemonics, registers, SFRs, and directives as you type.</li>
        <li><strong>Step / Run / Reset</strong> + register flash so you see every change.</li>
        <li><strong>16 canonical lab programs</strong> covering the Mazidi / Ayala / KIT-style course arc.</li>
        <li><strong>Tolerance auto-fix</strong> so paste-in from Keil A51, SDCC asx8051, AS31, or lab-manual PDFs assembles on first try.</li>
        <li><strong>Share-link</strong> — copy a URL that runs your exact program in someone else's browser.</li>
      </ul>
    </section>
  );
}

function Devices() {
  return (
    <section className="m51land-slide m51land-slide-tinted">
      <h2>8 live devices, P0–P3 port I/O</h2>
      <p>
        The 8051 has no <code>IN</code> / <code>OUT</code> — ports are SFRs at <code>80H/90H/A0H/B0H</code>. Every
        <code> MOV P1, A</code> talks to actual port memory, surfaced to JS-side devices that update between every Step.
        Each device rebinds to any of P0..P3 via a dropdown — 4 ports, 8 devices, your choice.
      </p>
      <div className="m51land-grid">
        <DeviceCard title="Seven-segment" port="P0 default" what="Bit-mapped 7-seg LEDs + decimal point. Cycle 0–9 with a DB look-up table + MOVC A,@A+DPTR." />
        <DeviceCard title="Traffic light" port="P1 default" what="Three coloured bulbs. State-machine the classic R → R+Y → G → Y → R sequence." />
        <DeviceCard title="LED bar" port="P1 default" what="8 LEDs in a row. RL A + MOV P1, A in a loop = a Knight Rider scanner." />
        <DeviceCard title="Hex keypad" port="P2 default" what="4×4 buttons 0–F. Click writes the value to the port SFR; MOV A, P2 reads it." />
        <DeviceCard title="Stepper" port="P2 default" what="Unipolar 4-coil rotor visualisation. Walk 03/06/0C/09 for CW." />
        <DeviceCard title="Printer" port="P3 default" what="Append-only text tape — captures every port write without losing repeats." />
        <DeviceCard title="Screen" port="P3 default" what="Green-on-black tty — handles LF, CR, BS, FF like a serial console." />
        <DeviceCard title="Robot" port="P3 default" what="Turtle graphics on a 16×16 grid. Forward / back / turn / pen up–down." />
      </div>
    </section>
  );
}

function DeviceCard({ title, port, what }: { title: string; port: string; what: string }) {
  return (
    <div className="m51land-card">
      <div className="m51land-card-title">{title}</div>
      <div className="m51land-card-port mono">port {port}</div>
      <p>{what}</p>
    </div>
  );
}

function Pedagogy() {
  return (
    <section className="m51land-slide">
      <h2>Built to be watched</h2>
      <p>
        Most existing 8051 simulators show registers as a static table — you click Run and a number flips. modern8051
        adds the pedagogical layer that's missing:
      </p>
      <ul className="m51land-checklist">
        <li><strong>Per-step register flash.</strong> The cells that changed pulse for 700 ms — A, B, DPTR, SP, PC, and the active R0–R7 bank.</li>
        <li><strong>Live PSW chips.</strong> CY / AC / F0 / RS1 / RS0 / OV / F1 / P shown as 8 distinct chips, lit when set. Pair with a slow Run for a live narration.</li>
        <li><strong>3-space memory inspector.</strong> Toggle IDATA / XDATA / CODE with one click — no other 8051 sim makes this as clear.</li>
        <li><strong>Inline error squiggles + auto-fix hints.</strong> Mistakes get a Monaco red underline; tolerance fixes (Keil ⇄ SDCC ⇄ asx8051 ⇄ AS31) appear as side-panel notes.</li>
        <li><strong>📖 Tutorials.</strong> Four progressive walkthroughs from <code>MOV A, #42H</code> to <code>MOV P1, A</code> chase pattern. Progress saves per-lesson in localStorage.</li>
      </ul>
    </section>
  );
}

function Classroom() {
  return (
    <section className="m51land-slide m51land-slide-tinted">
      <h2>Classroom mode</h2>
      <p>
        Teachers click the classroom pill in the header to start a live session. Students join with a short code.
        Source syncs through a Cloudflare Worker relay (same one <a href="/">modern8086</a> uses — the protocol
        is ISA-agnostic). Teacher can take control of a student's editor; the student sees their buffer lock.
      </p>
      <p>
        Free, no accounts, no servers to run — paste a code in chat, everyone's on the same buffer in seconds.
      </p>
    </section>
  );
}

function Sharing() {
  return (
    <section className="m51land-slide">
      <h2>Share + save</h2>
      <ul className="m51land-checklist">
        <li><strong>🔗 Share</strong> — copies a self-contained URL with your code in the fragment. Paste anywhere; anyone with a browser can run it.</li>
        <li><strong>⬇ Save</strong> — drops the editor contents as a <code>.a51</code> file named after the first label.</li>
        <li><strong>13 languages</strong> — locale picker covers en, es, hi, bn, gu, kn, ml, mr, or, pa, ta, te, as.</li>
        <li><strong>Headless CLI</strong> — <code>m51</code> for autograding (assemble, run, --poke, --bp, --mem-dump, JSON output).</li>
      </ul>
      <p className="mono m51land-install">
        <code>cargo install --git https://github.com/abuXsarkar/modern8086 modern8051-cli</code>
      </p>
    </section>
  );
}

function Family() {
  return (
    <section className="m51land-slide m51land-slide-tinted">
      <h2>The family</h2>
      <p>
        modern8051 is a sibling of <a href="/"><strong>modern8086</strong></a> and <a href="/8085/"><strong>modern8085</strong></a>.
        Same chassis, same design language, same MIT license, distinct ISA cores. The <a href="/labs/">catalogue page</a> lists
        every tool we ship + what's on the roadmap (ARM Cortex-M, RISC-V, K-map solver, CPU scheduler, …).
      </p>
    </section>
  );
}

function Credits() {
  return (
    <section className="m51land-slide">
      <h2>Credits</h2>
      <p>
        Built by <a href="https://github.com/abuXsarkar">Abu Sufian Sarkar</a>. Inspired by — and trying to be better than —
        EdSim51, MCU 8051 IDE, and Keil µVision's free evaluation. Example programs follow the
        Mazidi / Ayala / KIT-style lab arc and were sanity-checked end-to-end against the bundled core.
      </p>
      <p>
        The IDE chassis (Monaco editor, classroom relay, design tokens, PWA shell, i18n) is shared with modern8086 and
        modern8085 — all the polish that took two years to land on the 8086 IDE arrives ready-made on 8051.
      </p>
    </section>
  );
}
