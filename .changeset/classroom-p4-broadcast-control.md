- **Classroom mode P4: broadcast + take-control + buffer streaming**.
  - `useClassroomEditor` hook bridges the IDE editor with the
    classroom transport. Students send debounced `buffer_update`s to
    the teacher; teachers send `broadcast_update` while broadcasting,
    or `control_buffer` while controlling a student.
  - Teacher drawer gains a "Broadcast my screen" toggle. While on,
    every student sees the teacher's live buffer in a read-only
    follow pane inside their drawer.
  - Per-row "Take control" / "Release control" on the teacher side.
    When control is granted, the targeted student's editor goes
    read-only; the teacher's keystrokes stream into the student's
    editor in real time. Release returns ownership; the student
    keeps the buffer state at release time.
  - Store grows a separate `controlBuffer` field so control updates
    don't clobber the broadcast stream. `control_change` resets it
    on each grant/release boundary.
