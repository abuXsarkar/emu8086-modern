// Wire protocol for classroom mode.
//
// All values flowing over the WebSocket are JSON-serializable. No
// `Map`, no `Date`, no `Uint8Array` — pick `Record` and epoch-ms
// numbers and base64 strings if you need that shape on the server
// side. The discriminator field is always `t`; switch on `t` to
// narrow the union.
//
// See docs/classroom-mode.md for the design context behind these
// shapes.

export { PROTOCOL_VERSION } from "./version.js";

// ---------- Room metadata ----------------------------------------------------

/**
 * Room metadata set by the teacher at room creation. The whole record
 * is broadcast to every participant and rendered in the classroom
 * banner — so this is what gives the session its formal-lab feel.
 *
 * `course`, `teacherName`, and `date` are required; everything else
 * is optional. The client should default `date` to today's local
 * date in YYYY-MM-DD form before sending.
 */
export interface RoomMeta {
  course: string;
  courseCode?: string;
  section?: string;
  semester?: string;
  institute?: string;
  department?: string;
  teacherName: string;
  teacherTitle?: string;
  sessionTitle?: string;
  date: string;
  /** URL fetched client-side by every participant; the server does not proxy it. */
  logoUrl?: string;
}

// ---------- Public projections of room state --------------------------------

/** Per-student information visible to the teacher in their roster. */
export interface StudentPublic {
  rollNo: string;
  displayName: string;
  online: boolean;
  handUp: boolean;
  /** epoch ms of join; used to sort the roster stably. */
  joinedAt: number;
  /** epoch ms of last buffer update the server received. */
  bufferUpdatedAt: number;
}

/** What students see about the rest of the class — anonymized counts only. */
export interface PeerCount {
  /** Number of online students, excluding the teacher. */
  total: number;
  /** Number of students currently with hand raised. */
  handsUp: number;
}

export interface Submission {
  rollNo: string;
  displayName: string;
  source: string;
  at: number;
}

/**
 * Per-student note left by the teacher during the session. Comments
 * are private to (the teacher, the targeted student) — other
 * students never receive them. Lifetime is the room's lifetime:
 * when the session is reaped or closed, comments go away with it.
 */
export interface Comment {
  /** Server-generated stable id; used as the React key + seen-target. */
  id: string;
  /** rollNo of the student the comment is about. */
  rollNo: string;
  /** The comment text. Capped at MAX_COMMENT_BYTES on the server. */
  body: string;
  /** epoch ms of the comment's server-side timestamp. */
  at: number;
  /** epoch ms of when the student first dismissed the badge. null until seen. */
  seenAt: number | null;
}

/**
 * Snapshot sent to a fresh joiner so they can render the room without
 * waiting for incremental updates. Teacher receives the full
 * `studentsForTeacher`; students receive only `peers`.
 */
export interface RoomSnapshot {
  roomId: string;
  meta: RoomMeta;
  createdAt: number;
  prompt: string;
  broadcasting: boolean;
  /** Latest broadcast buffer if `broadcasting`; null otherwise. */
  broadcastBuffer: string | null;
  /** rollNo of the student under teacher control, null if no one is. */
  controlGrantedTo: string | null;
  /** Populated for the teacher only. */
  studentsForTeacher?: StudentPublic[];
  /** Populated for students only. */
  peers?: PeerCount;
  /** All comments visible to this joiner — teacher sees everyone's,
   *  the student sees only their own. */
  comments?: Comment[];
}

// ---------- Client → server -------------------------------------------------

export type ClientMsg =
  | {
      t: "create";
      protocolVersion: number;
      meta: RoomMeta;
      teacherDisplayName: string;
    }
  | {
      t: "join";
      protocolVersion: number;
      roomId: string;
      rollNo: string;
      displayName: string;
      /** Required iff the joiner is the teacher reconnecting. */
      hostToken?: string;
    }
  | { t: "leave" }
  | { t: "set_hand"; rollNo: string; up: boolean }
  | { t: "buffer_update"; source: string }
  | { t: "submit"; source: string }
  | { t: "set_broadcast"; on: boolean; source?: string }
  | { t: "broadcast_update"; source: string }
  | { t: "take_control"; rollNo: string }
  | { t: "release_control" }
  | { t: "control_buffer"; source: string }
  | { t: "set_prompt"; prompt: string }
  | { t: "kick"; rollNo: string }
  | { t: "close_room" }
  /** Teacher leaves a private note on a specific student. */
  | { t: "add_comment"; rollNo: string; body: string }
  /** Student dismisses the unread badge for a specific comment. */
  | { t: "mark_comment_seen"; commentId: string };

// ---------- Server → client -------------------------------------------------

export type ServerMsg =
  | {
      t: "created";
      roomId: string;
      hostToken: string;
      meta: RoomMeta;
      createdAt: number;
    }
  | {
      t: "joined";
      /** Full snapshot of the room as the joiner is allowed to see it. */
      snapshot: RoomSnapshot;
      /** "teacher" or the rollNo of the joining student. */
      you: string;
      role: "teacher" | "student";
    }
  /** Sent to teacher only. */
  | { t: "roster_changed"; students: StudentPublic[] }
  /** Sent to students only. */
  | { t: "peers_changed"; peers: PeerCount }
  | { t: "hand_changed"; rollNo: string; up: boolean }
  /** Per-student buffer update. Teacher receives all students'; students receive nothing here. */
  | { t: "student_buffer"; rollNo: string; source: string; at: number }
  /** Sent to teacher only when a submission lands. Students get no echo. */
  | { t: "submission_received"; submission: Submission }
  | { t: "broadcast_state"; on: boolean; source: string | null }
  | { t: "broadcast_update"; source: string }
  | { t: "control_change"; rollNo: string | null }
  /** Sent to the controlled student only — replaces their editor on each frame. */
  | { t: "control_buffer"; source: string }
  | { t: "prompt_changed"; prompt: string }
  | { t: "kicked"; reason: string }
  | { t: "replaced_elsewhere" }
  | {
      t: "room_closed";
      reason: "teacher_closed" | "reaped" | "error";
    }
  /** Teacher (echo) + targeted student receive this when a comment lands. */
  | { t: "comment_added"; comment: Comment }
  /** Teacher + student see this when a comment is dismissed by the student. */
  | { t: "comment_seen"; commentId: string; rollNo: string; seenAt: number }
  | {
      t: "error";
      code: ErrorCode;
      message: string;
    };

// ---------- Error codes -----------------------------------------------------

/**
 * Stable identifiers the client matches on. The accompanying
 * `message` is human-readable and may be localized server-side; the
 * code is the contract.
 */
export type ErrorCode =
  | "protocol_mismatch"
  | "room_not_found"
  | "room_closed"
  | "roll_no_required"
  | "roll_no_taken"
  | "display_name_required"
  | "course_required"
  | "teacher_name_required"
  | "host_token_required"
  | "host_token_invalid"
  | "not_authorized"
  | "too_large"
  | "rate_limited"
  | "internal_error"
  /** Synthesised by the client when the WebSocket closes before the
   *  server's `joined` ever arrived — usually means no classroom
   *  server is running at the configured URL (the canonical case:
   *  the IDE is deployed to GitHub Pages without a sidecar). Never
   *  sent by the server; safe additive widening of the union. */
  | "server_unreachable"
  /** Synthesised by the client when the WebSocket fails to open
   *  inside the connection timeout window. */
  | "connect_timeout";

// ---------- Hard limits -----------------------------------------------------

/** Single WebSocket frame size cap, applied uniformly to every message. */
export const MAX_MESSAGE_BYTES = 1_048_576; // 1 MiB

/** Free-text fields are clamped at this length to bound abuse. */
export const MAX_NAME_BYTES = 128;
export const MAX_ROLL_NO_BYTES = 32;
export const MAX_PROMPT_BYTES = 4_096;
export const MAX_META_FIELD_BYTES = 256;
export const MAX_COMMENT_BYTES = 2_048;
