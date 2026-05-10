- **Classroom mode P3: collapsible drawer + interactions + per-student notes**.
  - The right-side drawer is now collapsible: a slim 44-px vertical strip
    on the right edge replaces it when collapsed, surfacing the room
    code (rotated mono), live student count, and a hands-up badge when
    one is up. State persists in localStorage.
  - Students can raise/lower their hand and submit their current buffer
    (with a confirm). The hand button latches; the submit flashes a
    "Submitted" affordance and routes through the existing zip pipeline.
  - Teacher rows are clickable to expand: the row reveals an inline
    comment thread for that student plus a small composer for leaving
    a note. Lower-hand and remove-from-room actions live next to the
    expansion toggle.
  - Per-student private notes are a new protocol surface
    (`add_comment`, `comment_added`, `mark_comment_seen`,
    `comment_seen`). Notes go to the teacher (echo) and the targeted
    student only — other students never see them. Students get an
    unread badge count in the drawer; "Mark as read" dismisses.
    PROTOCOL_VERSION → 2.

  Server: 4 new Room state-machine tests cover the comment add/seen
  transitions and rejection paths. 35 server tests total, all green.
  Web typecheck and production build clean (313 KB JS / 105 KB gzip).
