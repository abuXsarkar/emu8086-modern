// ClassroomHubDO — single Durable Object hosting every classroom
// in this deployment. Mirrors the Node adapter's routing logic
// move-for-move; the difference is the I/O layer.
//
// **Why the Hibernation API.** SQLite-backed Durable Objects (the
// only DO flavor available on Workers Free) can be evicted from
// memory at any time. With the legacy `server.accept()` +
// `addEventListener` pattern, the WebSocket dies when the DO is
// evicted, manifesting as a "Network connection lost." error
// immediately after the upgrade response. The fix is the
// Hibernation API: `state.acceptWebSocket(ws)` registers the
// socket with the runtime, and the runtime preserves the
// connection across DO eviction/restart, waking the DO when a
// message arrives. We replace the event listeners with the
// `webSocketMessage` / `webSocketClose` / `webSocketError` class
// methods Cloudflare invokes.
//
// **Per-connection state.** Without an in-memory `Map<WebSocket,
// Conn>` (which would vanish if the DO restarts), we persist the
// connection identity on the WebSocket itself via
// `ws.serializeAttachment(...)`. Each `webSocketMessage`
// invocation reads it back with `ws.deserializeAttachment()`.
//
// **Per-room state.** Currently kept in memory in `this.sessions`.
// CF's recurring alarm (every 15s) keeps the DO active, so
// in-memory state should survive across an active session. If a
// rare restart wipes it, students see a clean `room_closed` and
// can re-join — same UX as the Node target's reaping path. A
// future revision will persist Room state to `state.storage` for
// full restart resilience; the Room class is structured to support
// it (toSerialized / fromSerialized).

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
  // Don't gate on readyState — CF's hibernation-API WebSockets can
  // report stale values right after acceptWebSocket(). Just try-
  // send and swallow the error if the socket is genuinely closed;
  // a closed socket throwing on .send() is cheap.
  if (!ws) return;
  try {
    ws.send(payload);
  } catch (e) {
    console.warn("[do] send failed:", e instanceof Error ? e.message : String(e));
  }
}

interface ResolvedSecrets {
  primary: string;
  previous: string | undefined;
  graceMs: number;
}

function resolveSecrets(env: Env): ResolvedSecrets {
  let primary: string;
  if (env.EMU8086_CLASSROOM_HMAC_SECRET) {
    primary = env.EMU8086_CLASSROOM_HMAC_SECRET;
  } else {
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
  private readonly secrets: ResolvedSecrets;
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.secrets = resolveSecrets(env);
    state.blockConcurrencyWhile(async () => {
      // After a DO restart, reattach any WebSockets the hibernation
      // API kept alive into our session bookkeeping. Without this,
      // a teacher who stayed connected through a restart would see
      // their roster drop because the new DO had no record of them.
      this.rehydrateFromHibernatedSockets();

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
    console.log("[do] fetch — accepting new WebSocket");
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Hibernation API: registers the socket with the runtime so it
    // outlives the fetch handler and survives DO eviction.
    this.state.acceptWebSocket(server);
    // Initial identity. The first inbound message (create / join)
    // promotes it to `teacher` or `student`.
    server.serializeAttachment({ kind: "pending" } satisfies ConnIdentity);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Hibernation-API entry: invoked by Cloudflare for each inbound
   *  message. We re-derive the per-connection identity from the
   *  WebSocket attachment so it survives DO eviction. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw =
      typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);
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
    console.log(`[do] recv ${parsed.t} bytes=${raw.length}`);
    const before = (ws.deserializeAttachment() as ConnIdentity | null) ?? { kind: "pending" };
    let after: ConnIdentity;
    try {
      after = this.handleMessage(ws, before, parsed);
    } catch (e) {
      console.error(
        `[do] handler threw on ${parsed.t}:`,
        e instanceof Error ? e.stack ?? e.message : String(e),
      );
      this.sendError(ws, "internal_error", "handler threw");
      return;
    }
    if (after !== before) {
      ws.serializeAttachment(after);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const identity = (ws.deserializeAttachment() as ConnIdentity | null) ?? { kind: "pending" };
    this.handleDisconnect(ws, identity);
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    console.warn(`[classroom-worker] ws error: ${msg}`);
  }

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

  // ---- Internals --------------------------------------------------------

  /** Walk every WebSocket the runtime is still holding for us and
   *  rewire it into the in-memory session map. Called once during
   *  the DO's blockConcurrencyWhile so every subsequent message
   *  sees a coherent state. */
  private rehydrateFromHibernatedSockets(): void {
    const wss = this.state.getWebSockets();
    for (const ws of wss) {
      const identity = ws.deserializeAttachment() as ConnIdentity | null;
      if (!identity || identity.kind === "pending") continue;
      const session = this.sessions.get(identity.roomId);
      if (!session) {
        // The room itself is gone (in-memory state was lost across a
        // restart and no persistence layer kicked in). Nothing
        // sensible to do for this socket — close it cleanly so the
        // client surfaces room_closed and the user re-joins.
        ws.close(1000, "room state lost");
        continue;
      }
      if (identity.kind === "teacher") {
        session.teacherWs = ws;
      } else {
        session.studentWs.set(identity.rollNo, ws);
      }
    }
  }

  private handleMessage(ws: WebSocket, conn: ConnIdentity, msg: ClientMsg): ConnIdentity {
    if (conn.kind === "pending") {
      if (msg.t === "create") return this.handleCreate(ws, msg);
      if (msg.t === "join") return this.handleJoin(ws, msg);
      this.sendError(ws, "not_authorized", "join the room first");
      return conn;
    }

    const session = this.sessions.get(conn.roomId);
    if (!session) {
      this.sendError(ws, "room_closed", "room is closed");
      ws.close(1000, "room closed");
      return conn;
    }

    const isTeacher = conn.kind === "teacher";
    switch (msg.t) {
      case "leave":
        ws.close(1000, "client leave");
        return conn;

      case "set_hand": {
        if (typeof msg.rollNo !== "string") {
          this.sendError(ws, "internal_error", "bad rollNo");
          return conn;
        }
        if (typeof msg.up !== "boolean") {
          this.sendError(ws, "internal_error", "bad up");
          return conn;
        }
        if (isTeacher) {
          session.dispatch(session.room.setHand(msg.rollNo, msg.up, "teacher"));
        } else if (conn.kind === "student" && conn.rollNo === msg.rollNo) {
          session.dispatch(session.room.setHand(msg.rollNo, msg.up, "self"));
        } else {
          this.sendError(ws, "not_authorized", "students may only set their own hand");
        }
        return conn;
      }

      case "buffer_update": {
        if (isTeacher) {
          this.sendError(ws, "not_authorized", "teacher uses broadcast_update");
          return conn;
        }
        if (conn.kind !== "student") return conn;
        if (typeof msg.source !== "string") return conn;
        session.dispatch(
          session.room.studentBufferUpdate(conn.rollNo, msg.source, Date.now()),
        );
        return conn;
      }

      case "submit": {
        if (isTeacher) {
          this.sendError(ws, "not_authorized", "teacher cannot submit");
          return conn;
        }
        if (conn.kind !== "student") return conn;
        if (typeof msg.source !== "string") return conn;
        session.dispatch(session.room.submit(conn.rollNo, msg.source, Date.now()));
        return conn;
      }

      case "set_broadcast": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        session.dispatch(session.room.setBroadcast(msg.on, msg.source));
        return conn;
      }

      case "broadcast_update": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        session.dispatch(session.room.broadcastUpdate(msg.source));
        return conn;
      }

      case "take_control": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        session.dispatch(session.room.takeControl(msg.rollNo));
        return conn;
      }

      case "release_control": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        session.dispatch(session.room.releaseControl());
        return conn;
      }

      case "control_buffer": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        session.dispatch(session.room.controlBufferFromTeacher(msg.source, Date.now()));
        return conn;
      }

      case "set_prompt": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        const prompt = clamp(msg.prompt, MAX_PROMPT_BYTES);
        session.dispatch(session.room.setPrompt(prompt));
        return conn;
      }

      case "kick": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        this.kickStudent(session, msg.rollNo, "kicked by teacher");
        return conn;
      }

      case "close_room": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        session.dispatch(session.room.closeRoom());
        if (session.teacherWs) session.teacherWs.close(1000, "room closed");
        for (const studentWs of session.studentWs.values()) studentWs.close(1000, "room closed");
        this.sessions.delete(session.room.id);
        return conn;
      }

      case "add_comment": {
        if (!isTeacher) {
          this.sendError(ws, "not_authorized", "teacher only");
          return conn;
        }
        if (typeof msg.rollNo !== "string" || typeof msg.body !== "string") {
          this.sendError(ws, "internal_error", "bad add_comment payload");
          return conn;
        }
        const body = clamp(msg.body, MAX_COMMENT_BYTES);
        if (!body) return conn;
        session.dispatch(session.room.addComment(msg.rollNo, body, Date.now()));
        return conn;
      }

      case "mark_comment_seen": {
        if (isTeacher) {
          this.sendError(ws, "not_authorized", "students dismiss their own comments");
          return conn;
        }
        if (conn.kind !== "student") return conn;
        if (typeof msg.commentId !== "string") return conn;
        session.dispatch(
          session.room.markCommentSeen(conn.rollNo, msg.commentId, Date.now()),
        );
        return conn;
      }

      default:
        this.sendError(ws, "internal_error", `unsupported message t=${(msg as ClientMsg).t}`);
        return conn;
    }
  }

  private handleCreate(ws: WebSocket, msg: Extract<ClientMsg, { t: "create" }>): ConnIdentity {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      this.sendError(ws, "protocol_mismatch", `expected protocol ${PROTOCOL_VERSION}`);
      return { kind: "pending" };
    }
    const meta = sanitizeMeta(msg.meta);
    if (!meta) {
      this.sendError(ws, "course_required", "course and teacherName are required");
      return { kind: "pending" };
    }
    const teacherName = clamp(msg.teacherDisplayName, MAX_NAME_BYTES);
    if (!teacherName) {
      this.sendError(ws, "teacher_name_required", "teacher display name is required");
      return { kind: "pending" };
    }

    const now = Date.now();
    let roomId: string;
    try {
      roomId = generateRoomCode((c) => this.sessions.has(c));
    } catch {
      this.sendError(ws, "internal_error", "no free room code");
      return { kind: "pending" };
    }

    const room = new Room(roomId, meta, { now, graceMs: this.secrets.graceMs });
    const session = new RoomSession(room);
    this.sessions.set(roomId, session);

    const hostToken = signHostToken({ roomId, createdAt: now }, this.secrets.primary);
    this.send(ws, { t: "created", roomId, hostToken, meta, createdAt: now });

    session.teacherWs = ws;
    session.dispatch(session.room.teacherJoin(teacherName));
    return { kind: "teacher", roomId };
  }

  private handleJoin(ws: WebSocket, msg: Extract<ClientMsg, { t: "join" }>): ConnIdentity {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      this.sendError(ws, "protocol_mismatch", `expected protocol ${PROTOCOL_VERSION}`);
      return { kind: "pending" };
    }
    if (!isPlausibleRoomCode(msg.roomId)) {
      this.sendError(ws, "room_not_found", "unknown room");
      return { kind: "pending" };
    }
    const session = this.sessions.get(msg.roomId);
    if (!session || session.room.isClosed()) {
      this.sendError(ws, "room_not_found", "unknown room");
      return { kind: "pending" };
    }

    const displayName = clamp(msg.displayName, MAX_NAME_BYTES);
    if (!displayName) {
      this.sendError(ws, "display_name_required", "display name required");
      return { kind: "pending" };
    }

    if (msg.hostToken) {
      const verify = verifyHostToken(
        msg.hostToken,
        msg.roomId,
        this.secrets.primary,
        this.secrets.previous,
      );
      if (!verify.ok) {
        this.sendError(ws, "host_token_invalid", "host token rejected");
        return { kind: "pending" };
      }
      const prior = session.teacherWs;
      if (prior && prior !== ws) {
        sendIfOpen(prior, JSON.stringify({ t: "replaced_elsewhere" } satisfies ServerMsg));
        prior.close(1000, "replaced");
      }
      session.teacherWs = ws;
      session.dispatch(session.room.teacherJoin(displayName));
      return { kind: "teacher", roomId: msg.roomId };
    }

    const rollNo = clamp(msg.rollNo, MAX_ROLL_NO_BYTES);
    if (!rollNo) {
      this.sendError(ws, "roll_no_required", "roll no required");
      return { kind: "pending" };
    }

    const prior = session.studentWs.get(rollNo);
    if (prior && prior !== ws) {
      sendIfOpen(prior, JSON.stringify({ t: "replaced_elsewhere" } satisfies ServerMsg));
      prior.close(1000, "replaced");
    }

    session.studentWs.set(rollNo, ws);
    session.dispatch(session.room.studentJoin(rollNo, displayName, Date.now()));
    return { kind: "student", roomId: msg.roomId, rollNo };
  }

  private handleDisconnect(ws: WebSocket, identity: ConnIdentity): void {
    if (identity.kind === "pending") return;
    const session = this.sessions.get(identity.roomId);
    if (!session) return;
    if (identity.kind === "teacher") {
      if (session.teacherWs === ws) {
        session.teacherWs = null;
        session.dispatch(session.room.teacherDisconnect(Date.now()));
      }
    } else {
      if (session.studentWs.get(identity.rollNo) === ws) {
        session.studentWs.delete(identity.rollNo);
        session.dispatch(session.room.studentLeave(identity.rollNo));
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
    try {
      ws.send(JSON.stringify(msg));
      console.log(`[do] sent ${msg.t}`);
    } catch (e) {
      console.warn(
        `[do] failed to send ${msg.t}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  private sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    console.log(`[do] sending error code=${code} message=${message}`);
    this.send(ws, { t: "error", code, message });
  }
}
