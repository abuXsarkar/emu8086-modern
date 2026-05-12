# Classroom mode — design

> Status: design accepted, implementation pending. Branch
> `feat/classroom-mode` (not yet created) will track the work.

## Why this exists

The IDE today is single-user. A teacher running an in-person 8086 lab
hands students a share-link in chat and walks around looking at
screens. That works at small scale but doesn't scale up: a TA running
a 30-student lab can't see who's stuck, can't broadcast a fix without
typing it again, and has no record of who submitted what.

The M5 ROADMAP listed "classroom mode broadcast" and the README has
mentioned it since project bootstrap. This doc commits to a concrete
shape so the work doesn't drift open-ended.

The product target is **adoption by educators at South Asian
engineering institutes** running 8086 microprocessor labs. That
audience expects:

- A sign-in-free flow that survives shared lab Windows boxes.
- Roll numbers (the institutional student ID) treated as first-class.
- A formal-looking session header with course code, semester,
  institute name — labs are documented events, not chatrooms.
- Submission artifacts that drop into existing grading workflows
  (zip → folder → upload to LMS).

The design below is shaped by that audience.

---

## Decisions (locked)

| Decision | Value |
|---|---|
| Transport | WebSocket relay (not WebRTC P2P) |
| Hosting | Node + `ws` for self-host; **Cloudflare Worker + Durable Objects shipped** in `@modern8086/classroom-server-worker` for zero-cost hosted use |
| Identity | Room code + HMAC-signed host token; no accounts |
| Room code format | `color-animal-NN`, e.g. `blue-fox-42` |
| Live buffer share | Always-on for teacher view (no student-side toggle) |
| Take control | Teacher unilateral; student editor locks read-only with banner |
| Hand-raise | Either side can lower |
| Room lifetime | 30-min grace after teacher disconnect, then state is reaped |
| Submissions | Teacher downloads zip; no server-side persistence by default |
| Roll No | First-class, required, unique within room, doubles as the system ID |
| Course/section/institute metadata | Required `course` and `teacherName`; everything else optional |

---

## Architecture

### Transport

WebSocket relay. One connection per participant; all messages flow
through the server. WebRTC was considered and rejected: NAT traversal
fails on 5–10% of campus networks without a TURN server, mesh scaling
is O(N²), and the privacy benefit is fictional once a signaling
server exists anyway.

### Hosting targets

The room state machine is portable. It will be wrapped twice:

1. **`packages/classroom-server/src/node.ts`** — Node + the `ws`
   library. Drops into the existing M6 Docker image as a sidecar
   service on port 8787. This is what self-hosting institutes get.
2. **`packages/classroom-server-worker/`** — Cloudflare Workers +
   Durable Objects. A single `ClassroomHubDO` owns all rooms (same
   in-memory shape as the Node server); sharding by
   `idFromName(roomId)` is a v2 enhancement the `Room` class is
   already structured for. Free tier handles thousands of
   concurrent rooms. **Recommended pairing for GitHub Pages /
   Vercel-hosted IDEs** since neither host can run the Node
   sidecar themselves.

Both wrappers consume the same `Room` class from `room.ts`. The state
machine never imports a runtime-specific API.

### Identity

- Teacher creates room → server returns `{ roomId: "blue-fox-42",
  hostToken: "<base64url HMAC-SHA256>" }`.
- Teacher's URL: `?room=blue-fox-42&host=<token>`. Student URL:
  `?room=blue-fox-42`.
- Privileged actions (broadcast, take control, kick, close room)
  require the teacher's connection to have presented the host token
  on join. The token is verified server-side via HMAC of
  `roomId + creationTime` against a per-server secret. Tokens are
  bound to a single room — they can't be reused for another room.
- Display names are self-chosen and stored in localStorage so a
  reconnect doesn't re-prompt.
- The trust model is: knowing the room code is sufficient to enter
  the class. Same level of trust as a Zoom link. Documented to
  teachers up front.

### Room metadata

Settable by the teacher at room-creation time. Visible to all
participants in the classroom header banner.

```ts
interface RoomMeta {
  course: string;          // required: "Microprocessors and Interfacing"
  courseCode?: string;     // "EEE304"
  section?: string;        // "A", "B"
  semester?: string;       // "Spring 2026"
  institute?: string;      // "BUET", "IIT Bombay"
  department?: string;     // "EEE", "CSE"
  teacherName: string;     // required: "Dr. R. K. Sharma"
  teacherTitle?: string;   // "Professor", "Lecturer"
  sessionTitle?: string;   // "Lab 3: Interrupt-driven I/O"
  date: string;            // ISO date; auto-fills today, editable
  logoUrl?: string;        // optional, fetched client-side only
}
```

**Course templates** are saved under
`localStorage["emu8086.classroom-templates"]` as a `RoomMeta[]`
(without the date field). Next session, the teacher picks from a
dropdown to skip retyping. This is the single most important
ergonomic detail for a teacher who runs the same lab weekly.

### State

Room state lives in process memory (Node) or a Durable Object
(Cloudflare). Nothing is persisted to disk by default.

```ts
interface RoomState {
  id: string;                       // "blue-fox-42"
  meta: RoomMeta;
  createdAt: number;                // epoch ms
  teacherConnected: boolean;
  teacherDisconnectedAt: number | null;  // null while teacher is online
  controlGrantedTo: string | null;  // rollNo of the student under teacher control
  broadcasting: boolean;
  broadcastBuffer: string;          // current teacher buffer when broadcasting
  prompt: string;                   // assignment description shown to all
  students: Map<string, StudentState>;  // keyed by rollNo
  submissions: Submission[];        // accumulated; flushed when teacher downloads
}

interface StudentState {
  rollNo: string;
  displayName: string;
  joinedAt: number;
  online: boolean;
  handUp: boolean;
  buffer: string;                   // last seen full snapshot
  bufferUpdatedAt: number;
}

interface Submission {
  rollNo: string;
  displayName: string;
  source: string;
  at: number;
}
```

**Reaping rule**: when the teacher disconnects, `teacherDisconnectedAt`
is set; a 30-minute timer is armed. If the teacher reconnects (same
host token), the timer is cleared. If the timer fires, the room is
deleted and any still-connected students get a `room_closed` message.

### Roll number specifics

- **Required** at student join time. Empty roll no = rejected.
- **Format**: free-text up to 32 chars. Institutes use wildly
  different schemes (`CSE-22-001`, `1934`, `B22EE040`, `2021-EE-040`)
  — don't enforce a pattern.
- **Unique within a room**. Server rejects a join with a duplicate
  roll no with `error.code = "roll_no_taken"`.
- **Two tabs same roll no**: second connection wins; the first gets a
  `replaced_elsewhere` disconnect. This stops accidental forks.
- **Used as the student ID** in protocol messages, roster keys, and
  submission filenames.
- **Submission filename pattern**:
  `<courseCode>_<date>_<sessionTitle>/<rollNo>__<displayName>__<epochMs>.asm`,
  e.g. `EEE304_2026-05-10_Lab3/CSE-22-001__Aisha_Khan__1715342400000.asm`.
  The folder name comes from RoomMeta; the filename is roll-no-first
  for alphabetical sorting.

### Take control

- Teacher clicks "Take control of <rollNo>" → server sets
  `controlGrantedTo = rollNo`, broadcasts `control_grant` to the
  controlled student and `control_change` to all participants.
- The student's editor goes read-only with a banner:
  `"<teacherName> is editing your file"`.
- Teacher's edits stream as `control_buffer` from teacher → server →
  controlled student, who replaces their buffer state on each frame.
- Teacher clicks "Release" → `control_release`. The buffer state at
  release time is what the student keeps.
- If the teacher disconnects while holding control, control is
  released immediately (not at the 30-min boundary). A controlled
  student waiting on a disconnected teacher is the worst possible
  failure mode.
- No student panic button. The trust model is teacher-as-authority.
  Documented up front so it's not surprising.

### Hand-raise

- `{ t: "set_hand", rollNo, up }` — student sends with their own
  rollNo; teacher can send with any rollNo. Either lowers or raises.
- Server rebroadcasts `hand_changed` to all participants.
- Teacher's drawer shows a hand-up count badge and surfaces hand-up
  students at the top of the roster.

---

## Protocol

Messages are JSON over WebSocket. Tagged unions; the discriminator is
`t`. Shared between client and server via
`packages/classroom-protocol`.

### Client → server

```ts
type ClientMsg =
  | { t: "create";    meta: RoomMeta; teacherDisplayName: string }
  | { t: "join";      roomId: string; rollNo: string;
                      displayName: string; hostToken?: string }
  | { t: "leave" }
  | { t: "set_hand";  rollNo: string; up: boolean }
  | { t: "buffer_update"; source: string }
  | { t: "submit";    source: string }
  | { t: "set_broadcast"; on: boolean; source?: string }
  | { t: "broadcast_update"; source: string }
  | { t: "take_control"; rollNo: string }
  | { t: "release_control" }
  | { t: "control_buffer"; source: string }
  | { t: "set_prompt"; prompt: string }
  | { t: "kick";      rollNo: string }
  | { t: "close_room" };
```

### Server → client

```ts
type ServerMsg =
  | { t: "created";   roomId: string; hostToken: string;
                      meta: RoomMeta; createdAt: number }
  | { t: "joined";    roomState: RoomStatePublic; you: string }
  | { t: "roster_changed"; students: StudentPublic[] }
  | { t: "hand_changed"; rollNo: string; up: boolean }
  | { t: "buffer_update"; rollNo: string; source: string }
  | { t: "submission_received"; submission: Submission }
  | { t: "broadcast_state"; on: boolean; source: string | null }
  | { t: "broadcast_update"; source: string }
  | { t: "control_change"; rollNo: string | null }
  | { t: "control_buffer"; source: string }
  | { t: "prompt_changed"; prompt: string }
  | { t: "kicked";    reason: string }
  | { t: "replaced_elsewhere" }
  | { t: "room_closed"; reason: "teacher_closed" | "reaped" | "error" }
  | { t: "error";     code: string; message: string };
```

### Buffer-update cadence

Full snapshot, debounced 250 ms client-side. A 30-student class
sending at 4 Hz worst case = 120 messages/sec, each a few KB —
trivial for both runtimes. CRDT was considered and deferred: the
complexity-to-benefit ratio is wrong for a 50-min class.

### Backpressure

If the server's send queue for a connection exceeds 64 messages, the
oldest non-essential messages (`buffer_update`, `control_buffer`) are
dropped. Essential messages (`hand_changed`, `submission_received`,
`control_change`, `room_closed`) are never dropped. Connection is
closed with `1011` if the queue exceeds 256.

### Reconnect

Client retries with exponential backoff (1s, 2s, 4s, 8s, capped at
16s) for up to 30 minutes. On reconnect, the client resends `join`
with the same rollNo + hostToken; the server treats this as resuming
the existing student/teacher slot (`replaced_elsewhere` is sent only
to *other* sessions claiming the same identity).

---

## UX

### Topbar entry point

A "Classroom" pill is added to the header next to the language and
theme pickers. Inactive state shows the pill faintly; active state
shows the room code + a small live count.

### Teacher flow

1. Click "Classroom" pill → modal with two tabs: **Start a
   classroom** | **Join an existing one** (the latter is for the
   uncommon case where a teacher is joining someone else's session as
   a student).
2. **Start** tab: form for `RoomMeta`. A "Templates" dropdown at the
   top lists saved templates. After filling: "Save as template?"
   checkbox + "Start session" button.
3. Server returns the room code. The classroom drawer slides in from
   the right with:
   - **Banner**: `[Logo] EEE304 · Sec A · Lab 3 · Dr. R. K. Sharma · 2026-05-10 · Code: blue-fox-42`
   - **Tabs**: Roster · Submissions · Prompt
   - **Roster**: each student row → `[hand-up icon] CSE-22-001  Aisha Khan  [view] [control] [lower hand] [kick]`. Hand-up students float to the top.
   - **Broadcast toggle**: when on, students see a "Following teacher" badge.
   - **Prompt**: textarea; saves on blur; sent as `set_prompt`.
   - **Submissions**: list of received submissions sorted by rollNo, with a "Download all (.zip)" button.
   - **Close room** button at the bottom.

### Student flow

1. Direct link `?room=blue-fox-42` → modal: "Join EEE304 Lab 3" with fields:
   - Roll No (required)
   - Display Name (required, persisted in localStorage)
2. Connected. The classroom drawer shows:
   - Banner (same as teacher's)
   - **Hand button**: large, latches up/down
   - **Submit button**: prompts "Send your current code to the teacher?"
   - **Prompt** read-only
   - **Following teacher** read-only pane when the teacher is broadcasting
   - **You are being edited by the teacher** banner (red, prominent) when control is granted. Editor disabled.

### Always-on visibility — the "we're watching" banner

At first join, every student sees a one-time modal:

> Your teacher (`<teacherName>`) can see your editor in real time and
> may take control to demonstrate. Your roll number `<rollNo>` is
> visible to other participants.

Confirmed once per browser per `(rollNo, roomId)` pair. Stored in
localStorage so frequent rejoins don't pester. This isn't legalese —
it's a simple, honest notice that prevents surprise. Educators
asking *"is it OK that we monitor screens?"* can point at this.

### Session report (post-MVP)

On "Close room", a one-click button generates a print-friendly A4
page:

- Course header (university, course, section, teacher, date)
- Attendee table (rollNo, name, joined-at, hand-up count,
  submission-at-or-empty)
- Total attendance count

CSS is `@media print` only; renders inline in a new tab so the
teacher can `Ctrl+P` to PDF. CSV export of the same table sits next
to it for LMS imports.

---

## Privacy & safety

- **No accounts, no email collection.** Display names and roll
  numbers are self-asserted.
- **No network traffic outside the room.** The server logs only
  `room_open`, `room_close`, peak student count, and structured error
  events. It does not log buffer contents or submissions.
- **Submissions are not persisted** by default. They live in the
  teacher's browser memory until they download the zip; the server
  forgets them when the room is reaped.
- **Self-host mode** runs entirely on the campus network. No outbound
  traffic, no telemetry. The Docker image documents this.
- **Always-on teacher view** is consented to via the join-time modal.
  Educators using this for proctoring should still announce it
  verbally — this is policy, not implementation.
- **Take control** is documented as a teacher prerogative. The trust
  model assumes good faith, mirroring how a teacher might walk over
  to a student's machine and type into it. Not a security boundary.

---

## File layout

```
packages/
  classroom-protocol/             NEW — shared types, no runtime deps
    src/
      index.ts                    # ClientMsg / ServerMsg / RoomMeta etc.
      version.ts                  # PROTOCOL_VERSION constant
    package.json
  classroom-server/               NEW
    src/
      room.ts                     # Room state machine — runtime-agnostic
      host-token.ts               # HMAC sign/verify
      wordlist.ts                 # color/animal lists for room codes
      protocol-helpers.ts         # clamp + sanitizeMeta, shared with worker
      node.ts                     # Node + ws entry
  classroom-server-worker/        NEW
    src/
      worker.ts                   # Cloudflare Workers fetch entry
      do.ts                       # ClassroomHubDO (Durable Object)
    wrangler.toml
    Dockerfile
    package.json
  web/
    src/classroom/
      ClassroomPanel.tsx          # The drawer / sidebar root
      StartDialog.tsx             # Teacher's "Start a classroom" form
      JoinDialog.tsx              # Student's join form
      TeacherDrawer.tsx           # Roster / Submissions / Prompt tabs
      StudentDrawer.tsx           # Hand / Submit / Prompt
      RosterRow.tsx               # One student row with all teacher actions
      BroadcastPane.tsx           # Read-only mirror for students
      ControlBanner.tsx           # The "teacher is editing" banner
      ConsentModal.tsx            # First-join "we can see you" modal
      Banner.tsx                  # The course/section/teacher header strip
      SessionReport.tsx           # Print-friendly summary (post-MVP)
      protocol.ts                 # re-exports from classroom-protocol
      useRoom.ts                  # WS client hook; reconnect + state mgmt
      submissions-zip.ts          # JSZip-based zipper; no server roundtrip
```

---

## Phasing

| Phase | Scope | Days |
|---|---|---|
| **P1 — server core + protocol** | `classroom-protocol`, `classroom-server` (Node), Room state machine, host token, room-code generator, basic create/join/leave roundtrips, integration tests | 3 |
| **P2 — client core** | `useRoom` hook, ClassroomPanel scaffold, StartDialog/JoinDialog, ConsentModal, Banner, basic teacher roster + student status drawers | 3 |
| **P3 — interactions** | Hand-raise, submit (zip download), prompt editing, broadcast on/off, follow-pane on student | 3 |
| **P4 — take control** | Server enforces `controlGrantedTo`; student editor locks read-only; teacher's edits stream; release path; teacher-disconnect-while-holding | 2 |
| **P5 — robustness** | Reconnect with exponential backoff, replaced-elsewhere handling, server backpressure, error toasts on the client, kick flow | 3 |
| **P6 — Docker integration** | Self-host server runs on port 8787 alongside the existing IDE; healthcheck endpoint; environment variables for HMAC secret | 1 |
| **P7 — Cloudflare Worker** | ✅ shipped. Single-DO Hub; same protocol; same Room state machine; `wrangler deploy` to go live | — |
| **P8 — Session report + CSV** | Print-friendly summary; CSV export; templates UX polish | 2 |

Total **P1–P6**: ~15 days. P7 and P8 are follow-up PRs.

Each phase is one PR. Phase 1 ships behind a feature flag; the
"Classroom" pill is hidden until Phase 2 is ready.

---

## Testing plan

### Server

- Unit tests for `Room` state transitions (join, duplicate-rollNo
  rejection, leave, hand-raise, submit, broadcast, take-control,
  release, teacher-disconnect-grace, teacher-disconnect-while-holding,
  reaping).
- Integration tests with a real WebSocket client driving create →
  join → exchange messages → close.
- Property test: room invariant `controlGrantedTo === null ||
  students.has(controlGrantedTo)` holds across any sequence of
  messages.

### Client

- Component tests for StartDialog (template save/restore), JoinDialog
  (validation), RosterRow (action routing), ConsentModal (one-shot
  per pair).
- E2E test (Playwright) with two browsers driving teacher + student
  through the full happy path on a localhost server. Asserts:
  submission appears in teacher's drawer, hand-raise lights up,
  control banner appears and editor goes read-only.

### Manual smoke

The full happy-path checklist plus:

- 30 fake students join via a script; teacher's drawer renders
  smoothly.
- Student loses network for 5s mid-session; client reconnects without
  losing roster state.
- Teacher closes tab while broadcasting; control auto-released;
  students show "teacher disconnected" banner; teacher rejoins within
  30 min and resumes seamlessly.

---

## Implementation decisions

These were left open in an earlier design pass and have since been
resolved.

### 1. HMAC secret rotation — primary + previous overlap

Two environment variables on the server:

```
M86_CLASSROOM_HMAC_SECRET           # required; new tokens signed with this
M86_CLASSROOM_HMAC_SECRET_PREVIOUS  # optional; verify-only
```

- **Sign** new tokens with `_HMAC_SECRET`.
- **Verify** by trying `_HMAC_SECRET` first, then `_HMAC_SECRET_PREVIOUS`
  if present. Either match is accepted.
- **To rotate**: copy the current secret into `_PREVIOUS`, set a fresh
  value in `_HMAC_SECRET`, restart. Live rooms keep working because
  their tokens still verify against `_PREVIOUS`. Drop `_PREVIOUS` after
  one full session window (the next morning is fine for a daily
  rotation cadence, weekly is normal in practice).
- **No secret configured**: server generates a random one at startup
  and logs a one-line warning. Restarting the server invalidates all
  live tokens — fine for self-hosters who rarely restart mid-class,
  and the warning makes the implication visible.
- **Helper**: `pnpm --filter @modern8086/classroom-server gen-secret` prints
  a fresh 32-byte base64url value the operator can paste into their
  env. One command, hard to misuse.

This is the standard JWT-with-rotation pattern, scaled down. No DB,
no clock-skew handling beyond the usual minute-level tolerance.

### 2. Logo URL — client-fetched

The teacher's `logoUrl` is loaded by each participant's browser
directly via an `<img src>`. The server only stores and rebroadcasts
the URL string. No proxy.

**Trade-off documented in the teacher-facing UI**: a small caption
under the logo URL field reads *"loaded by every participant from the
URL above; their IPs will be visible to that host. Use a logo on the
same domain as the IDE, or a CDN your institute already uses."*

Self-hosting institutes can sidestep the IP-exposure entirely by
hosting the logo on the same Docker image's static asset path —
that's where `logoUrl: "/logos/buet.png"` lands and nothing leaves
the campus network.

### 3. Submission and message size cap — 1 MB

A single WebSocket frame is rejected by the server with
`error.code = "too_large"` if it exceeds **1 MB**. This applies
uniformly to all message types — `submit`, `buffer_update`,
`control_buffer`, `broadcast_update`. A typical `.asm` lab is
well under 32 KB, so 1 MB leaves headroom for unusual cases (long
data segments, multi-file inlined assemblies) without inviting abuse.

The client validates the same cap before sending so a student who
pastes a giant blob gets an immediate inline toast instead of a
silent disconnect.

### 4. Concurrent submissions — accumulate

If a student hits Submit more than once during a session, every
submission is kept. The teacher's submissions tab lists them all,
sorted by rollNo and then by timestamp. The zip preserves all
versions:

```
EEE304_2026-05-10_Lab3/
  CSE-22-001__Aisha_Khan__1715342400000.asm
  CSE-22-001__Aisha_Khan__1715342730000.asm   # second submit
  CSE-22-002__Bilal_Ahmed__1715342901000.asm
  ...
```

This gives teachers an audit trail (did the student submit broken
work then a fix? did they try to game the system after seeing a
classmate's hint?) without forcing any judgement at submit time.

If a teacher prefers a "latest wins" view, the in-app submissions
tab will offer a toggle — but the zip always carries the full
history.

### 5. i18n for the classroom UI — Partial locales with English fallback

All non-English locales become `Partial<Strings>` at the type level;
`useStrings()` merges the active locale on top of English at runtime.
Adding a new key to `Strings` requires translating to English only;
the other twelve locales fall through to the English value
automatically until someone fills them in. No runtime crash, no
build break, no "string key not found" placeholder.

```ts
// types.ts
export interface Locale {
  id: LocaleId;
  name: string;
  strings: Partial<Strings>;   // was: Strings
}

// index.ts
export function useStrings(): Strings {
  const locale = useActiveLocale();
  // English is the source of truth and is always complete; merging
  // keeps the return type honest even when the active locale is sparse.
  return { ...en.strings, ...locale.strings };
}
```

The `en` locale is constrained to the full `Strings` shape via a
narrower local type:

```ts
// en.ts
import type { Strings } from "./types";
export const en: { id: "en"; name: string; strings: Strings } = { ... };
```

This is the standard pattern of every mature i18n library
(`i18next`, FormatJS). The contributor flow becomes:

1. Add the key to `Strings` in `types.ts`.
2. Add the English value to `en.ts`.
3. Optionally translate to any other locale; missing ones fall
   through to English automatically.

The migration to land in P2: change one type, change one helper,
the existing 12 non-English files stay valid because they currently
*are* complete and `Partial<Strings>` accepts the complete shape.

---

## Out of scope (call out, don't silently skip)

- LTI 1.3 launch (institutional LMS embed). M7-territory; major spec.
- Persistent assignment storage. Adds a database; defers the "no
  state on the server" promise. If wanted, a follow-up using SQLite +
  a "persist submissions for 24h" flag.
- Recording sessions for replay. Out of scope; raises serious
  consent and storage questions.
- Voice/video. Use the institute's existing tool (Zoom, Meet);
  classroom mode is a code-collaboration overlay, not a meeting
  client.
- Plagiarism detection across submissions. Worth doing; not v0.
