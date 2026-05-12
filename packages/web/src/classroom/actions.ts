// Thin wrappers that send a typed `ClientMsg` over the active
// connection. Components call these directly; they no-op gracefully
// when not connected so we don't have to gate every button on the
// store's `status === "joined"`.

import type { RoomMeta } from "@modern8086/classroom-protocol";
import { classroomConnection } from "./connect";
import { classroomStore } from "./store";

export function startClassroom(meta: RoomMeta, teacherDisplayName: string): void {
  classroomConnection.start(meta, teacherDisplayName);
}

export function joinClassroom(
  roomId: string,
  rollNo: string,
  displayName: string,
  hostToken?: string,
): void {
  classroomConnection.join(roomId, rollNo, displayName, hostToken);
}

export function leaveClassroom(): void {
  classroomConnection.leave("user_left");
}

export function setHand(rollNo: string, up: boolean): void {
  classroomConnection.send({ t: "set_hand", rollNo, up });
}

export function submit(source: string): void {
  classroomConnection.send({ t: "submit", source });
}

export function bufferUpdate(source: string): void {
  classroomConnection.send({ t: "buffer_update", source });
}

export function setBroadcast(on: boolean, source?: string): void {
  classroomConnection.send({ t: "set_broadcast", on, source });
}

export function broadcastUpdate(source: string): void {
  classroomConnection.send({ t: "broadcast_update", source });
}

export function takeControl(rollNo: string): void {
  classroomConnection.send({ t: "take_control", rollNo });
}

export function releaseControl(): void {
  classroomConnection.send({ t: "release_control" });
}

export function controlBuffer(source: string): void {
  classroomConnection.send({ t: "control_buffer", source });
}

export function setPrompt(prompt: string): void {
  classroomConnection.send({ t: "set_prompt", prompt });
}

export function kickStudent(rollNo: string): void {
  classroomConnection.send({ t: "kick", rollNo });
}

export function closeRoom(): void {
  classroomConnection.send({ t: "close_room" });
}

export function addComment(rollNo: string, body: string): void {
  classroomConnection.send({ t: "add_comment", rollNo, body });
}

export function markCommentSeen(commentId: string): void {
  classroomConnection.send({ t: "mark_comment_seen", commentId });
}

/** Convenience for components that just want to know "are we live?". */
export function isJoined(): boolean {
  const s = classroomStore.get();
  return s.status === "joined";
}
