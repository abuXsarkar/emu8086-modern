- **Classroom mode P1: server core + protocol**. Two new packages
  land the foundation for the in-class collaboration feature
  designed in `docs/classroom-mode.md`:
  `@emu8086/classroom-protocol` carries the shared TypeScript
  types for the WebSocket wire format (ClientMsg / ServerMsg
  unions, RoomMeta, error codes, hard-byte caps), and
  `@emu8086/classroom-server` provides a Node + `ws` runtime that
  hosts rooms keyed by `color-animal-NN` codes (e.g. `blue-fox-42`).
  The room state machine (`Room`) is runtime-agnostic so a
  Cloudflare Worker target can ship later without touching the
  business logic; HMAC host tokens with primary + previous secret
  rotation match the design's "easy and reliable" rotation
  posture; submissions accumulate per the design. 31 tests cover
  the wordlist, host-token rotation, every Room state transition,
  and an end-to-end integration over a real WebSocket. No web
  client wiring yet — that's P2.
