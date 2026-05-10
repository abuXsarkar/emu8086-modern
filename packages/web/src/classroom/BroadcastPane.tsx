// Read-only mirror of the teacher's editor when broadcasting. Shown
// to students inside their drawer so they can keep their own work in
// the main editor and reference what the teacher's typing alongside.
//
// Intentionally a plain `<pre>` rather than a Monaco instance: the
// drawer is narrow, the typical 8086 example is small, and embedding
// a second editor would balloon the bundle. Syntax highlighting can
// come later if it proves needed.

import { useStrings } from "../i18n";

interface BroadcastPaneProps {
  source: string | null;
}

export function BroadcastPane({ source }: BroadcastPaneProps) {
  const t = useStrings();
  const content = source ?? "";
  return (
    <pre className="classroom-broadcast-pane mono" aria-live="polite">
      {content.length === 0 ? (
        <span className="classroom-broadcast-empty">
          {t.classroomStudentBroadcastEmpty}
        </span>
      ) : (
        content
      )}
    </pre>
  );
}
