// Classroom-mode client state. A single Zustand store backs the
// header pill, the slide-out drawer, the consent modal, and the
// editor's "you are being watched / edited" banners — all of these
// need to react to the same WebSocket events, so a global store
// avoids prop-drilling and keeps the transport layer (`connect.ts`)
// runtime-friendly.
//
// The store models the server-side `RoomSnapshot` plus a few client-
// only fields (status, last error, reconnect counter). Actions are
// kept out of this file: they're closed over the live WebSocket in
// `connect.ts` and re-bound on each session.

import { create } from "zustand";
import type {
  Comment,
  PeerCount,
  RoomMeta,
  StudentPublic,
  Submission,
} from "@emu8086/classroom-protocol";

export type ClassroomStatus =
  | "idle"
  | "connecting"
  | "joined"
  | "reconnecting"
  | "closed"
  | "error";

export type CloseReason =
  | "teacher_closed"
  | "reaped"
  | "kicked"
  | "replaced_elsewhere"
  | "error"
  | "user_left";

export interface StudentBufferEntry {
  source: string;
  at: number;
}

export interface ClassroomState {
  status: ClassroomStatus;
  role: "teacher" | "student" | null;
  roomId: string | null;
  hostToken: string | null;
  meta: RoomMeta | null;
  rollNo: string | null;
  displayName: string | null;
  prompt: string;
  broadcasting: boolean;
  broadcastBuffer: string | null;
  controlGrantedTo: string | null;
  /** Teacher-only: full per-student visibility. */
  studentsForTeacher: StudentPublic[];
  studentBuffers: Record<string, StudentBufferEntry>;
  submissions: Submission[];
  /** Student-only: aggregated peer count. */
  peers: PeerCount | null;
  /** Per-student comment list. Teacher receives all; student
   *  receives only their own. Sorted by `at` ascending. */
  comments: Comment[];

  /** Last user-facing error (translated by the consumer). */
  errorMessage: string | null;
  /** Reconnect attempt counter; resets on a successful re-join. */
  reconnectAttempt: number;
  /** Why the session ended; populated when status === "closed". */
  closeReason: CloseReason | null;
}

const INITIAL: ClassroomState = {
  status: "idle",
  role: null,
  roomId: null,
  hostToken: null,
  meta: null,
  rollNo: null,
  displayName: null,
  prompt: "",
  broadcasting: false,
  broadcastBuffer: null,
  controlGrantedTo: null,
  studentsForTeacher: [],
  studentBuffers: {},
  submissions: [],
  peers: null,
  comments: [],
  errorMessage: null,
  reconnectAttempt: 0,
  closeReason: null,
};

interface InternalApi {
  reset: () => void;
  patch: (next: Partial<ClassroomState>) => void;
}

export const useClassroomStore = create<ClassroomState & InternalApi>((set) => ({
  ...INITIAL,
  reset: () => set({ ...INITIAL }),
  patch: (next) => set((s) => ({ ...s, ...next })),
}));

/**
 * Imperative accessors for the connection layer. Components should
 * use the hook (`useClassroomStore`) for reactivity; the transport
 * uses `getState()` / `setState()` so it can be a pure function
 * outside the React tree.
 */
export const classroomStore = {
  get: () => useClassroomStore.getState(),
  set: (patch: Partial<ClassroomState>) =>
    useClassroomStore.setState((s) => ({ ...s, ...patch })),
  reset: () => useClassroomStore.getState().reset(),
};
