- **Classroom mode P5: error UX, reconnect, dismissible closure**.
  - Server-rejected joins (e.g. `roll_no_taken`, `room_not_found`)
    now surface inline in the join/start dialog with a localized
    message instead of dropping the user back to a closed dialog
    with no explanation. The dialog stays open and disabled while
    a request is in flight; the submit button shows "Connecting…".
  - New `errorCode` field on the store + `localizeErrorCode` helper
    pulls a translation from the i18n table. Errors after a
    successful join become transient toasts; pre-join errors
    cleanly reset the connection.
  - Reconnect attempts are visible in the pill: after the second
    attempt the label switches to "Reconnecting (attempt N)…".
  - The closure banner that appears when the room ends is now
    dismissible — a × button clears the state and lets the user
    re-engage via the pill.
