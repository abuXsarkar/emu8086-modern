# Multi-stage build for the emu8086-modern web IDE.
#
# Stage 1 (rust): assembles the wasm-api package via wasm-pack, producing
#                 packages/wasm-api/pkg/.
# Stage 2 (node): runs pnpm install + builds the React+Vite app, which
#                 imports the wasm package from stage 1.
# Stage 3 (web):  ships only packages/web/dist/ behind nginx.
#
# Local build:
#   docker build -t emu8086-modern .
#   docker run --rm -p 8080:80 emu8086-modern
# then open http://localhost:8080
#
# Image size lands around 25-30 MB (nginx:alpine base + the bundle +
# the ~170 KB wasm payload).

# ---------- stage 1: wasm ----------
# Use the latest stable rust slim; the workspace's rust-toolchain.toml
# pins the channel and pulls the wasm32 target on first build.
FROM rust:slim AS wasm
WORKDIR /src

RUN apt-get update \
 && apt-get install -y --no-install-recommends pkg-config curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && cargo install wasm-pack --locked --version 0.13.1

# Bring in the workspace's rust source. We copy the whole packages tree
# (less than a megabyte) — partial copies were saving little once
# wasm-pack started fetching dependencies anyway.
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY packages/core         packages/core
COPY packages/assembler    packages/assembler
COPY packages/wasm-api     packages/wasm-api
COPY packages/cli          packages/cli
COPY packages/devices/rust packages/devices/rust

RUN wasm-pack build packages/wasm-api --target web --out-dir pkg --release

# ---------- stage 2: web bundle ----------
FROM node:20-alpine AS web
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace + lockfile.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/web/package.json        packages/web/package.json
COPY packages/devices/ts/package.json packages/devices/ts/package.json
RUN pnpm install --frozen-lockfile

# Bring in the built wasm package and the web source.
COPY --from=wasm /src/packages/wasm-api/pkg packages/wasm-api/pkg
COPY packages/web        packages/web
COPY packages/devices/ts packages/devices/ts

RUN pnpm --filter @emu8086/web build

# ---------- stage 3: serve ----------
FROM nginx:1.27-alpine AS serve
COPY --from=web /src/packages/web/dist /usr/share/nginx/html
EXPOSE 80
