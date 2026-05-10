// Tiny localStorage helpers for classroom mode. Three pieces of
// state survive page refreshes:
//
//   - the last-used display name and roll-no per device, so the
//     join form doesn't make students retype on every reload;
//   - the list of (roomId, rollNo) pairs that have already
//     dismissed the "your teacher can see your editor" consent
//     modal, so the second join doesn't pester them;
//   - a small set of saved RoomMeta templates the teacher can pick
//     from when starting a fresh session.
//
// Nothing else is persisted on purpose. The classroom session
// itself is intentionally tab-scoped: closing the tab leaves the
// room. Auto-rejoin on reload is a P5 concern.

import type { RoomMeta } from "@emu8086/classroom-protocol";

const KEY_NAME = "emu8086.classroom.last-display-name";
const KEY_ROLL = "emu8086.classroom.last-roll-no";
const KEY_CONSENT = "emu8086.classroom.consented";
const KEY_TEMPLATES = "emu8086.classroom.templates";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled-storage — nothing to do */
  }
}

export function getLastDisplayName(): string {
  try {
    return localStorage.getItem(KEY_NAME) ?? "";
  } catch {
    return "";
  }
}

export function setLastDisplayName(name: string): void {
  try {
    localStorage.setItem(KEY_NAME, name);
  } catch {
    /* ignore */
  }
}

export function getLastRollNo(): string {
  try {
    return localStorage.getItem(KEY_ROLL) ?? "";
  } catch {
    return "";
  }
}

export function setLastRollNo(rollNo: string): void {
  try {
    localStorage.setItem(KEY_ROLL, rollNo);
  } catch {
    /* ignore */
  }
}

function consentKey(roomId: string, rollNo: string): string {
  return `${roomId}|${rollNo}`;
}

export function hasConsented(roomId: string, rollNo: string): boolean {
  const list = readJson<string[]>(KEY_CONSENT, []);
  return Array.isArray(list) && list.includes(consentKey(roomId, rollNo));
}

export function recordConsent(roomId: string, rollNo: string): void {
  const list = readJson<string[]>(KEY_CONSENT, []);
  const k = consentKey(roomId, rollNo);
  if (!Array.isArray(list)) {
    writeJson(KEY_CONSENT, [k]);
    return;
  }
  if (list.includes(k)) return;
  // Cap the list so we don't grow forever in long-lived browsers.
  const trimmed = list.length > 200 ? list.slice(-150) : list;
  writeJson(KEY_CONSENT, [...trimmed, k]);
}

/** Templates: a saved RoomMeta the teacher can re-use. */
export interface ClassroomTemplate {
  /** Stable id used as the React key + delete handle. */
  id: string;
  /** Human-readable name; auto-generated from course/section. */
  label: string;
  meta: Omit<RoomMeta, "date">;
  savedAt: number;
}

export function listTemplates(): ClassroomTemplate[] {
  const v = readJson<ClassroomTemplate[]>(KEY_TEMPLATES, []);
  return Array.isArray(v) ? v : [];
}

export function saveTemplate(t: ClassroomTemplate): void {
  const list = listTemplates();
  // Replace by id if already present, otherwise prepend.
  const next = [t, ...list.filter((x) => x.id !== t.id)];
  writeJson(KEY_TEMPLATES, next.slice(0, 24));
}

export function deleteTemplate(id: string): void {
  const list = listTemplates();
  writeJson(
    KEY_TEMPLATES,
    list.filter((x) => x.id !== id),
  );
}

export function makeTemplateLabel(meta: Omit<RoomMeta, "date">): string {
  const parts = [meta.courseCode || meta.course, meta.section, meta.semester].filter(
    Boolean,
  );
  return parts.join(" · ") || meta.course;
}
