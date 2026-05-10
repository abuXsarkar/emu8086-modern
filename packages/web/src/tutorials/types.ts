// Shape of an in-app tutorial. The set lives in `lessons.ts` as
// plain data — adding a new lesson is one entry; no React code
// changes. Steps render their `body` through a tiny markdown subset
// (see `renderInline` in TutorialPanel) — keep the body to short
// paragraphs with **bold**, *italic*, and `code` spans.
//
// Validation is intentionally manual for v1: the student clicks
// "Next" when they've understood. Auto-validation (assert ax==42
// after Run) is a follow-up; the data layer already has the
// `expect` field reserved.

export interface TutorialStep {
  /** Stable id, used as the localStorage progress key. */
  id: string;
  /** Heading shown at the top of the step. */
  title: string;
  /** Step body — markdown subset (see TutorialPanel.renderInline). */
  body: string;
  /** If present, a "Load this code" button appears that drops the
   *  snippet into the editor and resets the stepper. */
  starterCode?: string;
  /** Optional one-line nudge surfaced on the second visit. */
  hint?: string;
}

export interface Tutorial {
  /** Stable id; used as the picker key and the progress key prefix. */
  id: string;
  /** Display title shown in the picker. */
  title: string;
  /** One-line description shown under the title. */
  blurb: string;
  /** Rough completion estimate in minutes; informs the picker. */
  estMinutes: number;
  /** Ordered steps. */
  steps: TutorialStep[];
}
