- **Classroom worker: `Buffer is not defined` on `create`**. The
  `signHostToken` path in `host-token.ts` relied on `Buffer` as a
  global. That works under Node and would have worked on Cloudflare
  Workers with a `compatibility_date` of 2024-09-23 or later, but
  our config pins 2024-09-01 — pre-dating the change that exposes
  `node:buffer` globals. The sibling `protocol-helpers.ts` already
  imported it explicitly; `host-token.ts` did not. Add the explicit
  `import { Buffer } from "node:buffer"` so the same source compiles
  cleanly under both runtimes regardless of the compat date.
  Manifests as the IDE getting `error: handler threw` immediately
  after sending `create` to the Cloudflare-hosted classroom server.
