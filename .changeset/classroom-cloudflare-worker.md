- **Cloudflare Workers + Durable Objects deployment for the
  classroom relay**. New `@modern8086/classroom-server-worker` package
  hosts the same `Room` state machine as the Node target inside a
  single `ClassroomHubDO`. Two endpoints — `GET /healthz` and `GET
  /ws` (Upgrade: websocket). Wrangler config and a README walk
  through the deploy: `wrangler login` → `wrangler secret put
  M86_CLASSROOM_HMAC_SECRET` → `wrangler deploy`. Free tier
  handles thousands of concurrent rooms.
  Recommended pairing for static IDE deployments (GitHub Pages,
  Vercel static, Netlify, …) since none of those can host the Node
  sidecar themselves. The GH Pages deploy workflow now forwards a
  `VITE_CLASSROOM_WS_URL` repo variable into the build so the
  static IDE points at the Worker without code changes.
  Refactor: `clamp` + `sanitizeMeta` factored out of the Node entry
  into `@modern8086/classroom-server/protocol-helpers` so both
  adapters share input-validation. `classroom-server` grows
  subpath exports (`./room`, `./host-token`, `./wordlist`,
  `./protocol-helpers`) so the Worker can pull the shared logic
  cleanly. 35/35 Node server tests still green.
