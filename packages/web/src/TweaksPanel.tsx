import { useEffect, useState } from "react";

const STORAGE_KEY = "emu8086.tweaks";

export type Density = "comfortable" | "compact";
export type Layout = "wide" | "balanced" | "equal";

export interface Tweaks {
  density: Density;
  layout: Layout;
  /** CSS color string. Empty = use the theme default. */
  accent: string;
  /** Paper-grain texture overlay. */
  grain: boolean;
}

const DEFAULTS: Tweaks = {
  density: "comfortable",
  layout: "balanced",
  accent: "",
  grain: true,
};

function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function saveTweaks(t: Tweaks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

/**
 * Live-applies tweaks to the document. The body classes drive the
 * density / layout / grain CSS hooks defined in theme.css and
 * responsive.css; the accent override sets a CSS custom property
 * directly on `:root` so it cascades through the entire token system.
 */
function applyTweaks(t: Tweaks) {
  document.body.classList.toggle("density-compact", t.density === "compact");
  document.body.classList.toggle("layout-wide", t.layout === "wide");
  document.body.classList.toggle("layout-equal", t.layout === "equal");
  document.body.classList.toggle("no-grain", !t.grain);
  if (t.accent) {
    document.documentElement.style.setProperty("--accent", t.accent);
  } else {
    document.documentElement.style.removeProperty("--accent");
  }
}

export function TweaksPanel() {
  const [tweaks, setTweaks] = useState<Tweaks>(() => loadTweaks());
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    applyTweaks(tweaks);
    saveTweaks(tweaks);
  }, [tweaks]);

  // Apply once at mount so the persisted tweaks take effect even
  // before the user opens the panel.
  useEffect(() => {
    applyTweaks(loadTweaks());
  }, []);

  function update<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    setTweaks((t) => ({ ...t, [key]: value }));
  }

  if (!open) {
    return (
      <button
        type="button"
        className="tweaks-trigger"
        onClick={() => setOpen(true)}
        title="Adjust appearance (density, layout, accent)"
        aria-label="Open tweaks panel"
      >
        ⚙
      </button>
    );
  }

  return (
    <div className="tweaks-panel" role="dialog" aria-label="Appearance tweaks">
      <div className="tweaks-head">
        <span className="title">Tweaks</span>
        <button
          type="button"
          className="x"
          onClick={() => setOpen(false)}
          aria-label="Close tweaks panel"
        >
          ×
        </button>
      </div>
      <div className="tweaks-body">
        <Section label="Density">
          <Segmented
            options={[
              { v: "comfortable", l: "Comfortable" },
              { v: "compact", l: "Compact" },
            ]}
            value={tweaks.density}
            onChange={(v) => update("density", v as Density)}
          />
        </Section>

        <Section label="Layout">
          <Segmented
            options={[
              { v: "wide", l: "Wide" },
              { v: "balanced", l: "Balanced" },
              { v: "equal", l: "Equal" },
            ]}
            value={tweaks.layout}
            onChange={(v) => update("layout", v as Layout)}
          />
        </Section>

        <Section label="Accent">
          <div className="accent-row">
            <input
              type="color"
              className="accent-swatch"
              value={tweaks.accent || "#c8521a"}
              onChange={(e) => update("accent", e.target.value)}
              aria-label="Pick accent color"
            />
            <button
              type="button"
              className="reset-link"
              onClick={() => update("accent", "")}
              title="Restore the design default accent"
            >
              reset
            </button>
          </div>
        </Section>

        <Section label="Surface">
          <Toggle
            label="Paper grain"
            value={tweaks.grain}
            onChange={(v) => update("grain", v)}
          />
        </Section>
      </div>
    </div>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}
function Section({ label, children }: SectionProps) {
  return (
    <div className="tweaks-section">
      <div className="tweaks-label">{label}</div>
      {children}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  options: Array<{ v: T; l: string }>;
  value: T;
  onChange: (v: T) => void;
}
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={o.v === value}
          className={`segmented-opt${o.v === value ? " active" : ""}`}
          onClick={() => onChange(o.v)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}
function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={`toggle${value ? " on" : ""}`}
      onClick={() => onChange(!value)}
    >
      <span className="toggle-thumb" />
      <span className="toggle-label">{label}</span>
    </button>
  );
}
