// Course/session header strip. Shown to every participant inside
// the classroom drawer; the metadata is what gives a session its
// formal-lab feel — that's the educator-adoption hinge from the
// design doc.

import { useState } from "react";
import type { RoomMeta } from "@emu8086/classroom-protocol";
import { useStrings } from "../i18n";

interface BannerProps {
  roomId: string;
  meta: RoomMeta;
}

export function Banner({ roomId, meta }: BannerProps) {
  const t = useStrings();
  const [copied, setCopied] = useState(false);
  const lineParts = [
    meta.courseCode || meta.course,
    meta.section,
    meta.sessionTitle,
    `${meta.teacherTitle ?? ""} ${meta.teacherName}`.trim(),
    meta.date,
  ].filter(Boolean);

  function copyLink(): void {
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          // Best-effort: pop the URL into the location bar so the
          // teacher still has a way to share it.
          window.location.hash = `room=${encodeURIComponent(roomId)}`;
        });
    }
  }

  return (
    <div className="classroom-banner" aria-label={`Classroom ${roomId}`}>
      {meta.logoUrl ? (
        <img
          className="classroom-banner-logo"
          src={meta.logoUrl}
          alt=""
          // Don't let a broken logo URL bleed into the layout: hide it.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      <div className="classroom-banner-text">
        <div className="classroom-banner-line">{lineParts.join(" · ")}</div>
        {meta.institute || meta.department ? (
          <div className="classroom-banner-sub">
            {[meta.institute, meta.department].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </div>
      <div className="classroom-banner-code">
        <span className="classroom-banner-code-text mono">{roomId}</span>
        <button
          type="button"
          className="classroom-banner-copy reset-link"
          onClick={copyLink}
          title={t.classroomBannerCopy}
          aria-label={t.classroomBannerCopy}
        >
          {copied ? t.classroomBannerCopied : t.classroomBannerCopy}
        </button>
      </div>
    </div>
  );
}
