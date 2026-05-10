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
} from "@emu8086/classroom-protocol";
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

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Teacher-side: spin up the room. */
  start(meta: RoomMeta, teacherDisplayName: string, opts: ConnectOptions = {}): void {
    this.replay = { kind: "create", meta, teacherDisplayName };
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
    this.openSocket(opts.url ?? defaultUrl());
  }

  /** Tear down the active session intentionally; no reconnect is attempted. */
  leave(reason: CloseReason = "user_left"): void {
    this.intentionalClose = true;
    this.cancelReconnect();
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
    classroomStore.set({ status: "connecting", errorMessage: null });
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
      const s = classroomStore.get();
      if (this.intentionalClose) return;
      if (s.status === "closed") return; // server told us; don't reconnect
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // The "close" event will fire next; let it handle reconnect logic
      // so the two paths don't race on a single failure.
    });
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
        classroomStore.set({ controlGrantedTo: msg.rollNo });
        return;
      case "control_buffer":
        // The student-side editor consumes this directly via a
        // store subscription — we just stash the latest source so a
        // late subscriber can pick up the current frame.
        classroomStore.set({ broadcastBuffer: msg.source });
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
      case "error":
        classroomStore.set({
          errorMessage: msg.message,
          status: msg.code === "protocol_mismatch" ? "error" : classroomStore.get().status,
        });
        return;
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
