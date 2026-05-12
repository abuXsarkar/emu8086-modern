// End-to-end integration: spin up the real Node server on a random
// port, connect two real WebSocket clients (teacher + student),
// drive the happy path, assert state. This guards the bridge between
// the Room state machine and the wire protocol.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  type ClientMsg,
  type RoomMeta,
  type ServerMsg,
} from "@modern8086/classroom-protocol";
import { startServer } from "../src/node.js";
import { generateSecret } from "../src/host-token.js";

const META: RoomMeta = {
  course: "Microprocessors",
  teacherName: "Dr. Sharma",
  date: "2026-05-10",
};

interface Harness {
  url: string;
  close: () => Promise<void>;
}

async function startHarness(): Promise<Harness> {
  // Random high port to avoid clashes between parallel test workers.
  const port = 18000 + Math.floor(Math.random() * 1000);
  const server = startServer({
    port,
    host: "127.0.0.1",
    primarySecret: generateSecret(),
    previousSecret: undefined,
    graceMs: 60_000,
  });
  // Wait one tick so the listener is bound before the first connect.
  await new Promise((r) => setTimeout(r, 50));
  return {
    url: `ws://127.0.0.1:${port}`,
    close: () => server.close(),
  };
}

function send(ws: WebSocket, msg: ClientMsg): void {
  ws.send(JSON.stringify(msg));
}

/** Collect server messages into an array; resolves the next message
 *  when `awaitNext()` is called, with a tight timeout so a stuck
 *  test fails loudly. */
function makeRecorder(ws: WebSocket): {
  log: ServerMsg[];
  awaitNext: (predicate?: (m: ServerMsg) => boolean, ms?: number) => Promise<ServerMsg>;
} {
  const log: ServerMsg[] = [];
  const waiters: Array<{
    pred: (m: ServerMsg) => boolean;
    resolve: (m: ServerMsg) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString()) as ServerMsg;
    log.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(msg)) {
        clearTimeout(waiters[i].timer);
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });

  return {
    log,
    awaitNext(predicate, ms = 1500) {
      const pred = predicate ?? (() => true);
      // Replay first: a message may have already arrived.
      const found = log.find(pred);
      if (found) return Promise.resolve(found);
      return new Promise<ServerMsg>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timed out waiting for message after ${ms}ms`)),
          ms,
        );
        waiters.push({ pred, resolve, reject, timer });
      });
    },
  };
}

async function open(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(e));
  });
  return ws;
}

describe("classroom-server integration", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
  });
  afterEach(async () => {
    await h.close();
  });

  it("create → student joins → submit → teacher sees submission", async () => {
    const teacherWs = await open(h.url);
    const teacherR = makeRecorder(teacherWs);
    send(teacherWs, {
      t: "create",
      protocolVersion: PROTOCOL_VERSION,
      meta: META,
      teacherDisplayName: "Dr. Sharma",
    });
    const created = (await teacherR.awaitNext((m) => m.t === "created")) as Extract<
      ServerMsg,
      { t: "created" }
    >;
    expect(created.roomId).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]$/);
    expect(created.hostToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await teacherR.awaitNext((m) => m.t === "joined");

    const studentWs = await open(h.url);
    const studentR = makeRecorder(studentWs);
    send(studentWs, {
      t: "join",
      protocolVersion: PROTOCOL_VERSION,
      roomId: created.roomId,
      rollNo: "CSE-22-001",
      displayName: "Aisha",
    });
    await studentR.awaitNext((m) => m.t === "joined");
    await teacherR.awaitNext(
      (m) => m.t === "roster_changed" &&
        (m as Extract<ServerMsg, { t: "roster_changed" }>).students.length === 1,
    );

    send(studentWs, { t: "submit", source: "mov ax, 1\nhlt\n" });
    const sub = (await teacherR.awaitNext(
      (m) => m.t === "submission_received",
    )) as Extract<ServerMsg, { t: "submission_received" }>;
    expect(sub.submission.rollNo).toBe("CSE-22-001");
    expect(sub.submission.source).toContain("mov ax");

    teacherWs.close();
    studentWs.close();
  });

  it("students with the same rollNo: second join replaces the first", async () => {
    const teacherWs = await open(h.url);
    const teacherR = makeRecorder(teacherWs);
    send(teacherWs, {
      t: "create",
      protocolVersion: PROTOCOL_VERSION,
      meta: META,
      teacherDisplayName: "Dr. Sharma",
    });
    const created = (await teacherR.awaitNext((m) => m.t === "created")) as Extract<
      ServerMsg,
      { t: "created" }
    >;
    await teacherR.awaitNext((m) => m.t === "joined");

    const a = await open(h.url);
    const aR = makeRecorder(a);
    send(a, {
      t: "join",
      protocolVersion: PROTOCOL_VERSION,
      roomId: created.roomId,
      rollNo: "DUPE",
      displayName: "First",
    });
    await aR.awaitNext((m) => m.t === "joined");

    const b = await open(h.url);
    const bR = makeRecorder(b);
    send(b, {
      t: "join",
      protocolVersion: PROTOCOL_VERSION,
      roomId: created.roomId,
      rollNo: "DUPE",
      displayName: "Second",
    });
    await bR.awaitNext((m) => m.t === "joined");

    // Original session should receive replaced_elsewhere and close.
    await aR.awaitNext((m) => m.t === "replaced_elsewhere");

    teacherWs.close();
    a.close();
    b.close();
  });

  it("rejects mismatched protocol version", async () => {
    const ws = await open(h.url);
    const r = makeRecorder(ws);
    send(ws, {
      t: "create",
      protocolVersion: PROTOCOL_VERSION + 99,
      meta: META,
      teacherDisplayName: "Dr.",
    });
    const e = (await r.awaitNext((m) => m.t === "error")) as Extract<
      ServerMsg,
      { t: "error" }
    >;
    expect(e.code).toBe("protocol_mismatch");
    ws.close();
  });

  it("rejects join with an unknown room", async () => {
    const ws = await open(h.url);
    const r = makeRecorder(ws);
    send(ws, {
      t: "join",
      protocolVersion: PROTOCOL_VERSION,
      roomId: "unknown-room-99",
      rollNo: "X",
      displayName: "Y",
    });
    const e = (await r.awaitNext((m) => m.t === "error")) as Extract<
      ServerMsg,
      { t: "error" }
    >;
    expect(e.code).toBe("room_not_found");
    ws.close();
  });
});
