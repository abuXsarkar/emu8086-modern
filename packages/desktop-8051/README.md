# modern8051-desktop

Native desktop shell (Tauri 2) hosting the modern8051 web IDE.

Sibling to `modern8086-desktop` and `modern8085-desktop`. Same Wry
webview, same plugin stack, same menu shape — pointed at
`frontendDist: ../web/dist/8051` so the bundled app opens the 8051
IDE directly.

## Build

```bash
# from the repo root, with the web app + 8051 wasm already built:
pnpm --filter @modern8086/web build
cd packages/desktop-8051
pnpm bundle              # → ../../target/release/bundle/...
```

## Why a separate shell vs. a single Tauri with two windows

Same rationale as `modern8085-desktop`: separate identifier, separate
updater channel, separate bundle id → cleaner UX, no
cross-release-fighting. Each ISA family gets its own desktop product.

## Release

`m51-v*.*.*` tags fire `.github/workflows/release-8051.yml`, which
builds the CLI + the Tauri desktop bundles in parallel and attaches
them to the GitHub Release.
