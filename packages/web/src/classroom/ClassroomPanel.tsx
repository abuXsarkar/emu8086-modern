// Top-level classroom UI. Renders one of three things depending on
// the store status:
//
//   - idle / closed / error: a header pill that opens the
//     start/join dialog;
//   - connecting / reconnecting: the pill with a spinner-ish
//     status text;
//   - joined: the slide-out drawer (TeacherDrawer or StudentDrawer).
//
// Components for the per-role drawers live next to this file so
// the routing stays declarative.

import { Suspense, lazy, useEffect, useState } from "react";
import { useStrings } from "../i18n";
import type { Strings } from "../i18n/types";
import { useClassroomStore, type CloseReason } from "./store";
import { hasConsented, recordConsent } from "./persist";
import { leaveClassroom } from "./actions";

// Heavy classroom UI components are loaded only when the user
// actually engages with the feature — keeps them out of the
// first-paint bundle. The pill stays eager (it's a tiny button
// that the user clicks to trigger everything else).
const StartJoinDialog = lazy(() =>
  import("./StartJoinDialog").then((m) => ({ default: m.StartJoinDialog })),
);
const ConsentModal = lazy(() =>
  import("./ConsentModal").then((m) => ({ default: m.ConsentModal })),
);
const Drawer = lazy(() => import("./Drawer").then((m) => ({ default: m.Drawer })));
const TeacherDrawer = lazy(() =>
  import("./TeacherDrawer").then((m) => ({ default: m.TeacherDrawer })),
);
const StudentDrawer = lazy(() =>
  import("./StudentDrawer").then((m) => ({ default: m.StudentDrawer })),
);

/**
 * The pill: belongs in the app header (near the language picker).
 * Owns the start/join dialog open state via a small global signal
 * so the drawer/closure layer can listen too.
 */
export function ClassroomPill() {
  const t = useStrings();
  const status = useClassroomStore((s) => s.status);
  const roomId = useClassroomStore((s) => s.roomId);
  const reconnectAttempt = useClassroomStore((s) => s.reconnectAttempt);

  if (status === "joined" && roomId) {
    return (
      <button
        type="button"
        className="classroom-pill active"
        onClick={leaveClassroom}
        title={t.classroomLeave}
      >
        <span className="classroom-pill-dot" />
        <span className="classroom-pill-label mono">{roomId}</span>
        <span className="classroom-pill-leave">×</span>
      </button>
    );
  }
  if (status === "connecting" || status === "reconnecting") {
    const label =
      status === "reconnecting"
        ? reconnectAttempt > 1
          ? t.classroomStatusReconnectingNth(reconnectAttempt)
          : t.classroomStatusReconnecting
        : t.classroomStatusConnecting;
    return (
      <button type="button" className="classroom-pill connecting" disabled>
        <span className="classroom-pill-dot warn" />
        <span className="classroom-pill-label">{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="classroom-pill"
      onClick={() => openStartJoinDialog()}
      title={t.classroomPillHint}
    >
      <span className="classroom-pill-dot off" />
      <span className="classroom-pill-label">{t.classroomPill}</span>
    </button>
  );
}

/**
 * The full-screen overlay layer: dialogs, drawer, consent modal,
 * closure toast. Mount this once at the app root. It reads the same
 * store the pill does and is fully self-contained.
 */
interface ClassroomLayerProps {
  /** The IDE's current editor source. Forwarded to the student drawer
   *  so its Submit button has something to send without reaching
   *  back into App-level state. */
  currentSource?: string;
}

export function ClassroomLayer({ currentSource }: ClassroomLayerProps = {}) {
  const status = useClassroomStore((s) => s.status);
  const role = useClassroomStore((s) => s.role);
  const roomId = useClassroomStore((s) => s.roomId);
  const rollNo = useClassroomStore((s) => s.rollNo);
  const meta = useClassroomStore((s) => s.meta);
  const closeReason = useClassroomStore((s) => s.closeReason);
  const errorMessage = useClassroomStore((s) => s.errorMessage);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialRoomFromUrl, setInitialRoomFromUrl] = useState<string | null>(null);
  // In-memory record of (roomId|rollNo) pairs accepted in this React
  // tree's lifetime. Mirrors the localStorage record kept by
  // `recordConsent`, but is also a reactive value so dismissing the
  // modal triggers a re-render — `hasConsented` alone reads
  // localStorage with no subscription.
  const [acceptedHere, setAcceptedHere] = useState<Set<string>>(() => new Set());

  // Open the dialog when ?room=... is present at first load, or
  // when ClassroomPill calls openStartJoinDialog().
  useEffect(() => {
    const url = new URL(window.location.href);
    const room = url.searchParams.get("room");
    if (room) {
      setInitialRoomFromUrl(room);
      setDialogOpen(true);
    }
    const off = subscribeToOpenDialog(() => setDialogOpen(true));
    return off;
  }, []);

  const consentKey = roomId && rollNo ? `${roomId}|${rollNo}` : null;
  const needsConsent =
    status === "joined" &&
    role === "student" &&
    consentKey !== null &&
    !acceptedHere.has(consentKey) &&
    !hasConsented(roomId!, rollNo!);

  return (
    <>
      {dialogOpen ? (
        <Suspense fallback={null}>
          <StartJoinDialog
            initialRoomId={initialRoomFromUrl ?? undefined}
            onClose={() => setDialogOpen(false)}
          />
        </Suspense>
      ) : null}

      {needsConsent && roomId && rollNo && consentKey ? (
        <Suspense fallback={null}>
          <ConsentModal
            teacherName={meta?.teacherName ?? "Your teacher"}
            rollNo={rollNo}
            onAccept={() => {
              recordConsent(roomId, rollNo);
              setAcceptedHere((prev) => {
                const next = new Set(prev);
                next.add(consentKey);
                return next;
              });
            }}
          />
        </Suspense>
      ) : null}

      {status === "joined" && roomId && meta ? (
        <Suspense fallback={null}>
          <Drawer roomId={roomId} meta={meta}>
            {role === "teacher" ? (
              <TeacherDrawer currentSource={currentSource} />
            ) : (
              <StudentDrawer currentSource={currentSource} />
            )}
          </Drawer>
        </Suspense>
      ) : null}

      {status === "closed" && closeReason ? (
        <ClosureBanner
          reason={closeReason}
          message={errorMessage}
          onDismiss={() => {
            // Resetting status back to idle clears the toast and lets
            // the user re-engage via the pill.
            useClassroomStore.setState((s) => ({
              ...s,
              status: "idle",
              closeReason: null,
              errorCode: null,
              errorMessage: null,
            }));
          }}
        />
      ) : null}
    </>
  );
}

// ---------- Pill <-> Layer signal -----------------------------------------

// The pill is rendered inside the header; the layer (which owns the
// dialog open-state) is mounted at the app root. They communicate
// via a tiny pub/sub so the pill click can open the layer's dialog
// without lifting state into App.tsx.
type Listener = () => void;
let openDialogListeners: Listener[] = [];
function openStartJoinDialog(): void {
  for (const fn of openDialogListeners) fn();
}
function subscribeToOpenDialog(fn: Listener): () => void {
  openDialogListeners.push(fn);
  return () => {
    openDialogListeners = openDialogListeners.filter((f) => f !== fn);
  };
}

interface ClosureBannerProps {
  reason: CloseReason;
  message: string | null;
  onDismiss: () => void;
}
function ClosureBanner({ reason, message, onDismiss }: ClosureBannerProps) {
  const t = useStrings();
  const text = closureText(reason, message, t);
  if (text === null) return null;
  return (
    <div className="classroom-closure" role="status">
      <span>{text}</span>
      <button
        type="button"
        className="classroom-closure-dismiss"
        onClick={onDismiss}
        aria-label={t.classroomClosureDismiss}
        title={t.classroomClosureDismiss}
      >
        ×
      </button>
    </div>
  );
}

function closureText(reason: CloseReason, message: string | null, t: Strings): string | null {
  switch (reason) {
    case "user_left":
      return null;
    case "teacher_closed":
      return t.classroomStatusRoomClosed;
    case "reaped":
      return t.classroomStatusRoomReaped;
    case "kicked":
      return t.classroomStatusKicked(message ?? "");
    case "replaced_elsewhere":
      return t.classroomStatusReplacedElsewhere;
    case "error":
      return t.classroomErrorGeneric(message ?? "unknown");
  }
}
