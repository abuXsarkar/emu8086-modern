// Drawer half of the tutorials panel — picker + active-lesson view
// plus the tiny markdown subset renderer. Lazy-loaded by
// `TutorialPanel.tsx`; never imported eagerly so the 10 lessons
// (~25 KB of string literals) and this UI stay out of the first-
// paint bundle.

import { useEffect, useMemo, useRef, useState } from "react";
import { TUTORIALS } from "./lessons";
import type { Tutorial, TutorialStep } from "./types";
import {
  getActive,
  getCompletedSteps,
  markStepCompleted,
  resetTutorialProgress,
  setActive,
} from "./progress";

interface TutorialPanelDrawerProps {
  /** Called with starter code when the user clicks "Load this code". */
  onLoadCode: (source: string) => void;
  /** Caller-controlled close — flips the parent's `open` state. */
  onClose: () => void;
}

// Default export so `React.lazy(() => import("./TutorialPanelDrawer"))` resolves.
export default function TutorialPanelDrawer({ onLoadCode, onClose }: TutorialPanelDrawerProps) {
  const [active, setActiveState] = useState(() => getActive());
  const [bumpProgress, setBumpProgress] = useState(0);

  // Persist active state changes.
  useEffect(() => {
    setActive(active);
  }, [active]);

  const tutorial = active ? TUTORIALS.find((t) => t.id === active.tutorialId) ?? null : null;

  function startTutorial(id: string): void {
    setActiveState({ tutorialId: id, stepIndex: 0 });
  }

  function closePanel(): void {
    onClose();
  }

  function exitToPicker(): void {
    setActiveState(null);
  }

  function goStep(delta: number): void {
    if (!active || !tutorial) return;
    const nextIdx = Math.max(0, Math.min(tutorial.steps.length - 1, active.stepIndex + delta));
    if (nextIdx === active.stepIndex) return;
    // Mark the step we're leaving as completed (so a learner gets credit
    // for reaching every step they've seen, even via Prev).
    const leavingStep = tutorial.steps[active.stepIndex];
    if (leavingStep) markStepCompleted(tutorial.id, leavingStep.id);
    setActiveState({ tutorialId: tutorial.id, stepIndex: nextIdx });
    setBumpProgress((n) => n + 1);
  }

  function finishTutorial(): void {
    if (!active || !tutorial) return;
    const lastStep = tutorial.steps[tutorial.steps.length - 1];
    if (lastStep) markStepCompleted(tutorial.id, lastStep.id);
    exitToPicker();
  }

  function resetCurrent(): void {
    if (!tutorial) return;
    if (window.confirm("Reset progress on this tutorial?")) {
      resetTutorialProgress(tutorial.id);
      setActiveState({ tutorialId: tutorial.id, stepIndex: 0 });
      setBumpProgress((n) => n + 1);
    }
  }

  return (
    <aside className="tutorial-drawer" aria-label="Tutorials">
      <header className="tutorial-head">
        <span className="title smallcaps">
          {tutorial ? tutorial.title : "Tutorials"}
        </span>
        <div className="tutorial-head-actions">
          {tutorial ? (
            <button
              type="button"
              className="tutorial-icon-btn"
              onClick={exitToPicker}
              title="Back to lesson list"
              aria-label="Back to lesson list"
            >
              ◀
            </button>
          ) : null}
          <button
            type="button"
            className="tutorial-icon-btn"
            onClick={closePanel}
            title="Close tutorials"
            aria-label="Close tutorials"
          >
            ×
          </button>
        </div>
      </header>

      {tutorial && active ? (
        <ActiveLessonView
          tutorial={tutorial}
          stepIndex={active.stepIndex}
          onPrev={() => goStep(-1)}
          onNext={() => goStep(+1)}
          onFinish={finishTutorial}
          onReset={resetCurrent}
          onLoadCode={onLoadCode}
        />
      ) : (
        <LessonPickerView onStart={startTutorial} bump={bumpProgress} />
      )}
    </aside>
  );
}

// ---------- Picker ----------------------------------------------------------

function LessonPickerView({
  onStart,
  bump,
}: {
  onStart: (id: string) => void;
  bump: number;
}) {
  // `bump` is a manual re-render trigger after progress mutations
  // outside React's state (localStorage writes).
  void bump;
  return (
    <div className="tutorial-body">
      <p className="tutorial-intro">
        Ten short, hands-on lessons. Each loads its own example code into
        the editor as you walk through it. Progress saves locally so you
        can come back later.
      </p>
      <ul className="tutorial-list">
        {TUTORIALS.map((t, i) => {
          const completed = getCompletedSteps(t.id).size;
          const total = t.steps.length;
          const done = completed >= total;
          return (
            <li key={t.id} className={`tutorial-card${done ? " done" : ""}`}>
              <button type="button" className="tutorial-card-btn" onClick={() => onStart(t.id)}>
                <div className="tutorial-card-row">
                  <span className="tutorial-card-num mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="tutorial-card-title">{t.title}</span>
                  <span className="tutorial-card-mins mono">{t.estMinutes} min</span>
                </div>
                <p className="tutorial-card-blurb">{t.blurb}</p>
                <div className="tutorial-card-progress">
                  <span className="mono">
                    {completed} / {total}
                  </span>
                  <span
                    className="tutorial-card-bar"
                    style={{ ["--pct" as string]: `${(completed / total) * 100}%` }}
                    aria-hidden
                  />
                  {done ? <span className="tutorial-card-done">✓</span> : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Active lesson ---------------------------------------------------

function ActiveLessonView({
  tutorial,
  stepIndex,
  onPrev,
  onNext,
  onFinish,
  onReset,
  onLoadCode,
}: {
  tutorial: Tutorial;
  stepIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  onReset: () => void;
  onLoadCode: (source: string) => void;
}) {
  const step: TutorialStep = tutorial.steps[stepIndex];
  const last = stepIndex === tutorial.steps.length - 1;
  const first = stepIndex === 0;
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Scroll body to top whenever the step changes — helpful in a
  // long-content step that scrolls.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [stepIndex]);

  return (
    <div className="tutorial-active">
      <div className="tutorial-progress-bar" aria-hidden>
        <span
          className="tutorial-progress-fill"
          style={{ width: `${((stepIndex + 1) / tutorial.steps.length) * 100}%` }}
        />
      </div>
      <div className="tutorial-step-meta mono">
        step {stepIndex + 1} / {tutorial.steps.length}
      </div>
      <div className="tutorial-step-body" ref={bodyRef}>
        <h3 className="tutorial-step-title">{step.title}</h3>
        <RenderedMarkdown source={step.body} />
        {step.starterCode ? (
          <button
            type="button"
            className="btn"
            onClick={() => onLoadCode(step.starterCode!)}
          >
            Load this code into the editor
          </button>
        ) : null}
      </div>
      <footer className="tutorial-nav">
        <button
          type="button"
          className="btn ghost"
          onClick={onReset}
          title="Reset this tutorial's progress"
        >
          Reset
        </button>
        <div className="tutorial-nav-mid">
          <button type="button" className="btn ghost" disabled={first} onClick={onPrev}>
            ← Prev
          </button>
          {last ? (
            <button type="button" className="btn primary" onClick={onFinish}>
              Finish
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={onNext}>
              Next →
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

// ---------- Tiny markdown subset --------------------------------------------

/**
 * Tutorial bodies use a small markdown subset:
 *   - blank line = paragraph break
 *   - lines starting with `- ` = list item
 *   - **bold**, *italic*, `code` (single-line spans, no nesting)
 * Anything else renders as plain text. Keeping this hand-rolled
 * avoids dragging in a 30 KB markdown library for a few features.
 */
function RenderedMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);
  return (
    <div className="tutorial-md">
      {blocks.map((b, i) => {
        if (b.kind === "list") {
          return (
            <ul key={i}>
              {b.items.map((line, j) => (
                <li key={j}>{renderInline(line)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(b.text)}</p>;
      })}
    </div>
  );
}

type Block = { kind: "para"; text: string } | { kind: "list"; items: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ kind: "list", items });
      continue;
    }
    // Accumulate consecutive non-blank lines into one paragraph;
    // join with a space so manual line breaks don't fragment prose.
    const start = i;
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("- ")) {
      i++;
    }
    blocks.push({ kind: "para", text: lines.slice(start, i).join(" ") });
  }
  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  // Tokenize on a single regex with capture groups for each style.
  // Order matters: bold (**) before italic (*) so the asterisks don't
  // get consumed by the italic pattern first.
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(
        <code key={key++} className="mono">
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
