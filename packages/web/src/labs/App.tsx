import { useEffect, useState } from "react";

type Status = "live" | "coming-soon" | "eventually";

type Lab = {
  name: string;
  family: string;
  blurb: string;
  href?: string;
  status: Status;
  badge?: string;
};

const LABS: Lab[] = [
  {
    name: "modern8086",
    family: "Microprocessor · Intel 8086",
    blurb:
      "16-bit IDE + emulator with time-travel debug, live peripherals, classroom mode, and PWA install. The flagship.",
    href: "/",
    status: "live",
    badge: "Flagship",
  },
  {
    name: "modern8085",
    family: "Microprocessor · Intel 8085",
    blurb:
      "8-bit sibling with full feature parity: 246-opcode ISA, 22 lab programs, 8 live trainer-kit devices, classroom mode, 13-locale i18n, in-app tutorials, hover docs with T-states, time-travel debug. Headless m85 CLI for autograding.",
    href: "/8085/about/",
    status: "live",
    badge: "New",
  },
  {
    name: "modern8051",
    family: "Microcontroller · Intel 8051",
    blurb: "8-bit MCU staple — 3-space memory, 256 opcodes, P0–P3 ports bound to 8 live devices.",
    href: "/8051/about/",
    status: "live",
    badge: "New",
  },
  {
    name: "modernARM",
    family: "Microprocessor · ARM Cortex-M",
    blurb: "Modern syllabus territory — Cortex-M0+ assembly with Thumb encoding.",
    status: "eventually",
  },
  {
    name: "modernRISC-V",
    family: "Microprocessor · RV32I",
    blurb: "Open-spec sibling for syllabi that have moved past x86.",
    status: "eventually",
  },
  {
    name: "modernKMap",
    family: "Digital logic · Karnaugh maps",
    blurb: "K-map + Quine-McCluskey simplifier for DLSD labs.",
    status: "eventually",
  },
  {
    name: "modernCache",
    family: "Computer organisation · Cache",
    blurb: "Direct / set-assoc / fully-associative cache simulator with hit-rate viz.",
    status: "eventually",
  },
  {
    name: "modernScheduler",
    family: "Operating systems · CPU scheduling",
    blurb: "FCFS / SJF / RR / Priority / MLFQ Gantt-chart visualiser.",
    status: "eventually",
  },
  {
    name: "modernPaging",
    family: "Operating systems · Page replacement",
    blurb: "FIFO / LRU / Optimal / Clock with frame-by-frame stepping.",
    status: "eventually",
  },
  {
    name: "modernSubnet",
    family: "Networks · IP / CIDR",
    blurb: "Subnetting + VLSM calculator with worked-out steps.",
    status: "eventually",
  },
];

const STORAGE_KEY = "modern8085.editor-theme";

export function App() {
  const [theme, setTheme] = useState<"vs" | "vs-dark">(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("modern8086.editor-theme");
      return v === "vs-dark" ? "vs-dark" : "vs";
    } catch {
      return "vs";
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* */ }
    if (theme === "vs-dark") document.body.classList.add("dark");
    else document.body.classList.remove("dark");
  }, [theme]);

  const live = LABS.filter((l) => l.status === "live");
  const soon = LABS.filter((l) => l.status === "coming-soon");
  const eventually = LABS.filter((l) => l.status === "eventually");

  return (
    <div className="labs-root">
      <header className="labs-header">
        <a href="/" className="labs-brand">
          <span className="labs-brand-mark">modern</span>
          <span className="labs-brand-fam">family</span>
        </a>
        <nav className="labs-nav">
          <a href="/">modern8086</a>
          <a href="/8085/">modern8085</a>
          <a href="https://github.com/abuXsarkar/modern8086" target="_blank" rel="noreferrer">
            source
          </a>
          <button
            type="button"
            className="labs-theme-toggle"
            onClick={() => setTheme((t) => (t === "vs" ? "vs-dark" : "vs"))}
            aria-label="Toggle dark mode"
          >
            {theme === "vs" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>

      <main className="labs-main">
        <section className="labs-hero">
          <h1 className="labs-h1">
            A family of <em>lab tools</em> for the architecture syllabus.
          </h1>
          <p className="labs-sub">
            Same chassis, same design language, same offline-capable PWA shell. Different cores. Built so a student
            on a Chromebook in airplane mode can do their lab work without installing anything.
          </p>
        </section>

        <Section title="Available now" labs={live} />
        {soon.length > 0 && <Section title="Coming soon" labs={soon} subdued />}
        {eventually.length > 0 && (
          <Section
            title="On the roadmap"
            labs={eventually}
            subdued
            footnote="No timelines. Order will be driven by which tools the community asks for first — open an issue if you have a vote."
          />
        )}
      </main>

      <footer className="labs-foot">
        modern8086 family · MIT · <a href="https://github.com/abuXsarkar/modern8086">source</a>
      </footer>
    </div>
  );
}

function Section({
  title,
  labs,
  subdued = false,
  footnote,
}: {
  title: string;
  labs: Lab[];
  subdued?: boolean;
  footnote?: string;
}) {
  return (
    <section className={`labs-section ${subdued ? "labs-section-subdued" : ""}`}>
      <h2 className="labs-h2">{title}</h2>
      <div className="labs-grid">
        {labs.map((l) => (
          <Card key={l.name} lab={l} />
        ))}
      </div>
      {footnote && <p className="labs-footnote">{footnote}</p>}
    </section>
  );
}

function Card({ lab }: { lab: Lab }) {
  const interactive = lab.status === "live" && lab.href;
  const inner = (
    <>
      {lab.badge && <span className={`labs-badge labs-badge-${lab.status}`}>{lab.badge}</span>}
      <div className="labs-card-name mono">{lab.name}</div>
      <div className="labs-card-family">{lab.family}</div>
      <p className="labs-card-blurb">{lab.blurb}</p>
      {interactive ? (
        <span className="labs-card-cta">Open →</span>
      ) : lab.status === "coming-soon" ? (
        <span className="labs-card-cta labs-card-cta-muted">Coming soon</span>
      ) : (
        <span className="labs-card-cta labs-card-cta-muted">Planned</span>
      )}
    </>
  );

  if (interactive && lab.href) {
    return (
      <a href={lab.href} className="labs-card labs-card-live">
        {inner}
      </a>
    );
  }
  return <div className={`labs-card labs-card-${lab.status}`}>{inner}</div>;
}
