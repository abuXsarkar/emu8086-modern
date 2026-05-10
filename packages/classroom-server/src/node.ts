// Node + ws runtime adapter for the classroom-server.
//
// Roles:
//   - HTTP server with a single `GET /healthz` endpoint. Anything
//     else is upgraded to WebSocket.
//   - WebSocket frame size capped at 1 MiB by the underlying library
//     (matches MAX_MESSAGE_BYTES in the protocol).
//   - Per-connection state machine:
//       * `pending` until the first message decides whether this is
//         a `create` (teacher) or `join` (teacher reconnect or student).
//       * once decided, the connection is registered in a RoomSession.
//   - Periodic tick (15s) walks each room and reaps anyone whose
//     teacher has been gone past the grace period.
//
// The Room class is the source of truth for state transitions; this
// file only bridges WebSocket I/O and registry bookkeeping. Anything
// that looks like business logic should move into Room.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  MAX_COMMENT_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_NAME_BYTES,
  MAX_ROLL_NO_BYTES,
  MAX_PROMPT_BYTES,
  PROTOCOL_VERSION,
  type ClientMsg,
  type ErrorCode,
  type ServerMsg,
} from "@emu8086/classroom-protocol";
import { Room, type Outbound, TEACHER_GRACE_MS } from "./room.js";
import { generateSecret, signHostToken, verifyHostToken } from "./host-token.js";
import { generateRoomCode, isPlausibleRoomCode } from "./wordlist.js";
import { clamp, sanitizeMeta } from "./protocol-helpers.js";

// ---------- Config ----------------------------------------------------------

interface ServerConfig {
  port: number;
  host: string;
  primarySecret: string;
  previousSecret: string | undefined;
  graceMs: number;
}

function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  let primary = env.EMU8086_CLASSROOM_HMAC_SECRET;
  if (!primary) {
    primary = generateSecret();
    console.warn(
      "[classroom-server] EMU8086_CLASSROOM_HMAC_SECRET not set; " +
        "generated an ephemeral one. Restarting will invalidate all live host tokens.",
    );
  }
  return {
    port: Number(env.EMU8086_CLASSROOM_PORT ?? 8787),
    host: env.EMU8086_CLASSROOM_HOST ?? "0.0.0.0",
    primarySecret: primary,
    previousSecret: env.EMU8086_CLASSROOM_HMAC_SECRET_PREVIOUS,
    graceMs: Number(env.EMU8086_CLASSROOM_GRACE_MS ?? TEACHER_GRACE_MS),
  };
}

// ---------- Per-connection state -------------------------------------------

type ConnIdentity =
  | { kind: "pending" }
  | { kind: "teacher"; roomId: string }
  | { kind: "student"; roomId: string; rollNo: string };

interface Conn {
  ws: WebSocket;
  identity: ConnIdentity;
  /** Best-effort: a small fingerprint used only for log lines. */
  remote: string;
}

// ---------- RoomSession (Room + connections) -------------------------------

class RoomSession {
  readonly room: Room;
  teacherWs: WebSocket | null = null;
  readonly studentWs: Map<string, WebSocket> = new Map();

  constructor(room: Room) {
    this.room = room;
  }

  dispatch(envelopes: Outbound[]): void {
    for (const env of envelopes) {
      const payload = JSON.stringify(env.msg);
      switch (env.target.kind) {
        case "teacher":
          sendIfOpen(this.teacherWs, payload);
          break;
        case "student":
          sendIfOpen(this.studentWs.get(env.target.rollNo), payload);
          break;
        case "all_students":
          for (const ws of this.studentWs.values()) sendIfOpen(ws, payload);
          break;
        case "all":
          sendIfOpen(this.teacherWs, payload);
          for (const ws of this.studentWs.values()) sendIfOpen(ws, payload);
          break;
      }
    }
  }
}

function sendIfOpen(ws: WebSocket | null | undefined, payload: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload);
}

// ---------- Server ---------------------------------------------------------

export function startServer(cfg: ServerConfig = readConfig()): {
  close: () => Promise<void>;
} {
  const sessions = new Map<string, RoomSession>();
  const conns = new Map<WebSocket, Conn>();

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok\n");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
  });

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_MESSAGE_BYTES,
  });

  wss.on("connection", (ws, req) => {
    const conn: Conn = {
      ws,
      identity: { kind: "pending" },
      remote: req.socket.remoteAddress ?? "?",
    };
    conns.set(ws, conn);

    ws.on("message", (data) => {
      // The library has already enforced maxPayload; defend the
      // shape boundary here.
      let parsed: ClientMsg;
      try {
        const raw = data.toString();
        parsed = JSON.parse(raw) as ClientMsg;
        if (typeof parsed !== "object" || parsed === null || typeof (parsed as ClientMsg).t !== "string") {
          throw new Error("not a message");
        }
      } catch {
        sendError(ws, "internal_error", "malformed message");
        return;
      }
      handleMessage(ws, conn, parsed, sessions, conns, cfg);
    });

    ws.on("close", () => {
      const c = conns.get(ws);
      if (!c) return;
      conns.delete(ws);
      handleDisconnect(c, sessions);
    });

    ws.on("error", (err) => {
      console.warn(`[classroom-server] ws error ${conn.remote}: ${err.message}`);
    });
  });

  // Periodic reaper. 15s is short enough that students don't sit on
  // a dead session for long, and long enough that the wakeups are
  // negligible.
  const reaper = setInterval(() => {
    const now = Date.now();
    for (const [roomId, session] of sessions) {
      const out = session.room.tick(now);
      if (out.length > 0) {
        session.dispatch(out);
      }
      if (session.room.isClosed()) {
        // Close any still-attached sockets and unregister.
        if (session.teacherWs) session.teacherWs.close(1000, "room closed");
        for (const ws of session.studentWs.values()) ws.close(1000, "room closed");
        sessions.delete(roomId);
      }
    }
  }, 15_000);
  reaper.unref?.();

  http.listen(cfg.port, cfg.host, () => {
    console.log(
      `[classroom-server] listening on ${cfg.host}:${cfg.port} ` +
        `(grace ${Math.round(cfg.graceMs / 60000)}m, ` +
        `previous-secret ${cfg.previousSecret ? "set" : "unset"})`,
    );
  });

  return {
    async close() {
      clearInterval(reaper);
      for (const ws of conns.keys()) ws.close(1000, "server shutdown");
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

// ---------- Message routing ------------------------------------------------

function handleMessage(
  ws: WebSocket,
  conn: Conn,
  msg: ClientMsg,
  sessions: Map<string, RoomSession>,
  conns: Map<WebSocket, Conn>,
  cfg: ServerConfig,
): void {
  // Pending connections must declare themselves first.
  if (conn.identity.kind === "pending") {
    if (msg.t === "create") return handleCreate(ws, conn, msg, sessions, cfg);
    if (msg.t === "join") return handleJoin(ws, conn, msg, sessions, conns, cfg);
    sendError(ws, "not_authorized", "join the room first");
    return;
  }

  const session = sessions.get(
    conn.identity.kind === "teacher"
      ? conn.identity.roomId
      : conn.identity.roomId,
  );
  if (!session) {
    sendError(ws, "room_closed", "room is closed");
    ws.close(1000, "room closed");
    return;
  }

  // Teacher- vs student-only actions.
  const isTeacher = conn.identity.kind === "teacher";
  switch (msg.t) {
    case "leave":
      // Will be handled in the close hook; treat this as a polite hint.
      ws.close(1000, "client leave");
      return;

    case "set_hand": {
      if (typeof msg.rollNo !== "string") return sendError(ws, "internal_error", "bad rollNo");
      if (typeof msg.up !== "boolean") return sendError(ws, "internal_error", "bad up");
      if (isTeacher) {
        session.dispatch(session.room.setHand(msg.rollNo, msg.up, "teacher"));
      } else if (conn.identity.kind === "student" && conn.identity.rollNo === msg.rollNo) {
        session.dispatch(session.room.setHand(msg.rollNo, msg.up, "self"));
      } else {
        sendError(ws, "not_authorized", "students may only set their own hand");
      }
      return;
    }

    case "buffer_update": {
      if (isTeacher) return sendError(ws, "not_authorized", "teacher uses broadcast_update");
      if (conn.identity.kind !== "student") return;
      if (typeof msg.source !== "string") return;
      session.dispatch(
        session.room.studentBufferUpdate(conn.identity.rollNo, msg.source, Date.now()),
      );
      return;
    }

    case "submit": {
      if (isTeacher) return sendError(ws, "not_authorized", "teacher cannot submit");
      if (conn.identity.kind !== "student") return;
      if (typeof msg.source !== "string") return;
      session.dispatch(
        session.room.submit(conn.identity.rollNo, msg.source, Date.now()),
      );
      return;
    }

    case "set_broadcast": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      session.dispatch(session.room.setBroadcast(msg.on, msg.source));
      return;
    }

    case "broadcast_update": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      session.dispatch(session.room.broadcastUpdate(msg.source));
      return;
    }

    case "take_control": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      session.dispatch(session.room.takeControl(msg.rollNo));
      return;
    }

    case "release_control": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      session.dispatch(session.room.releaseControl());
      return;
    }

    case "control_buffer": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      session.dispatch(session.room.controlBufferFromTeacher(msg.source, Date.now()));
      return;
    }

    case "set_prompt": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      const prompt = clamp(msg.prompt, MAX_PROMPT_BYTES);
      session.dispatch(session.room.setPrompt(prompt));
      return;
    }

    case "kick": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      kickStudent(session, msg.rollNo, "kicked by teacher");
      return;
    }

    case "close_room": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      session.dispatch(session.room.closeRoom());
      // Close the underlying sockets after dispatch.
      if (session.teacherWs) session.teacherWs.close(1000, "room closed");
      for (const studentWs of session.studentWs.values()) studentWs.close(1000, "room closed");
      sessions.delete(session.room.id);
      return;
    }

    case "add_comment": {
      if (!isTeacher) return sendError(ws, "not_authorized", "teacher only");
      if (typeof msg.rollNo !== "string" || typeof msg.body !== "string") {
        return sendError(ws, "internal_error", "bad add_comment payload");
      }
      const body = clamp(msg.body, MAX_COMMENT_BYTES);
      if (!body) return; // empty comments are dropped silently
      session.dispatch(session.room.addComment(msg.rollNo, body, Date.now()));
      return;
    }

    case "mark_comment_seen": {
      if (isTeacher) {
        return sendError(ws, "not_authorized", "students dismiss their own comments");
      }
      if (conn.identity.kind !== "student") return;
      if (typeof msg.commentId !== "string") return;
      session.dispatch(
        session.room.markCommentSeen(conn.identity.rollNo, msg.commentId, Date.now()),
      );
      return;
    }

    default:
      sendError(ws, "internal_error", `unsupported message t=${(msg as ClientMsg).t}`);
  }
}

// ---------- create / join ---------------------------------------------------

function handleCreate(
  ws: WebSocket,
  conn: Conn,
  msg: Extract<ClientMsg, { t: "create" }>,
  sessions: Map<string, RoomSession>,
  cfg: ServerConfig,
): void {
  if (msg.protocolVersion !== PROTOCOL_VERSION) {
    return sendError(ws, "protocol_mismatch", `expected protocol ${PROTOCOL_VERSION}`);
  }
  const meta = sanitizeMeta(msg.meta);
  if (!meta) return sendError(ws, "course_required", "course and teacherName are required");
  const teacherName = clamp(msg.teacherDisplayName, MAX_NAME_BYTES);
  if (!teacherName) return sendError(ws, "teacher_name_required", "teacher display name is required");

  const now = Date.now();
  let roomId: string;
  try {
    roomId = generateRoomCode((c) => sessions.has(c));
  } catch {
    return sendError(ws, "internal_error", "no free room code");
  }

  const room = new Room(roomId, meta, { now, graceMs: cfg.graceMs });
  const session = new RoomSession(room);
  sessions.set(roomId, session);

  const hostToken = signHostToken({ roomId, createdAt: now }, cfg.primarySecret);
  send(ws, { t: "created", roomId, hostToken, meta, createdAt: now });

  conn.identity = { kind: "teacher", roomId };
  session.teacherWs = ws;
  session.dispatch(session.room.teacherJoin(teacherName));
}

function handleJoin(
  ws: WebSocket,
  conn: Conn,
  msg: Extract<ClientMsg, { t: "join" }>,
  sessions: Map<string, RoomSession>,
  conns: Map<WebSocket, Conn>,
  cfg: ServerConfig,
): void {
  if (msg.protocolVersion !== PROTOCOL_VERSION) {
    return sendError(ws, "protocol_mismatch", `expected protocol ${PROTOCOL_VERSION}`);
  }
  if (!isPlausibleRoomCode(msg.roomId)) {
    return sendError(ws, "room_not_found", "unknown room");
  }
  const session = sessions.get(msg.roomId);
  if (!session || session.room.isClosed()) {
    return sendError(ws, "room_not_found", "unknown room");
  }

  const displayName = clamp(msg.displayName, MAX_NAME_BYTES);
  if (!displayName) return sendError(ws, "display_name_required", "display name required");

  if (msg.hostToken) {
    // Teacher (re)connect path.
    const verify = verifyHostToken(
      msg.hostToken,
      msg.roomId,
      cfg.primarySecret,
      cfg.previousSecret,
    );
    if (!verify.ok) {
      return sendError(ws, "host_token_invalid", "host token rejected");
    }
    // Replace the prior teacher socket if any.
    const prior = session.teacherWs;
    if (prior && prior !== ws) {
      sendIfOpen(prior, JSON.stringify({ t: "replaced_elsewhere" } satisfies ServerMsg));
      prior.close(1000, "replaced");
    }
    session.teacherWs = ws;
    conn.identity = { kind: "teacher", roomId: msg.roomId };
    session.dispatch(session.room.teacherJoin(displayName));
    return;
  }

  // Student path.
  const rollNo = clamp(msg.rollNo, MAX_ROLL_NO_BYTES);
  if (!rollNo) return sendError(ws, "roll_no_required", "roll no required");

  // If a different live socket already holds this rollNo, replace it
  // (per the design: second tab wins). The Room itself is then told
  // the rollNo is "joining" — it preserves prior state if the
  // student's slot still exists in its map.
  const prior = session.studentWs.get(rollNo);
  if (prior && prior !== ws) {
    sendIfOpen(prior, JSON.stringify({ t: "replaced_elsewhere" } satisfies ServerMsg));
    prior.close(1000, "replaced");
    const priorConn = conns.get(prior);
    if (priorConn) conns.delete(prior);
  } else if (!prior && session.room.hasStudent(rollNo)) {
    // No live socket for this rollNo, but the Room has the slot
    // (e.g. student briefly disconnected). That's a reconnect — fine.
  } else if (session.studentWs.has(rollNo)) {
    // Defensive: should not reach here because of the prior block.
    return sendError(ws, "roll_no_taken", "roll no already in use");
  }

  session.studentWs.set(rollNo, ws);
  conn.identity = { kind: "student", roomId: msg.roomId, rollNo };
  session.dispatch(session.room.studentJoin(rollNo, displayName, Date.now()));
}

// ---------- disconnect ------------------------------------------------------

function handleDisconnect(conn: Conn, sessions: Map<string, RoomSession>): void {
  if (conn.identity.kind === "pending") return;
  const session = sessions.get(conn.identity.roomId);
  if (!session) return;
  if (conn.identity.kind === "teacher") {
    if (session.teacherWs === conn.ws) {
      session.teacherWs = null;
      session.dispatch(session.room.teacherDisconnect(Date.now()));
    }
  } else {
    if (session.studentWs.get(conn.identity.rollNo) === conn.ws) {
      session.studentWs.delete(conn.identity.rollNo);
      session.dispatch(session.room.studentLeave(conn.identity.rollNo));
    }
  }
}

function kickStudent(session: RoomSession, rollNo: string, reason: string): void {
  const ws = session.studentWs.get(rollNo);
  session.dispatch(session.room.kick(rollNo, reason));
  if (ws) {
    session.studentWs.delete(rollNo);
    ws.close(1000, "kicked");
  }
}

// ---------- helpers ---------------------------------------------------------

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { t: "error", code, message });
}

// `clamp` and `sanitizeMeta` moved to `./protocol-helpers.ts` so the
// Cloudflare-Worker adapter can share them.

// ---------- entrypoint ------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
