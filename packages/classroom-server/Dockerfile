# Classroom-mode WebSocket relay. Tiny Node service; can be run
# alongside the web IDE container (see docker-compose.yml at the
# repo root) or on its own behind any reverse proxy.
#
# Local build:
#   docker build -t modern8086-classroom-server -f packages/classroom-server/Dockerfile .
#   docker run --rm -e M86_CLASSROOM_HMAC_SECRET=$(openssl rand -base64 32) \
#              -p 8787:8787 modern8086-classroom-server

# ---------- stage 1: build ----------
FROM node:20-alpine AS build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace + lockfile.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/web/package.json                packages/web/package.json
COPY packages/devices/ts/package.json         packages/devices/ts/package.json
COPY packages/classroom-protocol/package.json packages/classroom-protocol/package.json
COPY packages/classroom-server/package.json   packages/classroom-server/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

# Sources for the two packages we actually need.
COPY packages/classroom-protocol packages/classroom-protocol
COPY packages/classroom-server   packages/classroom-server

RUN pnpm --filter @modern8086/classroom-protocol build \
 && pnpm --filter @modern8086/classroom-server build \
 && pnpm --filter @modern8086/classroom-server prune --prod \
 && pnpm --filter @modern8086/classroom-protocol prune --prod

# ---------- stage 2: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# Pull in only what's needed at runtime: compiled JS + production
# node_modules. This keeps the image lean (~110 MB on alpine).
COPY --from=build /src/packages/classroom-protocol/package.json packages/classroom-protocol/package.json
COPY --from=build /src/packages/classroom-protocol/dist          packages/classroom-protocol/dist
COPY --from=build /src/packages/classroom-server/package.json    packages/classroom-server/package.json
COPY --from=build /src/packages/classroom-server/dist            packages/classroom-server/dist
COPY --from=build /src/node_modules                              node_modules
COPY --from=build /src/packages/classroom-server/node_modules    packages/classroom-server/node_modules

# Run unprivileged.
RUN addgroup -S app && adduser -S app -G app
USER app

ENV M86_CLASSROOM_PORT=8787 \
    M86_CLASSROOM_HOST=0.0.0.0
EXPOSE 8787

# Simple healthcheck against /healthz; the entry already serves it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${M86_CLASSROOM_PORT}/healthz" || exit 1

CMD ["node", "packages/classroom-server/dist/src/node.js"]
