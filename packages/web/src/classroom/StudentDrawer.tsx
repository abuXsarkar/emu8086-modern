// Student's view of the live room. Surfaces presence + prompt + peer
// count + control/broadcast banners, and lets the student raise/lower
// their hand and submit their current buffer to the teacher.

import { useState } from "react";
import { useStrings } from "../i18n";
import { useClassroomStore } from "./store";
import { leaveClassroom, setHand, submit } from "./actions";
import { BroadcastPane } from "./BroadcastPane";
import { CommentThread } from "./CommentThread";

interface StudentDrawerProps {
  /** Current editor buffer to send when the student presses Submit. */
  currentSource?: string;
}

export function StudentDrawer({ currentSource }: StudentDrawerProps = {}) {
  const t = useStrings();
  const displayName = useClassroomStore((s) => s.displayName);
  const peers = useClassroomStore((s) => s.peers);
  const prompt = useClassroomStore((s) => s.prompt);
  const broadcasting = useClassroomStore((s) => s.broadcasting);
  const controlGrantedTo = useClassroomStore((s) => s.controlGrantedTo);
  const meta = useClassroomStore((s) => s.meta);
  const myRollNo = useClassroomStore((s) => s.rollNo);
  const studentsForTeacher = useClassroomStore((s) => s.studentsForTeacher);
  const broadcastBuffer = useClassroomStore((s) => s.broadcastBuffer);
  const comments = useClassroomStore((s) => s.comments);

  const isControlled = controlGrantedTo !== null && controlGrantedTo === myRollNo;
  // The roster broadcast carries every student's handUp; the student
  // itself can also derive its own handUp by looking up its rollNo.
  // It's a fast O(N) walk on a ~30-item list — fine.
  const myEntry =
    myRollNo === null
      ? null
      : studentsForTeacher.find((s) => s.rollNo === myRollNo) ?? null;
  // Students don't receive `roster_changed` directly (server filters by
  // role), but `hand_changed` updates studentsForTeacher only on the
  // teacher's side. So for students we keep optimistic local hand
  // state and reconcile with hand_changed events via the store
  // subscription if/when the protocol carries them. For now: track
  // locally; the server is authoritative on broadcast back.
  const [optimisticHandUp, setOptimisticHandUp] = useState(false);
  const handUp = myEntry?.handUp ?? optimisticHandUp;
  const [submitFlash, setSubmitFlash] = useState<string | null>(null);

  function toggleHand(): void {
    if (myRollNo === null) return;
    const next = !handUp;
    setOptimisticHandUp(next);
    setHand(myRollNo, next);
  }

  function onSubmit(): void {
    if (typeof currentSource !== "string") return;
    if (!window.confirm(t.classroomStudentSubmitConfirm)) return;
    submit(currentSource);
    setSubmitFlash(t.classroomStudentSubmitDone);
    window.setTimeout(() => setSubmitFlash(null), 1800);
  }

  return (
    <div className="classroom-drawer-body">
      <p className="classroom-status-line">
        {displayName ? t.classroomStudentConnected(displayName) : null}
      </p>

      {isControlled ? (
        <div className="classroom-status-banner danger" role="status">
          {t.classroomStudentControlled(meta?.teacherName ?? "")}
        </div>
      ) : null}

      {broadcasting && !isControlled ? (
        <section className="classroom-drawer-section" aria-labelledby="cls-broadcast-s">
          <header className="classroom-drawer-header">
            <h3 className="smallcaps" id="cls-broadcast-s">
              {t.classroomStudentFollowingTeacher}
            </h3>
          </header>
          <BroadcastPane source={broadcastBuffer} />
        </section>
      ) : null}

      <div className="classroom-actions">
        <button
          type="button"
          className={`btn classroom-hand-btn${handUp ? " up" : ""}`}
          onClick={toggleHand}
          aria-pressed={handUp}
        >
          <span aria-hidden>✋</span>{" "}
          {handUp ? t.classroomStudentLowerHand : t.classroomStudentRaiseHand}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onSubmit}
          disabled={typeof currentSource !== "string"}
        >
          {t.classroomStudentSubmit}
        </button>
      </div>
      {submitFlash ? (
        <p className="classroom-flash" role="status">
          {submitFlash}
        </p>
      ) : null}

      {prompt ? (
        <section className="classroom-drawer-section" aria-labelledby="cls-prompt-s">
          <header className="classroom-drawer-header">
            <h3 className="smallcaps" id="cls-prompt-s">
              {t.classroomTeacherPrompt}
            </h3>
          </header>
          <p className="classroom-prompt-readonly">{prompt}</p>
        </section>
      ) : null}

      {myRollNo ? (
        <section className="classroom-drawer-section" aria-labelledby="cls-comments-s">
          <header className="classroom-drawer-header">
            <h3 className="smallcaps" id="cls-comments-s">
              {t.classroomCommentHeading}
            </h3>
            {(() => {
              const unseen = comments.filter((c) => c.seenAt === null).length;
              return unseen > 0 ? (
                <span className="classroom-handsup-badge">
                  {t.classroomCommentNew(unseen)}
                </span>
              ) : null;
            })()}
          </header>
          <CommentThread rollNo={myRollNo} comments={comments} role="student" />
        </section>
      ) : null}

      {peers ? (
        <p className="classroom-peers">
          {t.classroomStudentPeers(peers.total)}
          {peers.handsUp > 0 ? (
            <>
              {" — "}
              <span className="mono">{t.classroomTeacherHandsUp(peers.handsUp)}</span>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="classroom-drawer-footer">
        <button type="button" className="btn ghost" onClick={leaveClassroom}>
          {t.classroomLeave}
        </button>
      </div>
    </div>
  );
}
