// Runtime-agnostic state machine for one classroom room.
//
// The Room class owns all the data described in
// docs/classroom-mode.md §"State". Every state-changing method
// returns a list of `Outbound` envelopes — the runtime adapter
// (Node + ws today, Cloudflare Worker later) is responsible for
// translating each envelope into actual WebSocket sends.
//
// What lives in the Room:
//   - room metadata (course, teacher, etc.)
//   - the teacher's connection state (online flag, disconnected-at timestamp)
//   - per-student state keyed by rollNo
//   - in-flight broadcast / take-control / prompt state
//   - accumulated submissions
//
// What lives in the runtime:
//   - actual WebSocket connections, indexed by rollNo or "teacher"
//   - duplicate-rollNo replacement (kicking the old session before
//     handing the join to the Room — see `studentJoin` doc comment)
//   - timer that calls `Room.tick(now)` periodically for grace-period
//     reaping
//
// All public methods are pure functions of the current state plus
// their inputs: easy to unit-test without spinning up a server.

import type {
  PeerCount,
  RoomMeta,
  RoomSnapshot,
  ServerMsg,
  StudentPublic,
  Submission,
} from "@emu8086/classroom-protocol";

/** Where a single ServerMsg should be sent. */
export type OutboundTarget =
  | { kind: "teacher" }
  | { kind: "student"; rollNo: string }
  | { kind: "all_students" }
  | { kind: "all" };

export interface Outbound {
  target: OutboundTarget;
  msg: ServerMsg;
}

interface InternalStudent {
  rollNo: string;
  displayName: string;
  joinedAt: number;
  online: boolean;
  handUp: boolean;
  buffer: string;
  bufferUpdatedAt: number;
}

/** Default grace period before a teacherless room is reaped. */
export const TEACHER_GRACE_MS = 30 * 60 * 1_000;

export interface RoomConfig {
  /** epoch ms; injected so tests can be deterministic. */
  now: number;
  /** Override for tests; defaults to TEACHER_GRACE_MS. */
  graceMs?: number;
}

export class Room {
  readonly id: string;
  readonly meta: RoomMeta;
  readonly createdAt: number;
  readonly graceMs: number;

  private prompt = "";
  private teacherDisplayName: string | null = null;
  private teacherOnline = false;
  private teacherDisconnectedAt: number | null = null;

  private broadcasting = false;
  private broadcastBuffer = "";

  private controlGrantedTo: string | null = null;

  private readonly students = new Map<string, InternalStudent>();
  private readonly submissions: Submission[] = [];

  private closed: "open" | "teacher_closed" | "reaped" = "open";

  constructor(id: string, meta: RoomMeta, cfg: RoomConfig) {
    this.id = id;
    this.meta = meta;
    this.createdAt = cfg.now;
    this.graceMs = cfg.graceMs ?? TEACHER_GRACE_MS;
  }

  // ---- Inspection (used by tests + the runtime adapter) -----------------

  isClosed(): boolean {
    return this.closed !== "open";
  }
  hasStudent(rollNo: string): boolean {
    return this.students.has(rollNo);
  }
  isTeacherOnline(): boolean {
    return this.teacherOnline;
  }
  controlledRollNo(): string | null {
    return this.controlGrantedTo;
  }
  studentCount(): number {
    return this.students.size;
  }
  /** For test / runtime introspection only — never sent over the wire. */
  snapshotForDebug(): {
    prompt: string;
    broadcasting: boolean;
    submissions: number;
    students: ReadonlyArray<StudentPublic>;
  } {
    return {
      prompt: this.prompt,
      broadcasting: this.broadcasting,
      submissions: this.submissions.length,
      students: this.publicStudents(),
    };
  }
  /** Drain the accumulated submissions. The teacher's drawer keeps its own
   *  copy; this is here only for the (rare) case where the runtime needs
   *  to repackage them, e.g. for a "download all" rebuild. */
  submissionsSnapshot(): ReadonlyArray<Submission> {
    return this.submissions.slice();
  }

  // ---- Teacher events ----------------------------------------------------

  teacherJoin(displayName: string): Outbound[] {
    if (this.isClosed()) return this.closedError();
    this.teacherDisplayName = displayName;
    this.teacherOnline = true;
    this.teacherDisconnectedAt = null;
    const out: Outbound[] = [
      {
        target: { kind: "teacher" },
        msg: {
          t: "joined",
          you: "teacher",
          role: "teacher",
          snapshot: this.snapshotFor("teacher"),
        },
      },
    ];
    // Notify students that the teacher is back, in case they show a
    // "teacher disconnected" banner. We piggy-back on peers_changed
    // because students don't get a separate teacher-presence message.
    out.push(this.peersChanged());
    return out;
  }

  teacherDisconnect(now: number): Outbound[] {
    if (this.isClosed() || !this.teacherOnline) return [];
    this.teacherOnline = false;
    this.teacherDisconnectedAt = now;
    // Auto-release any active take-control: a controlled student
    // waiting on a vanished teacher is the worst failure mode here.
    const out: Outbound[] = [];
    if (this.controlGrantedTo) {
      this.controlGrantedTo = null;
      out.push({
        target: { kind: "all" },
        msg: { t: "control_change", rollNo: null },
      });
    }
    return out;
  }

  // ---- Student events ----------------------------------------------------

  /**
   * Caller note: when a join arrives with a rollNo that already
   * exists in the room, the runtime is expected to first send
   * `replaced_elsewhere` to the existing session and close it. By
   * the time this method is called, the previous session is gone;
   * we treat the join as a reconnect that preserves prior state
   * (handUp, buffer). If a true new student happens to pick a
   * roll-no already in use by an online peer, the runtime should
   * reject earlier with `roll_no_taken`. We don't try to
   * disambiguate here.
   */
  studentJoin(
    rollNo: string,
    displayName: string,
    now: number,
  ): Outbound[] {
    if (this.isClosed()) return this.closedError();
    const existing = this.students.get(rollNo);
    if (existing) {
      existing.online = true;
      existing.displayName = displayName;
    } else {
      this.students.set(rollNo, {
        rollNo,
        displayName,
        joinedAt: now,
        online: true,
        handUp: false,
        buffer: "",
        bufferUpdatedAt: 0,
      });
    }
    return [
      {
        target: { kind: "student", rollNo },
        msg: {
          t: "joined",
          you: rollNo,
          role: "student",
          snapshot: this.snapshotFor("student"),
        },
      },
      this.rosterChanged(),
      this.peersChanged(),
    ];
  }

  studentLeave(rollNo: string): Outbound[] {
    const s = this.students.get(rollNo);
    if (!s) return [];
    s.online = false;
    const out: Outbound[] = [this.rosterChanged(), this.peersChanged()];
    // If the leaving student was under teacher control, release it
    // automatically — same rationale as teacherDisconnect.
    if (this.controlGrantedTo === rollNo) {
      this.controlGrantedTo = null;
      out.push({
        target: { kind: "all" },
        msg: { t: "control_change", rollNo: null },
      });
    }
    return out;
  }

  studentBufferUpdate(rollNo: string, source: string, now: number): Outbound[] {
    const s = this.students.get(rollNo);
    if (!s) return [];
    // While the teacher holds control, the student's own edits are
    // locked client-side — defend the invariant on the server too.
    if (this.controlGrantedTo === rollNo) return [];
    s.buffer = source;
    s.bufferUpdatedAt = now;
    return [
      {
        target: { kind: "teacher" },
        msg: { t: "student_buffer", rollNo, source, at: now },
      },
    ];
  }

  submit(rollNo: string, source: string, now: number): Outbound[] {
    const s = this.students.get(rollNo);
    if (!s) return [];
    const submission: Submission = {
      rollNo,
      displayName: s.displayName,
      source,
      at: now,
    };
    this.submissions.push(submission);
    return [
      {
        target: { kind: "teacher" },
        msg: { t: "submission_received", submission },
      },
    ];
  }

  setHand(rollNo: string, up: boolean, by: "self" | "teacher"): Outbound[] {
    const s = this.students.get(rollNo);
    if (!s) return [];
    if (by === "self" && s.rollNo !== rollNo) return [];
    if (s.handUp === up) return [];
    s.handUp = up;
    return [
      {
        target: { kind: "all" },
        msg: { t: "hand_changed", rollNo, up },
      },
      // Peers track an aggregated count, so they need a refresh too.
      this.peersChanged(),
    ];
  }

  // ---- Broadcast --------------------------------------------------------

  setBroadcast(on: boolean, source?: string): Outbound[] {
    this.broadcasting = on;
    if (on) {
      this.broadcastBuffer = source ?? "";
    } else {
      this.broadcastBuffer = "";
    }
    return [
      {
        target: { kind: "all" },
        msg: {
          t: "broadcast_state",
          on: this.broadcasting,
          source: this.broadcasting ? this.broadcastBuffer : null,
        },
      },
    ];
  }

  broadcastUpdate(source: string): Outbound[] {
    if (!this.broadcasting) return [];
    this.broadcastBuffer = source;
    return [
      {
        target: { kind: "all_students" },
        msg: { t: "broadcast_update", source },
      },
    ];
  }

  // ---- Take-control -----------------------------------------------------

  takeControl(rollNo: string): Outbound[] {
    if (!this.students.has(rollNo)) return [];
    this.controlGrantedTo = rollNo;
    return [
      {
        target: { kind: "all" },
        msg: { t: "control_change", rollNo },
      },
    ];
  }

  releaseControl(): Outbound[] {
    if (this.controlGrantedTo === null) return [];
    this.controlGrantedTo = null;
    return [
      {
        target: { kind: "all" },
        msg: { t: "control_change", rollNo: null },
      },
    ];
  }

  /**
   * Teacher's edits while holding control. Forwarded to the
   * controlled student, and the student's stored buffer is updated
   * so the teacher's roster view stays consistent on a refresh.
   */
  controlBufferFromTeacher(source: string, now: number): Outbound[] {
    const target = this.controlGrantedTo;
    if (!target) return [];
    const s = this.students.get(target);
    if (!s) return [];
    s.buffer = source;
    s.bufferUpdatedAt = now;
    return [
      {
        target: { kind: "student", rollNo: target },
        msg: { t: "control_buffer", source },
      },
    ];
  }

  // ---- Prompt -----------------------------------------------------------

  setPrompt(prompt: string): Outbound[] {
    if (this.prompt === prompt) return [];
    this.prompt = prompt;
    return [
      {
        target: { kind: "all" },
        msg: { t: "prompt_changed", prompt },
      },
    ];
  }

  // ---- Kick / close -----------------------------------------------------

  kick(rollNo: string, reason: string): Outbound[] {
    const s = this.students.get(rollNo);
    if (!s) return [];
    this.students.delete(rollNo);
    const out: Outbound[] = [
      {
        target: { kind: "student", rollNo },
        msg: { t: "kicked", reason },
      },
      this.rosterChanged(),
      this.peersChanged(),
    ];
    if (this.controlGrantedTo === rollNo) {
      this.controlGrantedTo = null;
      out.push({
        target: { kind: "all" },
        msg: { t: "control_change", rollNo: null },
      });
    }
    return out;
  }

  closeRoom(): Outbound[] {
    if (this.isClosed()) return [];
    this.closed = "teacher_closed";
    return [
      {
        target: { kind: "all" },
        msg: { t: "room_closed", reason: "teacher_closed" },
      },
    ];
  }

  // ---- Time -------------------------------------------------------------

  /**
   * Called periodically by the runtime. Returns reaping events when
   * the teacher has been disconnected for longer than `graceMs`.
   * Idempotent once reaped.
   */
  tick(now: number): Outbound[] {
    if (this.isClosed()) return [];
    if (this.teacherOnline) return [];
    if (this.teacherDisconnectedAt === null) return [];
    if (now - this.teacherDisconnectedAt < this.graceMs) return [];
    this.closed = "reaped";
    return [
      {
        target: { kind: "all" },
        msg: { t: "room_closed", reason: "reaped" },
      },
    ];
  }

  // ---- Helpers ----------------------------------------------------------

  private closedError(): Outbound[] {
    // We never re-open a closed room; the runtime should have already
    // dropped the connection, but emit a defensive room_closed in
    // case something slipped through.
    return [
      {
        target: { kind: "all" },
        msg: { t: "room_closed", reason: this.closed === "reaped" ? "reaped" : "teacher_closed" },
      },
    ];
  }

  private publicStudents(): StudentPublic[] {
    const out: StudentPublic[] = [];
    for (const s of this.students.values()) {
      out.push({
        rollNo: s.rollNo,
        displayName: s.displayName,
        online: s.online,
        handUp: s.handUp,
        joinedAt: s.joinedAt,
        bufferUpdatedAt: s.bufferUpdatedAt,
      });
    }
    // Stable sort: hands-up first, then by joinedAt ascending.
    out.sort((a, b) => {
      if (a.handUp !== b.handUp) return a.handUp ? -1 : 1;
      return a.joinedAt - b.joinedAt;
    });
    return out;
  }

  private peerCount(): PeerCount {
    let total = 0;
    let handsUp = 0;
    for (const s of this.students.values()) {
      if (s.online) {
        total++;
        if (s.handUp) handsUp++;
      }
    }
    return { total, handsUp };
  }

  private rosterChanged(): Outbound {
    return {
      target: { kind: "teacher" },
      msg: { t: "roster_changed", students: this.publicStudents() },
    };
  }

  private peersChanged(): Outbound {
    return {
      target: { kind: "all_students" },
      msg: { t: "peers_changed", peers: this.peerCount() },
    };
  }

  private snapshotFor(role: "teacher" | "student"): RoomSnapshot {
    const base: RoomSnapshot = {
      roomId: this.id,
      meta: this.meta,
      createdAt: this.createdAt,
      prompt: this.prompt,
      broadcasting: this.broadcasting,
      broadcastBuffer: this.broadcasting ? this.broadcastBuffer : null,
      controlGrantedTo: this.controlGrantedTo,
    };
    if (role === "teacher") {
      base.studentsForTeacher = this.publicStudents();
    } else {
      base.peers = this.peerCount();
    }
    return base;
  }
}
