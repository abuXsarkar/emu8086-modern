- **Classroom mode P2: client UI**. The header now hosts a
  "Classroom" pill that opens a Start/Join modal: teachers fill in
  course metadata (with reusable templates persisted in
  localStorage) to spin up a room; students enter the room code
  plus their roll number to join. Once joined, a slide-out drawer on
  the right shows the formal-lab banner (course code · section ·
  teacher · date · room code with copy-link), a roster view for
  the teacher and a status view for students, the live prompt
  text, and a peers count. Students see the consent modal once
  per (room, roll-no) pair the first time they join. Connection
  status flows through the pill — connecting / reconnecting / joined
  / closed — and a bottom-right toast surfaces room-closed,
  reaped, kicked, or replaced-elsewhere outcomes.

  Also lands i18n graceful fallback: non-English locales now use
  `Partial<Strings>` and `useStrings` merges English on top, so
  adding a new key only forces a translation in `en.ts`. The 13
  classroom-mode strings ship in English; other locales fall
  through cleanly until someone fills them in.

  Interactive bits (raise hand, submit, take control, broadcast)
  ship in P3.
