# @modern8086/desktop

Tauri 2 desktop shell that hosts the web IDE in a native window on
Linux, macOS, and Windows. The frontend is the same React + Vite app
served by `@modern8086/web`; the Tauri layer only handles window
chrome, the platform-native webview, and (eventually) deep-link /
file-system integration.

## Quickstart

The first command is a one-time install of the platform-specific
webview + build deps. Everything else is daily flow.

```bash
# Linux (Debian / Ubuntu) — webkit2gtk + GTK + dbus headers:
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl \
  wget file libxdo-dev libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev libdbus-1-dev pkg-config

# macOS — Xcode CLT is the only requirement.
xcode-select --install

# Windows — install "Desktop development with C++" via the Visual
# Studio Build Tools, plus the WebView2 runtime (typically already
# present on Windows 11).

# Then, from the repo root:
pnpm install
pnpm desktop:dev        # dev build with HMR (Vite + Tauri together)
pnpm desktop:bundle     # release bundle (DEB, AppImage, DMG, MSI…)
```

The `bundle` script is deliberately named so `pnpm -r build` skips
this package — the wide recursive build that CI runs on every push
should not trigger an hour-long native compile.

`tauri dev` boots Vite (`pnpm --filter @modern8086/web dev`) before
opening the window, so the HMR experience matches the browser dev
loop. `tauri build` runs `pnpm --filter @modern8086/web build` first
and ships the static bundle inside the native binary.

## Bundle artifacts

After `pnpm desktop:bundle`:

| Platform | Output |
|---|---|
| Linux | `target/release/bundle/deb/*.deb` and `appimage/*.AppImage` |
| macOS | `target/release/bundle/dmg/*.dmg` and `macos/*.app` |
| Windows | `target/release/bundle/msi/*.msi` and `nsis/*.exe` |

CI builds all of these automatically on every `v*.*.*` tag push —
see `.github/workflows/release.yml`. Locally you only need to run
the bundle script when iterating on packaging or testing a release.

## Polish that's already wired

- **Window state persistence.** Size, position, and maximised state
  survive a quit/relaunch via `tauri-plugin-window-state`.
- **Native application menu.** File / Edit / View / Help with
  platform-native predefined items (Cmd+Q vs Ctrl+Q etc.); the View
  menu exposes Reload and (in dev builds only) Toggle Developer
  Tools; Help links to the README, the issues page, and About.
- **Auto-update plugin compiled in.** Endpoint configured at
  `releases/latest/download/latest.json`; `plugins.updater.active`
  is currently `false` and `bundle.createUpdaterArtifacts` is also
  `false`, so the runtime check is a no-op until both flags are
  flipped together with a signing key. See "Signing" below.

## Signing

Code-signing keys (Apple Developer ID, Authenticode certificate)
are not yet wired. The release workflow already references the
expected secret names; when these land in repo secrets the next
tag picks them up automatically without a workflow change:

- `APPLE_CERTIFICATE_P12`, `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_DEVELOPER_ID`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `WINDOWS_SIGN_CERT_P12`, `WINDOWS_SIGN_CERT_PASSWORD`

Without these, bundles install but trip the OS "untrusted
developer" gate. The auto-updater should stay disabled until both
sets are in place — pushing unsigned updates to users is a worse
outcome than no updates at all.

## Icons

`icons/` currently ships placeholder solid-colour ink-blue blocks
generated deterministically from `tools/gen-desktop-icons.py`.
They satisfy the bundler today; replace with the designed icon set
before any public release. The script's output is reproducible so
a designer can drop a single 1024×1024 source PNG into the script
later and re-emit all formats.
