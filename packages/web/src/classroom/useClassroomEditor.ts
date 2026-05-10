// Bridges the IDE's main editor with the classroom transport.
//
// Three behaviours layered on top of plain editing:
//
//   1. While a student is in a room, debounced `buffer_update`
//      messages flow to the teacher so the teacher's roster view
//      stays current.
//   2. While a teacher has Broadcast on, debounced `broadcast_update`
//      messages flow to all students so the "Following teacher" pane
//      mirrors the teacher's screen.
//   3. While a teacher has taken control of a student, the teacher's
//      edits flow as `control_buffer` and the targeted student's
//      editor mirrors them in real time. The student's editor is
//      forced read-only for the duration so a controlled student
//      can't fight the teacher's keystrokes.
//
// The hook expects the host component to own the source string in
// React state. It never modifies that state directly except in case
// (3), where the controlled student's editor needs to follow the
// teacher's stream.

import { useEffect, useRef } from "react";
import { useClassroomStore } from "./store";
import { broadcastUpdate, bufferUpdate, controlBuffer as sendControlBuffer } from "./actions";

const SEND_DEBOUNCE_MS = 250;

export interface ClassroomEditorState {
  /** True when this client's editor must be locked: the controlled student. */
  readOnly: boolean;
}

export function useClassroomEditor(
  source: string,
  setSource: (s: string) => void,
): ClassroomEditorState {
  const status = useClassroomStore((s) => s.status);
  const role = useClassroomStore((s) => s.role);
  const myRollNo = useClassroomStore((s) => s.rollNo);
  const broadcasting = useClassroomStore((s) => s.broadcasting);
  const controlGrantedTo = useClassroomStore((s) => s.controlGrantedTo);
  const controlBufferStr = useClassroomStore((s) => s.controlBuffer);

  const isControlled =
    role === "student" && myRollNo !== null && controlGrantedTo === myRollNo;
  const isControllingSomeone = role === "teacher" && controlGrantedTo !== null;

  // ---- Outbound: this client's edits flow to the right channel ----------
  const sendTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (status !== "joined") return;
    if (sendTimerRef.current !== null) {
      window.clearTimeout(sendTimerRef.current);
    }
    sendTimerRef.current = window.setTimeout(() => {
      sendTimerRef.current = null;
      if (role === "student") {
        // A student under teacher control should not echo their (now
        // teacher-driven) buffer back as a buffer_update; the server
        // would reject it, but skipping the send saves a roundtrip.
        if (isControlled) return;
        bufferUpdate(source);
      } else if (role === "teacher") {
        if (isControllingSomeone) {
          // Teacher's keystrokes while in control are the
          // controlled student's content, not a broadcast.
          sendControlBuffer(source);
        } else if (broadcasting) {
          broadcastUpdate(source);
        }
      }
    }, SEND_DEBOUNCE_MS);
    return () => {
      if (sendTimerRef.current !== null) {
        window.clearTimeout(sendTimerRef.current);
        sendTimerRef.current = null;
      }
    };
    // `setSource` isn't a dep — same reference across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, status, role, isControlled, isControllingSomeone, broadcasting]);

  // ---- Inbound: a controlled student's editor follows control_buffer ----
  useEffect(() => {
    if (!isControlled) return;
    if (controlBufferStr === null) return;
    if (controlBufferStr === source) return;
    setSource(controlBufferStr);
    // Including `source` in deps would create a feedback loop with
    // the comparison above; the comparison is the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlBufferStr, isControlled]);

  return {
    readOnly: isControlled,
  };
}
