# @emu8086/classroom-server-worker

Cloudflare Workers + Durable Objects deployment of the
classroom-mode WebSocket relay. Same Room state machine as the
Node target at `@emu8086/classroom-server`; different I/O glue.

This is the **free-forever, zero-server-management** path. Pair
it with GitHub Pages for the static IDE and the whole stack
costs nothing on the Cloudflare free tier (covers thousands of
concurrent rooms).

## What it is

A single Worker exposes two endpoints:

| Method | Path | What it does |
|---|---|---|
| `GET` | `/healthz` | Liveness probe — returns `ok\n` |
| `GET` | `/ws` (Upgrade: websocket) | WebSocket entry — forwarded to the Hub Durable Object |

All classroom state lives inside a single `ClassroomHubDO`
Durable Object instance. Same shape as the Node server's
in-process Map of rooms; just hosted by Cloudflare instead of
your own machine. A periodic alarm reaps rooms whose teacher
has been offline past the 30-minute grace window.

## Prerequisites

- A Cloudflare account (free).
- `wrangler` CLI (installed automatically as a workspace devDep).
- `pnpm install` once at the repo root.

## Deploy

```bash
# One-time setup
pnpm --filter @emu8086/classroom-server-worker exec wrangler login

# Mint and store the HMAC secret used to sign host tokens.
# (See SEMVER.md / docs/classroom-mode.md §"HMAC secret rotation"
# for what this is.)
openssl rand -base64 32 \
  | pnpm --filter @emu8086/classroom-server-worker exec wrangler secret put EMU8086_CLASSROOM_HMAC_SECRET

# Deploy. The worker name defaults to `emu8086-classroom`, so the
# resulting URL is roughly:
#   https://emu8086-classroom.<your-name>.workers.dev
pnpm --filter @emu8086/classroom-server-worker cf-deploy
```

> **Note** — the script is named `cf-deploy` (not `deploy`) on
> purpose: pnpm has a built-in `pnpm deploy` subcommand for
> packaging workspace projects, and `pnpm --filter X deploy` is
> interpreted as that built-in, not an npm script. Same reason
> the dev / tail / secret-put helpers are `cf-dev`, `cf-tail`,
> `cf-secret`.

## Wire the IDE to it

Rebuild the IDE with the Worker URL baked in (Vite reads this at
build time):

```bash
VITE_CLASSROOM_WS_URL=wss://emu8086-classroom.<your-name>.workers.dev/ws \
  pnpm --filter @emu8086/web build
```

GitHub Pages auto-deploy: set `VITE_CLASSROOM_WS_URL` as a repo
**variable** (Settings → Secrets and variables → Actions →
Variables) named `VITE_CLASSROOM_WS_URL`. The deploy workflow
already forwards `vars.*` into the build environment.

## Local development

```bash
# Run the Worker against Cloudflare's local Miniflare runtime.
pnpm --filter @emu8086/classroom-server-worker cf-dev
```

Then point the IDE at `ws://localhost:8787/ws` via
`VITE_CLASSROOM_WS_URL=ws://localhost:8787/ws pnpm --filter @emu8086/web dev`.

The Worker `cf-dev` command listens on port 8787 by default —
same port the Node server uses — so the IDE's dev-mode default works
unchanged. Switch between Node and Worker locally just by
swapping which one you have running.

## Rotation

To rotate the HMAC secret without invalidating live host tokens:

```bash
# Move the active secret into the "previous" slot…
pnpm --filter @emu8086/classroom-server-worker exec wrangler secret put EMU8086_CLASSROOM_HMAC_SECRET_PREVIOUS
# (paste the current secret when prompted)

# …then put a fresh value into the primary.
openssl rand -base64 32 \
  | pnpm --filter @emu8086/classroom-server-worker exec wrangler secret put EMU8086_CLASSROOM_HMAC_SECRET
```

Drop `_PREVIOUS` again after one full session window (usually
the next morning).

## Free plan and SQLite-backed Durable Objects

This worker's `wrangler.toml` uses `new_sqlite_classes` instead of
the legacy `new_classes` migration. That's required on Workers
**Free** — Cloudflare gates the in-memory-only DO backend behind a
paid plan now, and a deploy with the older migration form fails
with `code: 10097 — must create a namespace using a new_sqlite_classes
migration`. SQLite-backed DOs are the recommended default for new
code anyway: same `DurableObjectState` API, plus the option of
real SQL queries against the per-DO storage if a future feature
ever wants that. No code change required when you switch the
migration; the existing `state.storage.put/get/setAlarm/...` calls
work identically.

## Limits and trade-offs

- **Single DO for all rooms.** Cloudflare DOs comfortably handle
  tens of thousands of concurrent connections; the cap is the
  per-DO compute time, which our protocol's per-message work
  rounds to negligible. If you ever need horizontal scale (say,
  a multi-region institute serving 10k+ concurrent rooms), shard
  by `idFromName(roomId)` — the `Room` class is already
  runtime-agnostic, only `worker.ts` routing changes.
- **No disk persistence.** Submissions live in memory until the
  teacher downloads the zip, exactly like the Node server. CF
  DOs *have* persistent storage (`state.storage`) — wiring
  submissions through it is a v2 enhancement.
- **Cold start.** The first connection after an idle period
  spins up the DO; subsequent ones reuse it. Idle eviction
  happens after several minutes of inactivity — well below a
  typical 50-minute lab session.
- **Observability.** `wrangler tail` streams logs in real time.
  `observability.enabled = true` in `wrangler.toml` ships
  metrics to the Cloudflare dashboard.

## When to prefer the Node target

- You want disk-persisted submissions out of the box.
- You have an existing self-host story (Docker on campus).
- You need to run inside a network that can't reach
  `*.workers.dev`.

The Node and Worker targets share the Room state machine, the
protocol, the host-token semantics, and the room-code wordlist.
Migrating between them is a redeploy + a `VITE_CLASSROOM_WS_URL`
change; no IDE code touched.
