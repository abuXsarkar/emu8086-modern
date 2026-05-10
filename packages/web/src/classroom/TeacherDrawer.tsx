// Teacher's view of the live room. P2 ships the structural pieces
// — roster (read-only), submission count, prompt textarea — wired
// to the store. The interactive bits (broadcast toggle,
// take-control, kick, hand-lower) land in P3.

import { useState } from "react";
import { useStrings } from "../i18n";
import { useClassroomStore } from "./store";
import { closeRoom, leaveClassroom, setPrompt } from "./actions";

export function TeacherDrawer() {
  const t = useStrings();
  const students = useClassroomStore((s) => s.studentsForTeacher);
  const submissions = useClassroomStore((s) => s.submissions);
  const prompt = useClassroomStore((s) => s.prompt);
  const [draftPrompt, setDraftPrompt] = useState(prompt);

  // Keep the textarea in sync with server-side prompt changes from
  // a different teacher tab (rare but possible during a reconnect).
  if (prompt !== draftPrompt && document.activeElement?.tagName !== "TEXTAREA") {
    setDraftPrompt(prompt);
  }

  const handsUp = students.filter((s) => s.handUp).length;

  function onCloseRoom(): void {
    if (window.confirm(t.classroomTeacherCloseRoom + "?")) {
      closeRoom();
      leaveClassroom();
    }
  }

  return (
    <div className="classroom-drawer-body">
      <section className="classroom-drawer-section" aria-labelledby="cls-roster">
        <header className="classroom-drawer-header">
          <h3 className="smallcaps" id="cls-roster">
            {t.classroomTeacherRoster}
          </h3>
          {handsUp > 0 ? (
            <span className="classroom-handsup-badge">
              {t.classroomTeacherHandsUp(handsUp)}
            </span>
          ) : null}
        </header>
        {students.length === 0 ? (
          <p className="classroom-empty">{t.classroomTeacherEmpty}</p>
        ) : (
          <ul className="classroom-roster">
            {students.map((s) => (
              <li
                key={s.rollNo}
                className={`classroom-roster-row${s.handUp ? " hand-up" : ""}${s.online ? "" : " offline"}`}
              >
                <span className="classroom-roster-roll mono">{s.rollNo}</span>
                <span className="classroom-roster-name">{s.displayName}</span>
                {s.handUp ? (
                  <span className="classroom-roster-hand" aria-label="hand up">
                    ✋
                  </span>
                ) : null}
                {s.online ? null : (
                  <span className="classroom-roster-offline">offline</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="classroom-drawer-section" aria-labelledby="cls-prompt">
        <header className="classroom-drawer-header">
          <h3 className="smallcaps" id="cls-prompt">
            {t.classroomTeacherPrompt}
          </h3>
        </header>
        <textarea
          className="classroom-prompt"
          value={draftPrompt}
          placeholder={t.classroomTeacherPromptHint}
          onChange={(e) => setDraftPrompt(e.target.value)}
          onBlur={() => {
            if (draftPrompt !== prompt) setPrompt(draftPrompt);
          }}
          rows={3}
        />
      </section>

      <section className="classroom-drawer-section" aria-labelledby="cls-subs">
        <header className="classroom-drawer-header">
          <h3 className="smallcaps" id="cls-subs">
            {t.classroomTeacherSubmissions}
          </h3>
          <span className="classroom-counter mono">{submissions.length}</span>
        </header>
        {submissions.length === 0 ? (
          <p className="classroom-empty">—</p>
        ) : (
          <ul className="classroom-submissions">
            {submissions.map((sub, i) => (
              <li key={`${sub.rollNo}-${sub.at}-${i}`} className="classroom-submission-row">
                <span className="classroom-roster-roll mono">{sub.rollNo}</span>
                <span className="classroom-roster-name">{sub.displayName}</span>
                <span className="classroom-submission-time mono">
                  {new Date(sub.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="classroom-drawer-footer">
        <button type="button" className="btn ghost" onClick={leaveClassroom}>
          {t.classroomLeave}
        </button>
        <button type="button" className="btn" onClick={onCloseRoom}>
          {t.classroomTeacherCloseRoom}
        </button>
      </div>
    </div>
  );
}
