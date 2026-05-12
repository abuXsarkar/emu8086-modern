import { describe, expect, it } from "vitest";
import type { RoomMeta, ServerMsg } from "@modern8086/classroom-protocol";
import { Room, type Outbound } from "../src/room.js";

const META: RoomMeta = {
  course: "Microprocessors",
  teacherName: "Dr. Sharma",
  date: "2026-05-10",
};

function newRoom(now = 1_700_000_000_000, graceMs?: number): Room {
  return new Room("blue-fox-42", META, { now, graceMs });
}

function msgsFor(out: Outbound[], match: ServerMsg["t"]): ServerMsg[] {
  return out.filter((o) => o.msg.t === match).map((o) => o.msg);
}

describe("Room — teacher lifecycle", () => {
  it("teacherJoin yields a `joined` snapshot to the teacher", () => {
    const r = newRoom();
    const out = r.teacherJoin("Dr. Sharma");
    const joins = msgsFor(out, "joined");
    expect(joins).toHaveLength(1);
    const join = joins[0] as Extract<ServerMsg, { t: "joined" }>;
    expect(join.role).toBe("teacher");
    expect(join.snapshot.studentsForTeacher).toEqual([]);
    expect(r.isTeacherOnline()).toBe(true);
  });

  it("teacherDisconnect followed by tick within grace does NOT close the room", () => {
    const r = newRoom(1000, 60_000);
    r.teacherJoin("T");
    r.teacherDisconnect(2000);
    expect(r.isClosed()).toBe(false);
    const out = r.tick(2000 + 30_000);
    expect(out).toEqual([]);
    expect(r.isClosed()).toBe(false);
  });

  it("tick reaps the room past the grace boundary", () => {
    const r = newRoom(1000, 60_000);
    r.teacherJoin("T");
    r.teacherDisconnect(2000);
    const out = r.tick(2000 + 60_001);
    const closes = msgsFor(out, "room_closed");
    expect(closes).toHaveLength(1);
    expect((closes[0] as Extract<ServerMsg, { t: "room_closed" }>).reason).toBe("reaped");
    expect(r.isClosed()).toBe(true);
    // Idempotent
    expect(r.tick(2000 + 120_000)).toEqual([]);
  });

  it("teacherDisconnect while holding control auto-releases", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    r.takeControl("R-1");
    expect(r.controlledRollNo()).toBe("R-1");
    const out = r.teacherDisconnect(200);
    const ctrl = msgsFor(out, "control_change");
    expect(ctrl).toHaveLength(1);
    expect((ctrl[0] as Extract<ServerMsg, { t: "control_change" }>).rollNo).toBe(null);
    expect(r.controlledRollNo()).toBe(null);
  });
});

describe("Room — student lifecycle", () => {
  it("studentJoin emits joined + roster_changed + peers_changed", () => {
    const r = newRoom();
    r.teacherJoin("T");
    const out = r.studentJoin("R-1", "Aisha", 100);
    expect(msgsFor(out, "joined")).toHaveLength(1);
    expect(msgsFor(out, "roster_changed")).toHaveLength(1);
    expect(msgsFor(out, "peers_changed")).toHaveLength(1);
  });

  it("a second join with same rollNo is treated as reconnect, preserving handUp", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    r.setHand("R-1", true, "self");
    r.studentLeave("R-1");
    // Reconnect.
    const out = r.studentJoin("R-1", "Aisha", 200);
    const join = msgsFor(out, "joined")[0] as Extract<ServerMsg, { t: "joined" }>;
    // The snapshot for the student doesn't carry handUp directly,
    // but the state internal to the room must still have it.
    expect(r.studentCount()).toBe(1);
    // Roster (sent to teacher) has handUp=true preserved.
    const roster = msgsFor(out, "roster_changed")[0] as Extract<ServerMsg, { t: "roster_changed" }>;
    expect(roster.students).toHaveLength(1);
    expect(roster.students[0].handUp).toBe(true);
  });

  it("studentBufferUpdate is forwarded to the teacher only", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    const out = r.studentBufferUpdate("R-1", "mov ax, 1\n", 200);
    expect(out).toHaveLength(1);
    expect(out[0].target).toEqual({ kind: "teacher" });
    const m = out[0].msg as Extract<ServerMsg, { t: "student_buffer" }>;
    expect(m.t).toBe("student_buffer");
    expect(m.rollNo).toBe("R-1");
    expect(m.source).toBe("mov ax, 1\n");
  });

  it("student edits are blocked while the teacher holds control", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    r.takeControl("R-1");
    const out = r.studentBufferUpdate("R-1", "mov ax, 1\n", 200);
    expect(out).toEqual([]);
  });
});

describe("Room — submissions accumulate", () => {
  it("two submissions from the same student are both kept", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    r.submit("R-1", "first\n", 200);
    r.submit("R-1", "second\n", 300);
    const snap = r.submissionsSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0].source).toBe("first\n");
    expect(snap[1].source).toBe("second\n");
  });
});

describe("Room — hand-raise", () => {
  it("either side can lower; events broadcast to all", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    const a = r.setHand("R-1", true, "self");
    expect(a.some((o) => o.msg.t === "hand_changed")).toBe(true);
    expect(a.find((o) => o.msg.t === "hand_changed")?.target).toEqual({ kind: "all" });
    // Teacher lowers.
    const b = r.setHand("R-1", false, "teacher");
    const m = b.find((o) => o.msg.t === "hand_changed")!.msg as Extract<ServerMsg, { t: "hand_changed" }>;
    expect(m.up).toBe(false);
  });

  it("setHand for a non-existent rollNo is a no-op", () => {
    const r = newRoom();
    r.teacherJoin("T");
    expect(r.setHand("ghost", true, "teacher")).toEqual([]);
  });
});

describe("Room — control invariant", () => {
  it("controlGrantedTo always points at a real student or null", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    r.takeControl("R-1");
    expect(r.controlledRollNo()).toBe("R-1");
    // Kicking the student auto-releases.
    r.kick("R-1", "test");
    expect(r.controlledRollNo()).toBe(null);
  });

  it("takeControl on an unknown rollNo is rejected silently", () => {
    const r = newRoom();
    r.teacherJoin("T");
    expect(r.takeControl("nobody")).toEqual([]);
    expect(r.controlledRollNo()).toBe(null);
  });
});

describe("Room — close", () => {
  it("closeRoom is idempotent; second call returns nothing", () => {
    const r = newRoom();
    r.teacherJoin("T");
    expect(r.closeRoom().length).toBe(1);
    expect(r.closeRoom()).toEqual([]);
    expect(r.isClosed()).toBe(true);
  });
});

describe("Room — comments", () => {
  it("addComment dispatches to teacher + targeted student only", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    r.studentJoin("R-2", "Bilal", 110);
    const out = r.addComment("R-1", "  please re-check the loop  ", 200);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.target)).toEqual([
      { kind: "teacher" },
      { kind: "student", rollNo: "R-1" },
    ]);
    const m0 = out[0].msg as Extract<ServerMsg, { t: "comment_added" }>;
    expect(m0.comment.body).toBe("please re-check the loop"); // trimmed
    expect(m0.comment.rollNo).toBe("R-1");
    expect(m0.comment.seenAt).toBeNull();
    expect(r.commentsSnapshot()).toHaveLength(1);
  });

  it("addComment to an unknown student or with empty body is a no-op", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    expect(r.addComment("nobody", "hi", 200)).toEqual([]);
    expect(r.addComment("R-1", "   ", 200)).toEqual([]);
    expect(r.commentsSnapshot()).toEqual([]);
  });

  it("markCommentSeen flips seenAt and broadcasts to teacher + student", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    const added = r.addComment("R-1", "good work", 200);
    const id = (added[0].msg as Extract<ServerMsg, { t: "comment_added" }>).comment.id;
    const seen = r.markCommentSeen("R-1", id, 300);
    expect(seen).toHaveLength(2);
    expect(
      (seen[0].msg as Extract<ServerMsg, { t: "comment_seen" }>).seenAt,
    ).toBe(300);
    // Idempotent.
    expect(r.markCommentSeen("R-1", id, 400)).toEqual([]);
  });

  it("markCommentSeen by a different student is rejected", () => {
    const r = newRoom();
    r.teacherJoin("T");
    r.studentJoin("R-1", "Aisha", 100);
    r.studentJoin("R-2", "Bilal", 110);
    const added = r.addComment("R-1", "good work", 200);
    const id = (added[0].msg as Extract<ServerMsg, { t: "comment_added" }>).comment.id;
    expect(r.markCommentSeen("R-2", id, 300)).toEqual([]);
  });
});

describe("Room — toJSON / fromJSON roundtrip", () => {
  it("survives a full create → mutate → serialize → deserialize cycle", () => {
    const r = newRoom(1_700_000_000_000);
    r.teacherJoin("Dr. Sharma");
    r.studentJoin("R-1", "Aisha", 100);
    r.studentJoin("R-2", "Bilal", 110);
    r.setHand("R-1", true, "self");
    r.setBroadcast(true, "mov ax, bx");
    r.takeControl("R-2");
    r.studentBufferUpdate("R-1", "hello", 200);
    r.submit("R-2", "submitted source", 300);
    r.addComment("R-1", "nice", 400);
    r.setPrompt("Lab 3: Interrupts");
    r.teacherDisconnect(500);

    const ser = r.toJSON();
    const r2 = Room.fromJSON(ser);
    // Snapshot equality across the public surface.
    expect(r2.id).toBe(r.id);
    expect(r2.studentCount()).toBe(r.studentCount());
    expect(r2.isTeacherOnline()).toBe(r.isTeacherOnline());
    expect(r2.controlledRollNo()).toBe(r.controlledRollNo());
    expect(r2.hasStudent("R-1")).toBe(true);
    expect(r2.hasStudent("R-2")).toBe(true);
    expect(r2.snapshotForDebug().prompt).toBe("Lab 3: Interrupts");
    expect(r2.snapshotForDebug().broadcasting).toBe(true);
    expect(r2.snapshotForDebug().submissions).toBe(1);
    expect(r2.commentsSnapshot()).toHaveLength(1);
  });

  it("a reaped room stays closed after roundtrip", () => {
    const r = newRoom(0, 1_000);
    r.teacherJoin("T");
    r.teacherDisconnect(100);
    r.tick(2_000); // past grace
    expect(r.isClosed()).toBe(true);
    const r2 = Room.fromJSON(r.toJSON());
    expect(r2.isClosed()).toBe(true);
  });
});
