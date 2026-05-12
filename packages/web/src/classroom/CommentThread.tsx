// Per-student comment thread, shared by teacher and student views.
// The teacher sees a composer below the list to send a new note;
// the student sees a "mark as read" affordance for any unseen note.

import { useState } from "react";
import type { Comment } from "@modern8086/classroom-protocol";
import { useStrings } from "../i18n";
import { addComment, markCommentSeen } from "./actions";

interface CommentThreadProps {
  rollNo: string;
  comments: ReadonlyArray<Comment>;
  role: "teacher" | "student";
}

export function CommentThread({ rollNo, comments, role }: CommentThreadProps) {
  const t = useStrings();
  const [draft, setDraft] = useState("");
  const sorted = [...comments].sort((a, b) => a.at - b.at);

  function send(): void {
    const body = draft.trim();
    if (!body) return;
    addComment(rollNo, body);
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // Cmd/Ctrl+Enter sends. Enter alone allows multi-line typing.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="classroom-comment-thread">
      {sorted.length === 0 ? (
        <p className="classroom-empty">
          {role === "teacher" ? t.classroomCommentEmptyTeacher : t.classroomCommentEmpty}
        </p>
      ) : (
        <ul className="classroom-comment-list">
          {sorted.map((c) => (
            <li
              key={c.id}
              className={`classroom-comment${c.seenAt === null && role === "student" ? " unseen" : ""}`}
            >
              <p className="classroom-comment-body">{c.body}</p>
              <div className="classroom-comment-meta">
                <span className="classroom-comment-time mono">
                  {new Date(c.at).toLocaleTimeString()}
                </span>
                {c.seenAt !== null ? (
                  <span className="classroom-comment-seen">{t.classroomCommentSeen}</span>
                ) : role === "student" ? (
                  <button
                    type="button"
                    className="reset-link"
                    onClick={() => markCommentSeen(c.id)}
                  >
                    {t.classroomCommentMarkSeen}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {role === "teacher" ? (
        <div className="classroom-comment-composer">
          <textarea
            className="classroom-comment-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.classroomCommentPlaceholder}
            rows={2}
          />
          <button
            type="button"
            className="btn primary"
            onClick={send}
            disabled={draft.trim().length === 0}
          >
            {t.classroomCommentSend}
          </button>
        </div>
      ) : null}
    </div>
  );
}
