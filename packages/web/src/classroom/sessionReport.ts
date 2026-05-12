// Builds the print-friendly session summary and CSV export.
// Both consume the same view-model so the data shown in the printed
// page exactly matches the spreadsheet a teacher imports later.
//
// Implementation choice: the print summary opens in a fresh tab via
// document.write() with self-contained inline CSS. This avoids
// disturbing the live IDE document (Monaco doesn't love being moved
// in or out of @media print contexts) and means the teacher can
// keep the classroom open while saving the PDF.

import type {
  Comment,
  RoomMeta,
  StudentPublic,
  Submission,
} from "@modern8086/classroom-protocol";
import type { Strings } from "../i18n/types";

interface RowVM {
  rollNo: string;
  name: string;
  joinedAt: number;
  handUp: boolean;
  submissionCount: number;
  lastSubmissionAt: number | null;
  commentCount: number;
}

interface ReportInput {
  roomId: string;
  meta: RoomMeta;
  students: ReadonlyArray<StudentPublic>;
  submissions: ReadonlyArray<Submission>;
  comments: ReadonlyArray<Comment>;
}

function buildRows(input: ReportInput): RowVM[] {
  const subsByRoll = new Map<string, Submission[]>();
  for (const s of input.submissions) {
    const list = subsByRoll.get(s.rollNo) ?? [];
    list.push(s);
    subsByRoll.set(s.rollNo, list);
  }
  const commentsByRoll = new Map<string, number>();
  for (const c of input.comments) {
    commentsByRoll.set(c.rollNo, (commentsByRoll.get(c.rollNo) ?? 0) + 1);
  }
  return input.students
    .map((s) => {
      const subs = subsByRoll.get(s.rollNo) ?? [];
      const last = subs.length > 0 ? Math.max(...subs.map((x) => x.at)) : null;
      return {
        rollNo: s.rollNo,
        name: s.displayName,
        joinedAt: s.joinedAt,
        handUp: s.handUp,
        submissionCount: subs.length,
        lastSubmissionAt: last,
        commentCount: commentsByRoll.get(s.rollNo) ?? 0,
      };
    })
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
}

function fmtTime(epochMs: number | null): string {
  if (epochMs === null) return "—";
  return new Date(epochMs).toLocaleTimeString();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Open a fresh tab with a print-styled summary page. */
export function printSessionSummary(input: ReportInput, t: Strings): void {
  const rows = buildRows(input);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return; // popup blocked; the caller can fall back to CSV
  const headerLine = [
    input.meta.courseCode || input.meta.course,
    input.meta.section ? `Section ${input.meta.section}` : "",
    input.meta.sessionTitle,
    `${input.meta.teacherTitle ?? ""} ${input.meta.teacherName}`.trim(),
    input.meta.date,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map(escapeHtml)
    .join(" · ");
  const subline = [input.meta.institute, input.meta.department]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map(escapeHtml)
    .join(" · ");

  const tableRows = rows
    .map(
      (r) => `
        <tr>
          <td class="mono">${escapeHtml(r.rollNo)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td class="mono">${fmtTime(r.joinedAt)}</td>
          <td>${r.handUp ? "✓" : ""}</td>
          <td class="num">${r.submissionCount}</td>
          <td class="mono">${fmtTime(r.lastSubmissionAt)}</td>
          <td class="num">${r.commentCount}</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(t.classroomReportTitle)} — ${escapeHtml(input.roomId)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
         margin: 32px; color: #111; background: #fff; line-height: 1.4; }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 600; }
  .subtitle { color: #555; font-size: 13px; margin: 0 0 16px; }
  .header { border-bottom: 1.2px solid #111; padding-bottom: 10px; margin-bottom: 20px; }
  .meta-line { font-size: 13px; color: #222; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 0.6px solid #bbb; }
  th { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #555; border-bottom-color: #333; }
  td.num { text-align: right; }
  td.mono, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .hint { color: #888; font-size: 11px; margin-top: 18px; }
  @media print {
    body { margin: 16mm 14mm; }
    .hint { display: none; }
  }
</style>
</head>
<body>
  <header class="header">
    <h1>${escapeHtml(t.classroomReportTitle)}</h1>
    <p class="subtitle">${escapeHtml(t.classroomReportSubtitle(input.meta.date))} · room ${escapeHtml(input.roomId)}</p>
    <p class="meta-line">${headerLine}</p>
    ${subline ? `<p class="meta-line">${subline}</p>` : ""}
  </header>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(t.classroomReportColRollNo)}</th>
        <th>${escapeHtml(t.classroomReportColName)}</th>
        <th>${escapeHtml(t.classroomReportColJoined)}</th>
        <th>${escapeHtml(t.classroomReportColHandUp)}</th>
        <th>${escapeHtml(t.classroomReportColSubmissions)}</th>
        <th>${escapeHtml(t.classroomReportColLastSubmit)}</th>
        <th>${escapeHtml(t.classroomReportColComments)}</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="hint">${escapeHtml(t.classroomReportPrintHint)}</p>
  <script>setTimeout(function(){ window.focus(); window.print && window.print(); }, 200);</script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function csvCell(s: string | number | null): string {
  if (s === null) return "";
  const str = String(s);
  // Quote any cell that contains comma, quote, or newline; double up
  // embedded quotes per RFC 4180.
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Build a CSV blob mirroring the print summary and trigger a download. */
export function downloadSessionCsv(input: ReportInput, t: Strings): void {
  const rows = buildRows(input);
  const header = [
    t.classroomReportColRollNo,
    t.classroomReportColName,
    t.classroomReportColJoined,
    t.classroomReportColHandUp,
    t.classroomReportColSubmissions,
    t.classroomReportColLastSubmit,
    t.classroomReportColComments,
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.rollNo,
        r.name,
        new Date(r.joinedAt).toISOString(),
        r.handUp ? 1 : 0,
        r.submissionCount,
        r.lastSubmissionAt === null ? "" : new Date(r.lastSubmissionAt).toISOString(),
        r.commentCount,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const filename = sanitizeFilename(
    `${input.meta.courseCode || input.meta.course}_${input.meta.date}_${input.roomId}.csv`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so older browsers don't cancel the download mid-stream.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}
