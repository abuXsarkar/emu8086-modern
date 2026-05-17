import { useEffect, useState } from "react";

const THEME_KEY = "modern8085.editor-theme";

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
    <div className="m85land-root">
      <header className="m85land-header">
        <a href="/8085/" className="m85land-brand">
          <span>modern</span>
          <span className="m85land-brand-strong">8085</span>
        </a>
        <nav className="m85land-nav">
          <a href="/8085/">Open the IDE</a>
          <a href="/8085/docs/">Docs</a>
          <a href="/labs/">Labs</a>
          <a href="https://github.com/abuXsarkar/modern8086" target="_blank" rel="noreferrer">GitHub</a>
          <button
            type="button"
            className="m85land-theme"
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

      <footer className="m85land-foot">
        <a href="/8085/">↺ Open the IDE</a> · <a href="/8085/docs/">Docs</a> ·{" "}
        <a href="https://github.com/abuXsarkar/modern8086" target="_blank" rel="noreferrer">Source</a> ·{" "}
        MIT — free forever
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section className="m85land-slide m85land-hero">
      <h1 className="m85land-h1">
        Intel <em>8085</em> in the browser.
      </h1>
      <p className="m85land-sub">
        Full ISA emulator + Monaco IDE + 8 live trainer-kit devices + classroom mode + time-travel
        debug. Loads in a tab, runs offline as a PWA, ships zero install friction.
      </p>
      <p className="m85land-cta-row">
        <a className="m85land-cta m85land-cta-primary" href="/8085/">▶ Open the IDE</a>
        <a className="m85land-cta" href="/8085/docs/">Read the docs</a>
      </p>
      <p className="m85land-meta mono">
        sibling to <a href="/">modern8086</a> · same chassis · MIT
      </p>
    </section>
  );
}

function ForStudents() {
  return (
    <section className="m85land-slide">
      <h2>For students</h2>
      <ul className="m85land-checklist">
        <li><strong>Hover any mnemonic</strong> for an inline reference with T-state counts.</li>
        <li><strong>Tab-complete</strong> mnemonics, registers, and directives as you type.</li>
        <li><strong>Step backwards</strong> with ↶ Back — replay-from-start, always correct.</li>
        <li><strong>Slow / Crawl run speeds</strong> + register flash so you see every change.</li>
        <li><strong>20+ canonical lab programs</strong> sourced from VTU/AKTU/Anna University manuals.</li>
        <li><strong>Tolerance auto-fix</strong> so paste-in from sim8085 / GNUSim8085 / OshonSoft / textbook PDFs assembles on first try.</li>
        <li><strong>Share-link</strong> — copy a URL that runs your exact program in someone else's browser.</li>
      </ul>
    </section>
  );
}

function Devices() {
  return (
    <section className="m85land-slide m85land-slide-tinted">
      <h2>8 live devices, real port I/O</h2>
      <p>Every <code>IN</code> / <code>OUT</code> talks to actual port memory, surfaced to JS-side devices that update between every Step:</p>
      <div className="m85land-grid">
        <DeviceCard title="Seven-segment" port="00H" what="Bit-mapped 7-seg LEDs + decimal point. Cycle 0–9 with a DB lookup table." />
        <DeviceCard title="Traffic light" port="01H" what="Three coloured bulbs. State-machine the classic R → R+Y → G → Y → R sequence." />
        <DeviceCard title="LED bar" port="02H" what="8 LEDs in a row. RLC + OUT in a loop = a Knight Rider scanner." />
        <DeviceCard title="Hex keypad" port="03H" what="4×4 buttons 0–F. Click writes the value to the port; IN reads it." />
        <DeviceCard title="Stepper" port="04H" what="Unipolar 4-coil rotor visualisation. Walk 03/06/0C/09 for CW." />
        <DeviceCard title="Printer" port="05H" what="Append-only text tape — captures every OUT byte without losing repeats." />
        <DeviceCard title="Screen" port="06H" what="Green-on-black tty — handles LF, CR, BS, FF like a serial console." />
        <DeviceCard title="Robot" port="07H" what="Turtle graphics on a 16×16 grid. Forward / back / turn / pen up–down." />
      </div>
    </section>
  );
}

function DeviceCard({ title, port, what }: { title: string; port: string; what: string }) {
  return (
    <div className="m85land-card">
      <div className="m85land-card-title">{title}</div>
      <div className="m85land-card-port mono">port {port}</div>
      <p>{what}</p>
    </div>
  );
}

function Pedagogy() {
  return (
    <section className="m85land-slide">
      <h2>Built to be watched</h2>
      <p>
        Most existing 8085 simulators show registers as a static table — you click Run and a number flips. modern8085
        adds the pedagogical layer that's missing:
      </p>
      <ul className="m85land-checklist">
        <li><strong>Fast / Slow / Crawl Run speeds.</strong> Slow at 180 ms per instruction, Crawl at 800 ms — classroom-demo pace.</li>
        <li><strong>Per-step register flash.</strong> The cells that changed pulse for 700 ms. Pair with Crawl for a live narration.</li>
        <li><strong>↶ Back.</strong> Stepped too far? Click Back. The emulator replays from start to the previous step.</li>
        <li><strong>Inline error squiggles + auto-fix hints.</strong> Mistakes get a Monaco red underline; tolerance fixes appear as side-panel notes so students learn the canonical form.</li>
        <li><strong>📖 Tutorials.</strong> Four progressive walkthroughs from "MVI A, 42H" to "Drive the seven-segment". Progress saves per-lesson in localStorage.</li>
      </ul>
    </section>
  );
}

function Classroom() {
  return (
    <section className="m85land-slide m85land-slide-tinted">
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
    <section className="m85land-slide">
      <h2>Share + save</h2>
      <ul className="m85land-checklist">
        <li><strong>🔗 Share</strong> — copies a self-contained URL with your code in the fragment. Paste anywhere; anyone with a browser can run it.</li>
        <li><strong>⬇ Save</strong> — drops the editor contents as a <code>.a85</code> file named after the first label.</li>
        <li><strong>13 languages</strong> — locale picker covers en, es, hi, bn, gu, kn, ml, mr, or, pa, ta, te, as.</li>
        <li><strong>Headless CLI</strong> — <code>m85</code> for autograding (assemble, run, --poke, --bp, --mem-dump, JSON output).</li>
      </ul>
      <p className="mono m85land-install">
        <code>cargo install --git https://github.com/abuXsarkar/modern8086 modern8085-cli</code>
      </p>
    </section>
  );
}

function Family() {
  return (
    <section className="m85land-slide m85land-slide-tinted">
      <h2>The family</h2>
      <p>
        modern8085 is a sibling of <a href="/"><strong>modern8086</strong></a>. Same chassis, same design language,
        same MIT license, distinct ISA core. There's a <a href="/labs/">catalogue page</a> that lists every tool
        we ship + what's on the roadmap (8051, ARM Cortex-M, RISC-V, K-map solver, CPU scheduler, …).
      </p>
    </section>
  );
}

function Credits() {
  return (
    <section className="m85land-slide">
      <h2>Credits</h2>
      <p>
        Built by <a href="https://github.com/abuXsarkar">Abu Sufian Sarkar</a>. Inspired by — and trying to be better than —
        GNUSim8085, sim8085.com, OshonSoft, and Jubin Mitra's simulator. Example programs sourced from
        GeeksforGeeks and Tutorialspoint with the bugs patched (see <a href="https://github.com/abuXsarkar/modern8086/blob/main/docs/plans/8085-port-research.md">docs/plans/8085-port-research.md</a>).
      </p>
      <p>
        The IDE chassis (Monaco editor, classroom relay, design tokens, PWA shell) is shared with modern8086 — all the polish that took two years to land on the 8086 IDE arrives ready-made on 8085.
      </p>
    </section>
  );
}
