// Wrapper around the classroom drawer that owns the collapse
// affordance. Two visual states:
//
//   - expanded: the full panel (banner + role-specific drawer body)
//     anchored to the right edge.
//   - collapsed: a slim 40-px wide vertical strip on the right edge
//     showing room code (rotated mono), student count, and a
//     hands-up badge if any. Clicking the strip expands; expanded
//     state has a chevron header that collapses.
//
// State persists in localStorage so the user's preference survives a
// refresh.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { RoomMeta } from "@modern8086/classroom-protocol";
import { useStrings } from "../i18n";
import { Banner } from "./Banner";
import { useClassroomStore } from "./store";

const COLLAPSE_KEY = "modern8086.classroom.drawer-collapsed";

interface DrawerProps {
  roomId: string;
  meta: RoomMeta;
  children: ReactNode;
}

export function Drawer({ roomId, meta, children }: DrawerProps) {
  const t = useStrings();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const role = useClassroomStore((s) => s.role);
  const peers = useClassroomStore((s) => s.peers);
  const studentsForTeacher = useClassroomStore((s) => s.studentsForTeacher);
  const handsUp =
    role === "teacher"
      ? studentsForTeacher.filter((s) => s.handUp).length
      : peers?.handsUp ?? 0;
  const studentCount =
    role === "teacher" ? studentsForTeacher.length : peers?.total ?? 0;

  if (collapsed) {
    return (
      <button
        type="button"
        className="classroom-strip"
        onClick={() => setCollapsed(false)}
        title={t.classroomDrawerExpand}
        aria-label={t.classroomDrawerExpand}
      >
        <span className="classroom-strip-chevron" aria-hidden>
          ‹
        </span>
        <span className="classroom-strip-room mono">{roomId}</span>
        <span className="classroom-strip-stat" aria-label={t.classroomDrawerStudentsCount(studentCount)}>
          <span className="classroom-strip-stat-num mono">{studentCount}</span>
          <span className="classroom-strip-stat-icon" aria-hidden>
            ◍
          </span>
        </span>
        {handsUp > 0 ? (
          <span className="classroom-strip-stat warn" aria-label={`${handsUp} hand up`}>
            <span className="classroom-strip-stat-num mono">{handsUp}</span>
            <span className="classroom-strip-stat-icon" aria-hidden>
              ✋
            </span>
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <aside className="classroom-drawer" aria-label={t.classroomPill}>
      <button
        type="button"
        className="classroom-drawer-collapse"
        onClick={() => setCollapsed(true)}
        title={t.classroomDrawerCollapse}
        aria-label={t.classroomDrawerCollapse}
      >
        ›
      </button>
      <Banner roomId={roomId} meta={meta} />
      {children}
    </aside>
  );
}
