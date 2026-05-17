# modern8085-desktop

Native desktop shell (Tauri 2) hosting the modern8085 web IDE.

Sibling to `modern8086-desktop`. Same Wry webview, same plugin stack, same menu shape — pointed at `frontendDist: ../web/dist/8085` so the bundled app opens the 8085 IDE directly.

## Build

```bash
# from the repo root, with the web app + 8085 wasm already built:
pnpm --filter @modern8086/web build
cd packages/desktop-8085
pnpm bundle              # → ../../target/release/bundle/...
```

## Why a separate shell vs. a single Tauri with two windows

Plan + rationale documented in [`docs/plans/8085-desktop.md`](../../docs/plans/8085-desktop.md). TL;DR: separate identifier, separate updater channel, separate bundle id → cleaner UX, no cross-release-fighting.

## Release

`m85-v*.*.*` tags fire `.github/workflows/release-8085.yml`. To extend it to build the Tauri desktop bundles, mirror the `desktop:` job from `release.yml` and point its working-directory at `packages/desktop-8085`. Not enabled by default yet — only the CLI builds on tag today.
