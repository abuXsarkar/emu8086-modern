// Eager trigger button + lazy drawer. The trigger weighs almost
// nothing (just the 📖 icon and an onClick); the drawer pulls in
// the picker UI, the active-lesson view, the tiny markdown
// renderer, and the 10 lessons (~25 KB of string literals). Keeping
// the drawer behind React.lazy + Suspense saves all of that from
// the critical-path bundle.

import { Suspense, lazy, useState } from "react";

const TutorialPanelDrawer = lazy(() => import("./TutorialPanelDrawer"));

interface TutorialPanelProps {
  /** Called with starter code when the user clicks "Load this code". */
  onLoadCode: (source: string) => void;
}

export function TutorialPanel({ onLoadCode }: TutorialPanelProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="tutorial-trigger"
        onClick={() => setOpen(true)}
        title="Open tutorials"
        aria-label="Open tutorials"
      >
        📖
      </button>
    );
  }

  return (
    <Suspense fallback={<TutorialDrawerSkeleton />}>
      <TutorialPanelDrawer onLoadCode={onLoadCode} onClose={() => setOpen(false)} />
    </Suspense>
  );
}

/** Minimal placeholder visible during the lazy-chunk fetch. Same
 *  drawer frame as the loaded drawer so the layout doesn't jump. */
function TutorialDrawerSkeleton() {
  return (
    <aside className="tutorial-drawer" aria-busy="true" aria-label="Tutorials loading">
      <header className="tutorial-head">
        <span className="title smallcaps">Tutorials</span>
      </header>
      <div className="tutorial-body">
        <p className="tutorial-intro">Loading…</p>
      </div>
    </aside>
  );
}
