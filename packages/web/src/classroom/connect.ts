// Transport layer for classroom mode. Owns the live WebSocket,
// reconnect timer, and the routing of incoming `ServerMsg`s into
// the Zustand store. Action functions (raiseHand, submit, etc.)
// close over the active socket so they can be called from React
// components without threading a WS reference through props.
//
// The module exports a singleton (`classroomConnection`) — there's
// only ever one active room per browser tab, so a singleton avoids
// the "two connections fight over the same store" hazard.

import {
  PROTOCOL_VERSION,
  type ClientMsg,
  type RoomMeta,
  type ServerMsg,
} from "@modern8086/classroom-protocol";
import { classroomStore, type CloseReason } from "./store";

interface ConnectOptions {
  /** WebSocket URL; falls back to the build-time env var or localhost dev. */
  url?: string;
}

const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000];
const MAX_RECONNECT_WINDOW_MS = 30 * 60 * 1_000;

function defaultUrl(): string {
  // Build-time override for production deployments.
  const env = (import.meta.env as Record<string, string | undefined>)
    .VITE_CLASSROOM_WS_URL;
  if (env) return env;
  // Sensible default for `pnpm dev`: same hostname, fixed port.
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.hostname}:8787`;
  }
  return "ws://localhost:8787";
}

/** How long we wait for the first WS frame from the server (the
 *  `created` / `joined` response) before declaring the host
 *  unreachable. Generous enough to absorb a Cloudflare Workers /
 *  Durable Object cold start on the very first connection of the
 *  day, snappy enough that a deployment without a sidecar (e.g.
 *  GitHub Pages on its own) still surfaces the error reasonably
 *  fast. */
const CONNECT_TIMEOUT_MS = 12_000;

class ClassroomConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectStartedAt = 0;
  /** Captured at join time so we can replay it on reconnect. */
  private replay:
    | { kind: "create"; meta: RoomMeta; teacherDisplayName: string }
    | { kind: "join"; roomId: string; rollNo: string; displayName: string; hostToken?: string }
    | null = null;

  /** Manually-requested close prevents the reconnect logic from firing. */
  private intentionalClose = false;

  /** Flips true once the server has acknowledged our session.
   *  Until then, a WS close is treated as a terminal connection
   *  failure rather than a transient drop — the reconnect loop
   *  only makes sense once we know the server is real. */
  private everJoined = false;

  /** Timeout id for the connection deadline. Cleared on first
   *  server message or on close, whichever comes first. */
  private connectTimer: number | null = null;

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Teacher-side: spin up the room. */
  start(meta: RoomMeta, teacherDisplayName: string, opts: ConnectOptions = {}): void {
    this.replay = { kind: "create", meta, teacherDisplayName };
    this.everJoined = false;
    this.openSocket(opts.url ?? defaultUrl());
  }

  /** Student or reconnecting teacher: join an existing room. */
  join(
    roomId: string,
    rollNo: string,
    displayName: string,
    hostToken: string | undefined,
    opts: ConnectOptions = {},
  ): void {
    this.replay = { kind: "join", roomId, rollNo, displayName, hostToken };
    this.everJoined = false;
    this.openSocket(opts.url ?? defaultUrl());
  }

  /** Tear down the active session intentionally; no reconnect is attempted. */
  leave(reason: CloseReason = "user_left"): void {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.cancelConnectTimer();
    this.ws?.close(1000, "client leave");
    this.ws = null;
    this.replay = null;
    classroomStore.reset();
    classroomStore.set({ status: "closed", closeReason: reason });
  }

  /** Send a message; no-ops if the socket isn't ready. */
  send(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  // ---- Internals --------------------------------------------------------

  private openSocket(url: string): void {
    this.intentionalClose = false;
    classroomStore.set({
      status: "connecting",
      errorMessage: null,
      errorCode: null,
    });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      classroomStore.set({
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      // Replay the original create/join — required both on first
      // connect and on reconnect after a network blip.
      if (!this.replay) return;
      if (this.replay.kind === "create") {
        this.send({
          t: "create",
          protocolVersion: PROTOCOL_VERSION,
          meta: this.replay.meta,
          teacherDisplayName: this.replay.teacherDisplayName,
        });
      } else {
        this.send({
          t: "join",
          protocolVersion: PROTOCOL_VERSION,
          roomId: this.replay.roomId,
          rollNo: this.replay.rollNo,
          displayName: this.replay.displayName,
          hostToken: this.replay.hostToken,
        });
      }
    });

    ws.addEventListener("message", (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      this.handleServerMsg(msg);
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      this.cancelConnectTimer();
      const s = classroomStore.get();
      if (this.intentionalClose) return;
      if (s.status === "closed") return; // server told us; don't reconnect
      if (!this.everJoined) {
        // We never got past the handshake on this attempt. Looping
        // a reconnect against a host that almost certainly has no
        // classroom server just hides the problem. Surface it.
        this.intentionalClose = true;
        this.replay = null;
        classroomStore.set({
          status: "idle",
          errorCode: "server_unreachable",
          errorMessage: "couldn't reach the classroom server",
        });
        return;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // The "close" event will fire next; let it handle reconnect logic
      // so the two paths don't race on a single failure.
    });

    // Arm the connection deadline. If the open / first-message
    // round-trip hasn't completed by then, close the socket; the
    // close handler converts that into a clean errorCode the
    // dialog can surface.
    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = null;
      if (this.everJoined) return;
      if (!this.ws) return;
      classroomStore.set({
        status: "idle",
        errorCode: "connect_timeout",
        errorMessage: `no response in ${CONNECT_TIMEOUT_MS / 1000}s`,
      });
      this.intentionalClose = true;
      this.replay = null;
      try {
        this.ws.close(4000, "connect timeout");
      } catch {
        /* ignore */
      }
      this.ws = null;
    }, CONNECT_TIMEOUT_MS);
  }

  private cancelConnectTimer(): void {
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private handleServerMsg(msg: ServerMsg): void {
    switch (msg.t) {
      case "created": {
        // Teacher just created the room; the server will follow with
        // a `joined` event carrying the empty snapshot.
        classroomStore.set({
          roomId: msg.roomId,
          hostToken: msg.hostToken,
          meta: msg.meta,
        });
        // Persist hostToken on the replay so reconnect doesn't lose
        // teacher privileges.
        if (this.replay && this.replay.kind === "create") {
          this.replay = {
            kind: "join",
            roomId: msg.roomId,
            rollNo: "teacher",
            displayName: this.replay.teacherDisplayName,
            hostToken: msg.hostToken,
          };
        }
        return;
      }
      case "joined": {
        const snap = msg.snapshot;
        this.everJoined = true;
        this.cancelConnectTimer();
        classroomStore.set({
          status: "joined",
          role: msg.role,
          roomId: snap.roomId,
          meta: snap.meta,
          rollNo: msg.role === "student" ? msg.you : null,
          prompt: snap.prompt,
          broadcasting: snap.broadcasting,
          broadcastBuffer: snap.broadcastBuffer,
          controlGrantedTo: snap.controlGrantedTo,
          studentsForTeacher: snap.studentsForTeacher ?? [],
          peers: snap.peers ?? null,
          comments: snap.comments ?? [],
          errorMessage: null,
          reconnectAttempt: 0,
          closeReason: null,
        });
        return;
      }
      case "roster_changed":
        classroomStore.set({ studentsForTeacher: msg.students });
        return;
      case "peers_changed":
        classroomStore.set({ peers: msg.peers });
        return;
      case "hand_changed": {
        const s = classroomStore.get();
        if (s.studentsForTeacher.length > 0) {
          classroomStore.set({
            studentsForTeacher: s.studentsForTeacher.map((p) =>
              p.rollNo === msg.rollNo ? { ...p, handUp: msg.up } : p,
            ),
          });
        }
        return;
      }
      case "student_buffer": {
        const s = classroomStore.get();
        classroomStore.set({
          studentBuffers: {
            ...s.studentBuffers,
            [msg.rollNo]: { source: msg.source, at: msg.at },
          },
        });
        return;
      }
      case "submission_received": {
        const s = classroomStore.get();
        classroomStore.set({
          submissions: [...s.submissions, msg.submission],
        });
        return;
      }
      case "broadcast_state":
        classroomStore.set({
          broadcasting: msg.on,
          broadcastBuffer: msg.source,
        });
        return;
      case "broadcast_update":
        classroomStore.set({ broadcastBuffer: msg.source });
        return;
      case "control_change":
        classroomStore.set({
          controlGrantedTo: msg.rollNo,
          // Reset on either grant or release so a stale frame from a
          // previous control session doesn't leak across.
          controlBuffer: null,
        });
        return;
      case "control_buffer":
        // Lands in its own slot so the controlled student's editor
        // hook can subscribe and replace its source. Broadcast and
        // control are conceptually separate — keep them in distinct
        // fields rather than overloading broadcastBuffer.
        classroomStore.set({ controlBuffer: msg.source });
        return;
      case "prompt_changed":
        classroomStore.set({ prompt: msg.prompt });
        return;
      case "kicked":
        this.intentionalClose = true;
        classroomStore.set({
          status: "closed",
          closeReason: "kicked",
          errorMessage: msg.reason,
        });
        return;
      case "replaced_elsewhere":
        this.intentionalClose = true;
        classroomStore.set({
          status: "closed",
          closeReason: "replaced_elsewhere",
        });
        return;
      case "room_closed":
        this.intentionalClose = true;
        classroomStore.set({
          status: "closed",
          closeReason: msg.reason,
        });
        return;
      case "comment_added": {
        const s = classroomStore.get();
        // Skip duplicate ids (server may echo to multiple targets).
        if (s.comments.some((c) => c.id === msg.comment.id)) return;
        classroomStore.set({ comments: [...s.comments, msg.comment] });
        return;
      }
      case "comment_seen": {
        const s = classroomStore.get();
        classroomStore.set({
          comments: s.comments.map((c) =>
            c.id === msg.commentId ? { ...c, seenAt: msg.seenAt } : c,
          ),
        });
        return;
      }
      case "error": {
        const s = classroomStore.get();
        // Errors during the join handshake are fatal for the
        // current attempt: reset to idle so the dialog can
        // re-prompt with corrected inputs (typically roll_no_taken,
        // course_required, etc.). After "joined", treat them as
        // transient toasts — the connection is live and useful for
        // the next message.
        if (s.status === "connecting" || s.status === "reconnecting") {
          this.intentionalClose = true;
          this.cancelConnectTimer();
          classroomStore.set({
            status: "idle",
            errorCode: msg.code,
            errorMessage: msg.message,
          });
          this.ws?.close(1000, "rejected by server");
          this.replay = null;
        } else {
          classroomStore.set({
            errorCode: msg.code,
            errorMessage: msg.message,
            status: msg.code === "protocol_mismatch" ? "error" : s.status,
          });
        }
        return;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    if (!this.replay) return;
    const now = Date.now();
    if (this.reconnectStartedAt === 0) this.reconnectStartedAt = now;
    if (now - this.reconnectStartedAt > MAX_RECONNECT_WINDOW_MS) {
      classroomStore.set({
        status: "error",
        errorMessage: "lost connection to the classroom server",
      });
      this.replay = null;
      this.reconnectStartedAt = 0;
      return;
    }
    const attempt = classroomStore.get().reconnectAttempt;
    const delay =
      RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
    classroomStore.set({
      status: "reconnecting",
      reconnectAttempt: attempt + 1,
    });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(defaultUrl());
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectStartedAt = 0;
  }
}

export const classroomConnection = new ClassroomConnection();
