// Student's view of the live room. P2 surfaces presence,
// the teacher's prompt, peer count, control / broadcast banners,
// and the leave action. The hand-raise + submit + follow-buffer
// behaviours land in P3.

import { useStrings } from "../i18n";
import { useClassroomStore } from "./store";
import { leaveClassroom } from "./actions";

export function StudentDrawer() {
  const t = useStrings();
  const displayName = useClassroomStore((s) => s.displayName);
  const peers = useClassroomStore((s) => s.peers);
  const prompt = useClassroomStore((s) => s.prompt);
  const broadcasting = useClassroomStore((s) => s.broadcasting);
  const controlGrantedTo = useClassroomStore((s) => s.controlGrantedTo);
  const meta = useClassroomStore((s) => s.meta);
  const myRollNo = useClassroomStore((s) => s.rollNo);

  const isControlled = controlGrantedTo !== null && controlGrantedTo === myRollNo;

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
        <div className="classroom-status-banner accent" role="status">
          {t.classroomStudentFollowingTeacher}
        </div>
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
