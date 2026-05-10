// Modal with two tabs: "Start a classroom" (teacher) and "Join with
// code" (everyone else). Pre-fills the join form from a `?room=`
// query param when present, and pre-fills name/rollNo from the
// last-used localStorage values so reconnecting is one click.

import { useEffect, useId, useState } from "react";
import type { RoomMeta } from "@emu8086/classroom-protocol";
import { useStrings } from "../i18n";
import { joinClassroom, startClassroom } from "./actions";
import { useClassroomStore } from "./store";
import { localizeErrorCode } from "./errorMessages";
import {
  type ClassroomTemplate,
  deleteTemplate,
  getLastDisplayName,
  getLastRollNo,
  listTemplates,
  makeTemplateLabel,
  saveTemplate,
  setLastDisplayName,
  setLastRollNo,
} from "./persist";

type Tab = "start" | "join";

interface DialogProps {
  initialTab?: Tab;
  initialRoomId?: string;
  onClose: () => void;
}

export function StartJoinDialog({
  initialTab = "start",
  initialRoomId,
  onClose,
}: DialogProps) {
  const t = useStrings();
  const [tab, setTab] = useState<Tab>(initialRoomId ? "join" : initialTab);

  function onBackdropMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="classroom-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={tab === "start" ? t.classroomStartHeading : t.classroomJoinHeading}
      onMouseDown={onBackdropMouseDown}
    >
      <div className="classroom-modal classroom-startjoin">
        <div className="classroom-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "start"}
            className={`classroom-modal-tab${tab === "start" ? " active" : ""}`}
            onClick={() => setTab("start")}
          >
            {t.classroomStartTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "join"}
            className={`classroom-modal-tab${tab === "join" ? " active" : ""}`}
            onClick={() => setTab("join")}
          >
            {t.classroomJoinTab}
          </button>
          <button
            type="button"
            className="classroom-modal-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {tab === "start" ? (
          <StartForm onClose={onClose} />
        ) : (
          <JoinForm onClose={onClose} initialRoomId={initialRoomId ?? ""} />
        )}
      </div>
    </div>
  );
}

// ---------- Start form ------------------------------------------------------

const TODAY = () => new Date().toISOString().slice(0, 10);

function StartForm({ onClose }: { onClose: () => void }) {
  const t = useStrings();
  const headingId = useId();
  const status = useClassroomStore((s) => s.status);
  const errorCode = useClassroomStore((s) => s.errorCode);
  const errorMessage = useClassroomStore((s) => s.errorMessage);
  const [meta, setMeta] = useState<RoomMeta>(() => ({
    course: "",
    teacherName: getLastDisplayName(),
    date: TODAY(),
  }));
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templates, setTemplates] = useState<ClassroomTemplate[]>(() => listTemplates());
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Close on success; surface server errors inline. The store flips
  // to "idle" with errorCode set when the server rejects the create.
  useEffect(() => {
    if (!submitted) return;
    if (status === "joined") {
      onClose();
      return;
    }
    if (status === "idle" && errorCode) {
      setError(localizeErrorCode(errorCode, errorMessage ?? "", t));
      setSubmitted(false);
    }
  }, [submitted, status, errorCode, errorMessage, t, onClose]);

  function patch<K extends keyof RoomMeta>(key: K, value: RoomMeta[K]): void {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  function applyTemplate(id: string): void {
    if (!id) return;
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setMeta({ ...tpl.meta, date: TODAY() });
  }

  function removeTemplate(id: string): void {
    deleteTemplate(id);
    setTemplates(listTemplates());
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!meta.course.trim()) {
      setError(t.classroomStartCourseRequired);
      return;
    }
    if (!meta.teacherName.trim()) {
      setError(t.classroomStartTeacherRequired);
      return;
    }
    if (saveAsTemplate) {
      const { date, ...rest } = meta;
      // `date` is intentionally not persisted in the template — it
      // auto-fills on each new session.
      void date;
      const id =
        (rest.courseCode || rest.course).toLowerCase().replace(/\s+/g, "-") +
        "-" +
        (rest.section || "").toLowerCase().replace(/\s+/g, "-");
      saveTemplate({
        id,
        label: makeTemplateLabel(rest),
        meta: rest,
        savedAt: Date.now(),
      });
    }
    setLastDisplayName(meta.teacherName);
    setError(null);
    setSubmitted(true);
    startClassroom(meta, meta.teacherName);
    // Don't onClose here — the effect above closes on `joined`.
  }

  return (
    <form className="classroom-form" onSubmit={onSubmit} aria-labelledby={headingId}>
      <h2 className="classroom-form-heading" id={headingId}>
        {t.classroomStartHeading}
      </h2>

      {templates.length > 0 ? (
        <Field label={t.classroomStartTemplate}>
          <div className="classroom-template-row">
            <select
              className="classroom-input"
              defaultValue=""
              onChange={(e) => {
                applyTemplate(e.target.value);
                e.currentTarget.value = "";
              }}
            >
              <option value="">{t.classroomStartTemplateNone}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label}
                </option>
              ))}
            </select>
            {templates.map((tpl) => (
              <button
                key={`${tpl.id}-del`}
                type="button"
                className="reset-link"
                onClick={() => removeTemplate(tpl.id)}
                title={`Delete template ${tpl.label}`}
              >
                × {tpl.label}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <Field label={t.classroomStartCourse} required>
        <input
          className="classroom-input"
          value={meta.course}
          onChange={(e) => patch("course", e.target.value)}
          autoFocus
        />
      </Field>
      <div className="classroom-form-row">
        <Field label={t.classroomStartCourseCode}>
          <input
            className="classroom-input"
            value={meta.courseCode ?? ""}
            onChange={(e) => patch("courseCode", e.target.value)}
          />
        </Field>
        <Field label={t.classroomStartSection}>
          <input
            className="classroom-input"
            value={meta.section ?? ""}
            onChange={(e) => patch("section", e.target.value)}
          />
        </Field>
      </div>
      <div className="classroom-form-row">
        <Field label={t.classroomStartSemester}>
          <input
            className="classroom-input"
            value={meta.semester ?? ""}
            onChange={(e) => patch("semester", e.target.value)}
          />
        </Field>
        <Field label={t.classroomStartDate}>
          <input
            type="date"
            className="classroom-input"
            value={meta.date}
            onChange={(e) => patch("date", e.target.value)}
          />
        </Field>
      </div>
      <div className="classroom-form-row">
        <Field label={t.classroomStartInstitute}>
          <input
            className="classroom-input"
            value={meta.institute ?? ""}
            onChange={(e) => patch("institute", e.target.value)}
          />
        </Field>
        <Field label={t.classroomStartDepartment}>
          <input
            className="classroom-input"
            value={meta.department ?? ""}
            onChange={(e) => patch("department", e.target.value)}
          />
        </Field>
      </div>
      <div className="classroom-form-row">
        <Field label={t.classroomStartTeacherTitle}>
          <input
            className="classroom-input"
            value={meta.teacherTitle ?? ""}
            onChange={(e) => patch("teacherTitle", e.target.value)}
          />
        </Field>
        <Field label={t.classroomStartTeacherName} required>
          <input
            className="classroom-input"
            value={meta.teacherName}
            onChange={(e) => patch("teacherName", e.target.value)}
          />
        </Field>
      </div>
      <Field label={t.classroomStartSessionTitle}>
        <input
          className="classroom-input"
          value={meta.sessionTitle ?? ""}
          onChange={(e) => patch("sessionTitle", e.target.value)}
        />
      </Field>
      <Field label={t.classroomStartLogoUrl} hint={t.classroomStartLogoHelp}>
        <input
          type="url"
          className="classroom-input"
          value={meta.logoUrl ?? ""}
          onChange={(e) => patch("logoUrl", e.target.value)}
        />
      </Field>

      <label className="classroom-checkbox">
        <input
          type="checkbox"
          checked={saveAsTemplate}
          onChange={(e) => setSaveAsTemplate(e.target.checked)}
        />
        <span>{t.classroomStartTemplateSave}</span>
      </label>

      {error ? <div className="classroom-form-error">{error}</div> : null}

      <div className="classroom-form-actions">
        <button type="button" className="btn ghost" onClick={onClose} disabled={submitted}>
          {t.classroomStartCancel}
        </button>
        <button type="submit" className="btn primary" disabled={submitted}>
          {submitted ? t.classroomStatusConnecting : t.classroomStartSubmit}
        </button>
      </div>
    </form>
  );
}

// ---------- Join form -------------------------------------------------------

function JoinForm({
  onClose,
  initialRoomId,
}: {
  onClose: () => void;
  initialRoomId: string;
}) {
  const t = useStrings();
  const headingId = useId();
  const status = useClassroomStore((s) => s.status);
  const errorCode = useClassroomStore((s) => s.errorCode);
  const errorMessage = useClassroomStore((s) => s.errorMessage);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [rollNo, setRollNo] = useState(getLastRollNo());
  const [displayName, setDisplayName] = useState(getLastDisplayName());
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // If the URL changes underneath us (rare, but possible during dev),
  // honour the new value.
  useEffect(() => {
    if (initialRoomId && initialRoomId !== roomId) setRoomId(initialRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId]);

  // Close on success; show error inline on rejection (most likely
  // roll_no_taken or room_not_found).
  useEffect(() => {
    if (!submitted) return;
    if (status === "joined") {
      onClose();
      return;
    }
    if (status === "idle" && errorCode) {
      setError(localizeErrorCode(errorCode, errorMessage ?? "", t));
      setSubmitted(false);
    }
  }, [submitted, status, errorCode, errorMessage, t, onClose]);

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!roomId.trim()) {
      setError(t.classroomJoinRoomCodeRequired);
      return;
    }
    if (!rollNo.trim()) {
      setError(t.classroomJoinRollNoRequired);
      return;
    }
    if (!displayName.trim()) {
      setError(t.classroomJoinDisplayNameRequired);
      return;
    }
    setLastRollNo(rollNo);
    setLastDisplayName(displayName);
    setError(null);
    setSubmitted(true);
    joinClassroom(roomId.trim(), rollNo.trim(), displayName.trim());
    // The effect above handles success/failure transitions.
  }

  return (
    <form className="classroom-form" onSubmit={onSubmit} aria-labelledby={headingId}>
      <h2 className="classroom-form-heading" id={headingId}>
        {t.classroomJoinHeading}
      </h2>
      <Field label={t.classroomJoinRoomCode} required>
        <input
          className="classroom-input mono"
          value={roomId}
          placeholder="blue-fox-42"
          onChange={(e) => setRoomId(e.target.value)}
          autoFocus={!initialRoomId}
        />
      </Field>
      <Field label={t.classroomJoinRollNo} required hint={t.classroomJoinRollNoHint}>
        <input
          className="classroom-input"
          value={rollNo}
          onChange={(e) => setRollNo(e.target.value)}
          autoFocus={!!initialRoomId}
        />
      </Field>
      <Field label={t.classroomJoinDisplayName} required>
        <input
          className="classroom-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>
      {error ? <div className="classroom-form-error">{error}</div> : null}
      <div className="classroom-form-actions">
        <button type="button" className="btn ghost" onClick={onClose} disabled={submitted}>
          {t.classroomJoinCancel}
        </button>
        <button type="submit" className="btn primary" disabled={submitted}>
          {submitted ? t.classroomStatusConnecting : t.classroomJoinSubmit}
        </button>
      </div>
    </form>
  );
}

// ---------- Helpers ---------------------------------------------------------

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="classroom-field">
      <span className="classroom-field-label">
        {label}
        {required ? <span className="classroom-field-required">*</span> : null}
      </span>
      {children}
      {hint ? <span className="classroom-field-hint">{hint}</span> : null}
    </label>
  );
}
