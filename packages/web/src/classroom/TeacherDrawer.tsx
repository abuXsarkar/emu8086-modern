// Teacher's view of the live room. Roster (with per-row actions:
// lower-hand, kick, expand-to-comment), prompt textarea,
// submissions list. Each row, when expanded, surfaces the comment
// thread for that student plus a small composer.

import { useState } from "react";
import { useStrings } from "../i18n";
import { useClassroomStore } from "./store";
import {
  closeRoom,
  kickStudent,
  leaveClassroom,
  releaseControl,
  setBroadcast,
  setHand,
  setPrompt,
  takeControl,
} from "./actions";
import { CommentThread } from "./CommentThread";

interface TeacherDrawerProps {
  /** Current editor source — used as the seed buffer when the
   *  teacher flips Broadcast on so students see something
   *  immediately. */
  currentSource?: string;
}

export function TeacherDrawer({ currentSource }: TeacherDrawerProps = {}) {
  const t = useStrings();
  const students = useClassroomStore((s) => s.studentsForTeacher);
  const submissions = useClassroomStore((s) => s.submissions);
  const comments = useClassroomStore((s) => s.comments);
  const prompt = useClassroomStore((s) => s.prompt);
  const broadcasting = useClassroomStore((s) => s.broadcasting);
  const controlGrantedTo = useClassroomStore((s) => s.controlGrantedTo);
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [expanded, setExpanded] = useState<string | null>(null);

  const controlledStudent =
    controlGrantedTo === null
      ? null
      : students.find((s) => s.rollNo === controlGrantedTo) ?? null;

  function toggleBroadcast(): void {
    setBroadcast(!broadcasting, broadcasting ? undefined : currentSource);
  }

  // Keep the textarea in sync with server-side prompt changes from
  // a different teacher tab (rare but possible during a reconnect).
  if (prompt !== draftPrompt && document.activeElement?.tagName !== "TEXTAREA") {
    setDraftPrompt(prompt);
  }

  const handsUp = students.filter((s) => s.handUp).length;

  function onCloseRoom(): void {
    if (window.confirm(t.classroomTeacherCloseRoomConfirm)) {
      closeRoom();
      leaveClassroom();
    }
  }

  function onKick(rollNo: string, displayName: string): void {
    if (window.confirm(t.classroomTeacherKickConfirm(displayName))) {
      kickStudent(rollNo);
    }
  }

  return (
    <div className="classroom-drawer-body">
      <div className="classroom-actions">
        <button
          type="button"
          className={`btn${broadcasting ? " accent" : ""}`}
          onClick={toggleBroadcast}
          aria-pressed={broadcasting}
        >
          <span aria-hidden>📡</span>{" "}
          {broadcasting ? t.classroomTeacherBroadcastOn : t.classroomTeacherBroadcastOff}
        </button>
        {controlledStudent ? (
          <button
            type="button"
            className="btn accent"
            onClick={releaseControl}
            title={t.classroomTeacherControllingNow(controlledStudent.displayName)}
          >
            ⤺ {t.classroomTeacherReleaseControl}
          </button>
        ) : null}
      </div>
      {controlledStudent ? (
        <p className="classroom-status-line">
          {t.classroomTeacherControllingNow(controlledStudent.displayName)}
        </p>
      ) : null}

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
            {students.map((s) => {
              const studentComments = comments.filter((c) => c.rollNo === s.rollNo);
              const isOpen = expanded === s.rollNo;
              return (
                <li
                  key={s.rollNo}
                  className={`classroom-roster-row${s.handUp ? " hand-up" : ""}${s.online ? "" : " offline"}${isOpen ? " expanded" : ""}`}
                >
                  <button
                    type="button"
                    className="classroom-roster-summary"
                    onClick={() => setExpanded(isOpen ? null : s.rollNo)}
                    aria-expanded={isOpen}
                  >
                    <span className="classroom-roster-roll mono">{s.rollNo}</span>
                    <span className="classroom-roster-name">{s.displayName}</span>
                    {studentComments.length > 0 ? (
                      <span className="classroom-roster-badge mono" title={t.classroomCommentHeading}>
                        💬 {studentComments.length}
                      </span>
                    ) : null}
                    <span className="classroom-roster-chevron" aria-hidden>
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </button>
                  <div className="classroom-roster-actions-row">
                    {s.handUp ? (
                      <button
                        type="button"
                        className="classroom-roster-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHand(s.rollNo, false);
                        }}
                        title={t.classroomTeacherLowerHand}
                        aria-label={`${t.classroomTeacherLowerHand} ${s.displayName}`}
                      >
                        <span aria-hidden>✋</span>
                      </button>
                    ) : null}
                    {s.online ? null : (
                      <span className="classroom-roster-offline">offline</span>
                    )}
                    {controlGrantedTo === s.rollNo ? (
                      <button
                        type="button"
                        className="classroom-roster-action accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          releaseControl();
                        }}
                        title={t.classroomTeacherReleaseControl}
                        aria-label={`${t.classroomTeacherReleaseControl} ${s.displayName}`}
                      >
                        ⤺
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="classroom-roster-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          takeControl(s.rollNo);
                        }}
                        title={t.classroomTeacherTakeControl}
                        aria-label={`${t.classroomTeacherTakeControl} ${s.displayName}`}
                        disabled={!s.online}
                      >
                        ✎
                      </button>
                    )}
                    <button
                      type="button"
                      className="classroom-roster-action danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onKick(s.rollNo, s.displayName);
                      }}
                      title={t.classroomTeacherKick}
                      aria-label={`${t.classroomTeacherKick} ${s.displayName}`}
                    >
                      ×
                    </button>
                  </div>
                  {isOpen ? (
                    <CommentThread
                      rollNo={s.rollNo}
                      comments={studentComments}
                      role="teacher"
                    />
                  ) : null}
                </li>
              );
            })}
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
