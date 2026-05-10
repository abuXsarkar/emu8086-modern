// "Your teacher can see your editor" notice shown to a student on
// first join into a given room. Confirmed once per (roomId, rollNo)
// pair, persisted in localStorage so a frequent rejoiner doesn't
// see it every time.

import { useStrings } from "../i18n";

interface ConsentModalProps {
  teacherName: string;
  rollNo: string;
  onAccept: () => void;
}

export function ConsentModal({ teacherName, rollNo, onAccept }: ConsentModalProps) {
  const t = useStrings();
  return (
    <div
      className="classroom-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="classroom-consent-heading"
    >
      <div className="classroom-modal classroom-consent">
        <h2 className="classroom-modal-heading" id="classroom-consent-heading">
          {t.classroomConsentHeading}
        </h2>
        <p className="classroom-consent-body">
          {t.classroomConsentBody(teacherName, rollNo)}
        </p>
        <div className="classroom-modal-actions">
          <button
            type="button"
            className="btn primary"
            onClick={onAccept}
            autoFocus
          >
            {t.classroomConsentContinue}
          </button>
        </div>
      </div>
    </div>
  );
}
