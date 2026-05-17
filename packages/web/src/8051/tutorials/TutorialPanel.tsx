import { useEffect, useMemo, useState } from "react";
import { TUTORIALS_8051 } from "./lessons";

const STORAGE_KEY = "modern8051.tutorial-progress";

interface Props {
  /** Called with the starter code when the user clicks Load. */
  onLoadCode: (source: string) => void;
}

interface ProgressState {
  /** id of the open tutorial, or null when picker is showing. */
  active: string | null;
  /** Step index within the active tutorial. */
  step: number;
  /** Highest step reached per tutorial-id — for the picker badge. */
  furthest: Record<string, number>;
}

function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: null, step: 0, furthest: {} };
    return JSON.parse(raw) as ProgressState;
  } catch {
    return { active: null, step: 0, furthest: {} };
  }
}

function saveProgress(p: ProgressState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch { /* */ }
}

export function Tutorials({ onLoadCode }: Props) {
  const [progress, setProgress] = useState<ProgressState>(loadProgress);
  useEffect(() => saveProgress(progress), [progress]);

  const tutorial = useMemo(
    () => TUTORIALS_8051.find((t) => t.id === progress.active) ?? null,
    [progress.active],
  );

  if (tutorial === null) {
    return (
      <div className="ide-panel">
        <h2 className="ide-panel-h">📖 Tutorials</h2>
        <ul className="tut-picker">
          {TUTORIALS_8051.map((t) => {
            const furthest = progress.furthest[t.id] ?? 0;
            const done = furthest >= t.steps.length;
            const pct = Math.min(100, Math.round((furthest / t.steps.length) * 100));
            return (
              <li key={t.id} className="tut-picker-item">
                <button
                  type="button"
                  className="tut-picker-btn"
                  onClick={() => setProgress((p) => ({ ...p, active: t.id, step: furthest >= t.steps.length ? 0 : furthest }))}
                >
                  <div className="tut-picker-title">
                    {t.title}
                    {done && <span className="tut-done-badge">done</span>}
                  </div>
                  <div className="tut-picker-blurb">{t.blurb}</div>
                  <div className="tut-picker-meta mono">
                    {t.estMinutes} min · {t.steps.length} steps · {pct}%
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const step = tutorial.steps[Math.min(progress.step, tutorial.steps.length - 1)];
  const lastStep = progress.step >= tutorial.steps.length - 1;

  return (
    <div className="ide-panel">
      <h2 className="ide-panel-h">
        📖 {tutorial.title}
        <span className="ide-panel-controls">
          <button
            type="button"
            className="tut-back"
            onClick={() => setProgress((p) => ({ ...p, active: null }))}
            title="Back to tutorial picker"
          >
            ✕
          </button>
        </span>
      </h2>
      <div className="tut-progress">
        Step {progress.step + 1} / {tutorial.steps.length}
        <div className="tut-progress-bar">
          <div
            className="tut-progress-fill"
            style={{ width: `${((progress.step + 1) / tutorial.steps.length) * 100}%` }}
          />
        </div>
      </div>
      <h3 className="tut-step-title">{step.title}</h3>
      <RenderInline text={step.body} />
      {step.starterCode && (
        <button
          type="button"
          className="ide-btn"
          onClick={() => onLoadCode(step.starterCode!)}
          style={{ width: "100%", marginTop: 6 }}
        >
          ⬆ Load this code
        </button>
      )}
      <div className="tut-nav">
        <button
          type="button"
          className="ide-btn"
          onClick={() => setProgress((p) => ({ ...p, step: Math.max(0, p.step - 1) }))}
          disabled={progress.step === 0}
        >
          ← Prev
        </button>
        {!lastStep ? (
          <button
            type="button"
            className="ide-btn ide-btn-primary"
            onClick={() =>
              setProgress((p) => {
                const next = Math.min(tutorial.steps.length - 1, p.step + 1);
                return {
                  ...p,
                  step: next,
                  furthest: { ...p.furthest, [tutorial.id]: Math.max(p.furthest[tutorial.id] ?? 0, next) },
                };
              })
            }
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="ide-btn ide-btn-primary"
            onClick={() =>
              setProgress((p) => ({
                ...p,
                active: null,
                step: 0,
                furthest: { ...p.furthest, [tutorial.id]: tutorial.steps.length },
              }))
            }
          >
            ✓ Done
          </button>
        )}
      </div>
    </div>
  );
}

/// Tiny markdown subset for tutorial bodies. Supports `**bold**`,
/// `*italic*`, `` `code` ``. Paragraphs split on blank lines.
function RenderInline({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="tut-body">
      {paragraphs.map((p, i) => (
        <p key={i}>{renderSpans(p)}</p>
      ))}
    </div>
  );
}

function renderSpans(text: string): React.ReactNode[] {
  // Pass through bold (**x**), italic (*x*), code (`x`). Naive single-pass
  // tokenization is enough — tutorial bodies are short and we control them.
  const out: React.ReactNode[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push(<strong key={i}>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push(<code key={i}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        flush();
        out.push(<em key={i}>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}
