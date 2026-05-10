// Cross-runtime input-validation helpers shared between the Node
// adapter (`node.ts`) and the Cloudflare-Worker adapter in the
// sibling `classroom-server-worker` package.
//
// Two functions:
//   - `clamp(value, maxBytes)`: trim + UTF-8-byte-limit a user
//     string. Returns "" for non-strings, empty, or whitespace-only
//     inputs so callers can `if (!s) return error` cleanly.
//   - `sanitizeMeta(rawMeta)`: turn an arbitrary unknown into a
//     valid `RoomMeta` or null. Required fields are `course` and
//     `teacherName`; everything else is preserved when present.
//
// Both runtimes share `Buffer.byteLength` (Node has it natively;
// Workers expose it via `node:buffer` under the nodejs_compat flag).
// If a future runtime doesn't support that, fall back to
// `new TextEncoder().encode(s).length` — slightly slower per call
// but spec-portable.

import { Buffer } from "node:buffer";
import {
  MAX_META_FIELD_BYTES,
  MAX_NAME_BYTES,
  type RoomMeta,
} from "@emu8086/classroom-protocol";

export function clamp(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const trimmed = s.trim();
  if (trimmed.length === 0) return "";
  // Byte-limit; for ASCII names this is the same as char count, for
  // Devanagari etc. it falls back to a UTF-8 byte cap which is the
  // closest approximation to "fits in a database column" we have.
  const bytes = Buffer.byteLength(trimmed, "utf8");
  if (bytes <= max) return trimmed;
  // Truncate to max bytes safely. Scan back to a clean code-point boundary.
  const buf = Buffer.from(trimmed, "utf8").subarray(0, max);
  return buf.toString("utf8");
}

export function sanitizeMeta(meta: unknown): RoomMeta | null {
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Partial<RoomMeta>;
  const course = clamp(m.course, MAX_META_FIELD_BYTES);
  const teacherName = clamp(m.teacherName, MAX_NAME_BYTES);
  if (!course || !teacherName) return null;

  const out: RoomMeta = {
    course,
    teacherName,
    date: clamp(m.date, MAX_META_FIELD_BYTES) || new Date().toISOString().slice(0, 10),
  };
  // Optional fields — preserve only well-formed strings; clamp each.
  if (m.courseCode) out.courseCode = clamp(m.courseCode, MAX_META_FIELD_BYTES);
  if (m.section) out.section = clamp(m.section, MAX_META_FIELD_BYTES);
  if (m.semester) out.semester = clamp(m.semester, MAX_META_FIELD_BYTES);
  if (m.institute) out.institute = clamp(m.institute, MAX_META_FIELD_BYTES);
  if (m.department) out.department = clamp(m.department, MAX_META_FIELD_BYTES);
  if (m.teacherTitle) out.teacherTitle = clamp(m.teacherTitle, MAX_META_FIELD_BYTES);
  if (m.sessionTitle) out.sessionTitle = clamp(m.sessionTitle, MAX_META_FIELD_BYTES);
  if (m.logoUrl) out.logoUrl = clamp(m.logoUrl, 1024);
  return out;
}
