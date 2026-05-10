// ClassroomHubDO — the single Durable Object that owns all
// classroom-mode rooms for this deployment. Mirrors the Node
// adapter at `@emu8086/classroom-server/src/node.ts` move-for-move
// in terms of message routing; the differences are:
//
//   - WebSockets come from `WebSocketPair` instead of the `ws`
//     npm library. The Web API uses `send()` and `addEventListener`
//     (vs. Node `ws`'s `on(...)` shape) — same primitives, different
//     spelling.
//   - The connect → close → dispatch lifecycle is driven by the
//     `accept()` + event listeners pattern; no per-process Map of
//     sockets to register, but we keep our own per-room maps so
//     the dispatch logic stays identical to Node.
//   - Periodic tick (room reaping) runs on Cloudflare's alarm
//     scheduler — no setInterval in DOs; `state.storage.setAlarm()`
//     gives us the same effect.
//
// Same security posture as the Node version: HMAC host token,
// 1 MiB message cap, byte-clamped fields, no logging of buffer
// content. The HMAC secret comes from env (set with `wrangler
// secret put`).

import {
  MAX_COMMENT_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_NAME_BYTES,
  MAX_PROMPT_BYTES,
  MAX_ROLL_NO_BYTES,
  PROTOCOL_VERSION,
  type ClientMsg,
  type ErrorCode,
  type ServerMsg,
} from "@emu8086/classroom-protocol";
import { Room, type Outbound, TEACHER_GRACE_MS } from "@emu8086/classroom-server/room";
import {
  generateSecret,
  signHostToken,
  verifyHostToken,
} from "@emu8086/classroom-server/host-token";
import {
  generateRoomCode,
  isPlausibleRoomCode,
} from "@emu8086/classroom-server/wordlist";
import { clamp, sanitizeMeta } from "@emu8086/classroom-server/protocol-helpers";
import type { Env } from "./worker.js";

const REAP_TICK_MS = 15_000;

type ConnIdentity =
  | { kind: "pending" }
  | { kind: "teacher"; roomId: string }
  | { kind: "student"; roomId: string; rollNo: string };

interface Conn {
  ws: WebSocket;
  identity: ConnIdentity;
}

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
  // Web WebSocket has readyState values: CONNECTING=0, OPEN=1, etc.
  // Use the literal 1 to avoid the type-defs requiring the global
  // WebSocket constant at module-resolve time.
  if (ws && ws.readyState === 1) ws.send(payload);
}

interface ResolvedSecrets {
  primary: string;
  previous: string | undefined;
  graceMs: number;
}

function resolveSecrets(env: Env): ResolvedSecrets {
  let primary = env.EMU8086_CLASSROOM_HMAC_SECRET;
  if (!primary) {
    // Last-resort fallback for first-time deploys without `wrangler
    // secret put`. The secret is ephemeral — when the DO is evicted
    // and re-instantiated, live host tokens become invalid. Logged
    // so the operator notices.
    primary = generateSecret();
    console.warn(
      "[classroom-worker] EMU8086_CLASSROOM_HMAC_SECRET not set; generated an ephemeral one.",
    );
  }
  return {
    primary,
    previous: env.EMU8086_CLASSROOM_HMAC_SECRET_PREVIOUS,
    graceMs: env.EMU8086_CLASSROOM_GRACE_MS
      ? Number(env.EMU8086_CLASSROOM_GRACE_MS)
      : TEACHER_GRACE_MS,
  };
}

export class ClassroomHubDO {
  private readonly sessions = new Map<string, RoomSession>();
  private readonly conns = new Map<WebSocket, Conn>();
  private readonly secrets: ResolvedSecrets;
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.secrets = resolveSecrets(env);
    // Schedule the first reap tick. The alarm handler re-arms itself
    // on each invocation so the DO keeps ticking as long as it's
    // alive.
    state.blockConcurrencyWhile(async () => {
      const existing = await state.storage.getAlarm();
      if (existing === null) {
        await state.storage.setAlarm(Date.now() + REAP_TICK_MS);
      }
    });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.handleConnection(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Cloudflare wakes the DO on the scheduled alarm. We re-arm and
   *  walk the room set looking for reaping work. */
  async alarm(): Promise<void> {
    const now = Date.now();
    for (const [roomId, session] of this.sessions) {
      const out = session.room.tick(now);
      if (out.length > 0) session.dispatch(out);
      if (session.room.isClosed()) {
        if (session.teacherWs) session.teacherWs.close(1000, "room closed");
        for (const ws of session.studentWs.values()) ws.close(1000, "room closed");
        this.sessions.delete(roomId);
      }
    }
    await this.state.storage.setAlarm(Date.now() + REAP_TICK_MS);
  }

  private handleConnection(ws: WebSocket): void {
    const conn: Conn = { ws, identity: { kind: "pending" } };
    this.conns.set(ws, conn);

    ws.addEventListener("message", (event) => {
      const data = event.data;
      const raw = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
      if (raw.length > MAX_MESSAGE_BYTES) {
        this.sendError(ws, "too_large", "message exceeds size cap");
        return;
      }
      let parsed: ClientMsg;
      try {
        parsed = JSON.parse(raw) as ClientMsg;
        if (typeof parsed !== "object" || parsed === null || typeof parsed.t !== "string") {
          throw new Error("not a message");
        }
      } catch {
        this.sendError(ws, "internal_error", "malformed message");
        return;
      }
      this.handleMessage(ws, conn, parsed);
    });

    ws.addEventListener("close", () => {
      const c = this.conns.get(ws);
      if (!c) return;
      this.conns.delete(ws);
      this.handleDisconnect(c);
    });

    ws.addEventListener("error", (ev) => {
      console.warn("[classroom-worker] ws error", String(ev));
    });
  }

  private handleMessage(ws: WebSocket, conn: Conn, msg: ClientMsg): void {
    if (conn.identity.kind === "pending") {
      if (msg.t === "create") return this.handleCreate(ws, conn, msg);
      if (msg.t === "join") return this.handleJoin(ws, conn, msg);
      this.sendError(ws, "not_authorized", "join the room first");
      return;
    }

    const session = this.sessions.get(conn.identity.roomId);
    if (!session) {
      this.sendError(ws, "room_closed", "room is closed");
      ws.close(1000, "room closed");
      return;
    }

    const isTeacher = conn.identity.kind === "teacher";
    switch (msg.t) {
      case "leave":
        ws.close(1000, "client leave");
        return;

      case "set_hand": {
        if (typeof msg.rollNo !== "string") return this.sendError(ws, "internal_error", "bad rollNo");
        if (typeof msg.up !== "boolean") return this.sendError(ws, "internal_error", "bad up");
        if (isTeacher) {
          session.dispatch(session.room.setHand(msg.rollNo, msg.up, "teacher"));
        } else if (conn.identity.kind === "student" && conn.identity.rollNo === msg.rollNo) {
          session.dispatch(session.room.setHand(msg.rollNo, msg.up, "self"));
        } else {
          this.sendError(ws, "not_authorized", "students may only set their own hand");
        }
        return;
      }

      case "buffer_update": {
        if (isTeacher) return this.sendError(ws, "not_authorized", "teacher uses broadcast_update");
        if (conn.identity.kind !== "student") return;
        if (typeof msg.source !== "string") return;
        session.dispatch(
          session.room.studentBufferUpdate(conn.identity.rollNo, msg.source, Date.now()),
        );
        return;
      }

      case "submit": {
        if (isTeacher) return this.sendError(ws, "not_authorized", "teacher cannot submit");
        if (conn.identity.kind !== "student") return;
        if (typeof msg.source !== "string") return;
        session.dispatch(session.room.submit(conn.identity.rollNo, msg.source, Date.now()));
        return;
      }

      case "set_broadcast": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        session.dispatch(session.room.setBroadcast(msg.on, msg.source));
        return;
      }

      case "broadcast_update": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        session.dispatch(session.room.broadcastUpdate(msg.source));
        return;
      }

      case "take_control": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        session.dispatch(session.room.takeControl(msg.rollNo));
        return;
      }

      case "release_control": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        session.dispatch(session.room.releaseControl());
        return;
      }

      case "control_buffer": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        session.dispatch(session.room.controlBufferFromTeacher(msg.source, Date.now()));
        return;
      }

      case "set_prompt": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        const prompt = clamp(msg.prompt, MAX_PROMPT_BYTES);
        session.dispatch(session.room.setPrompt(prompt));
        return;
      }

      case "kick": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        this.kickStudent(session, msg.rollNo, "kicked by teacher");
        return;
      }

      case "close_room": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        session.dispatch(session.room.closeRoom());
        if (session.teacherWs) session.teacherWs.close(1000, "room closed");
        for (const studentWs of session.studentWs.values()) studentWs.close(1000, "room closed");
        this.sessions.delete(session.room.id);
        return;
      }

      case "add_comment": {
        if (!isTeacher) return this.sendError(ws, "not_authorized", "teacher only");
        if (typeof msg.rollNo !== "string" || typeof msg.body !== "string") {
          return this.sendError(ws, "internal_error", "bad add_comment payload");
        }
        const body = clamp(msg.body, MAX_COMMENT_BYTES);
        if (!body) return;
        session.dispatch(session.room.addComment(msg.rollNo, body, Date.now()));
        return;
      }

      case "mark_comment_seen": {
        if (isTeacher) {
          return this.sendError(ws, "not_authorized", "students dismiss their own comments");
        }
        if (conn.identity.kind !== "student") return;
        if (typeof msg.commentId !== "string") return;
        session.dispatch(
          session.room.markCommentSeen(conn.identity.rollNo, msg.commentId, Date.now()),
        );
        return;
      }

      default:
        this.sendError(ws, "internal_error", `unsupported message t=${(msg as ClientMsg).t}`);
    }
  }

  private handleCreate(ws: WebSocket, conn: Conn, msg: Extract<ClientMsg, { t: "create" }>): void {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      return this.sendError(ws, "protocol_mismatch", `expected protocol ${PROTOCOL_VERSION}`);
    }
    const meta = sanitizeMeta(msg.meta);
    if (!meta) return this.sendError(ws, "course_required", "course and teacherName are required");
    const teacherName = clamp(msg.teacherDisplayName, MAX_NAME_BYTES);
    if (!teacherName)
      return this.sendError(ws, "teacher_name_required", "teacher display name is required");

    const now = Date.now();
    let roomId: string;
    try {
      roomId = generateRoomCode((c) => this.sessions.has(c));
    } catch {
      return this.sendError(ws, "internal_error", "no free room code");
    }

    const room = new Room(roomId, meta, { now, graceMs: this.secrets.graceMs });
    const session = new RoomSession(room);
    this.sessions.set(roomId, session);

    const hostToken = signHostToken({ roomId, createdAt: now }, this.secrets.primary);
    this.send(ws, { t: "created", roomId, hostToken, meta, createdAt: now });

    conn.identity = { kind: "teacher", roomId };
    session.teacherWs = ws;
    session.dispatch(session.room.teacherJoin(teacherName));
  }

  private handleJoin(ws: WebSocket, conn: Conn, msg: Extract<ClientMsg, { t: "join" }>): void {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      return this.sendError(ws, "protocol_mismatch", `expected protocol ${PROTOCOL_VERSION}`);
    }
    if (!isPlausibleRoomCode(msg.roomId)) {
      return this.sendError(ws, "room_not_found", "unknown room");
    }
    const session = this.sessions.get(msg.roomId);
    if (!session || session.room.isClosed()) {
      return this.sendError(ws, "room_not_found", "unknown room");
    }

    const displayName = clamp(msg.displayName, MAX_NAME_BYTES);
    if (!displayName) return this.sendError(ws, "display_name_required", "display name required");

    if (msg.hostToken) {
      const verify = verifyHostToken(msg.hostToken, msg.roomId, this.secrets.primary, this.secrets.previous);
      if (!verify.ok) {
        return this.sendError(ws, "host_token_invalid", "host token rejected");
      }
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

    const rollNo = clamp(msg.rollNo, MAX_ROLL_NO_BYTES);
    if (!rollNo) return this.sendError(ws, "roll_no_required", "roll no required");

    const prior = session.studentWs.get(rollNo);
    if (prior && prior !== ws) {
      sendIfOpen(prior, JSON.stringify({ t: "replaced_elsewhere" } satisfies ServerMsg));
      prior.close(1000, "replaced");
      this.conns.delete(prior);
    }

    session.studentWs.set(rollNo, ws);
    conn.identity = { kind: "student", roomId: msg.roomId, rollNo };
    session.dispatch(session.room.studentJoin(rollNo, displayName, Date.now()));
  }

  private handleDisconnect(conn: Conn): void {
    if (conn.identity.kind === "pending") return;
    const session = this.sessions.get(conn.identity.roomId);
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

  private kickStudent(session: RoomSession, rollNo: string, reason: string): void {
    const ws = session.studentWs.get(rollNo);
    session.dispatch(session.room.kick(rollNo, reason));
    if (ws) {
      session.studentWs.delete(rollNo);
      ws.close(1000, "kicked");
    }
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  private sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    this.send(ws, { t: "error", code, message });
  }
}
