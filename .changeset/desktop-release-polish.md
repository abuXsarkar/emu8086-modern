- **Desktop release polish**. Tauri shell grows the loose ends a
  release-quality desktop app expects:
  - Window state persistence via `tauri-plugin-window-state`. Size,
    position, and maximised state survive a quit/relaunch.
  - Native application menu — File / Edit / View / Help with the
    platform's predefined items so Cmd+Q vs Ctrl+Q, the standard
    cut/copy/paste shortcuts, fullscreen, and About all map to the
    OS-native expectations without bespoke wiring. The Help menu
    links out to README, the issues page, and the repo via
    `tauri-plugin-shell`. In dev builds only, the View menu also
    gets a Toggle Developer Tools entry; the menu item and the
    event handler are paired behind the same `#[cfg]` so a release
    build never shows a dead command.
  - Auto-update plugin compiled in (`tauri-plugin-updater`) with
    the endpoint pointed at the GitHub Releases `latest.json`.
    `plugins.updater.active` and `bundle.createUpdaterArtifacts`
    are both `false` today; flip them together with a signing key
    to enable. The plugin is wired now so 1.0 doesn't need a
    code-touch later.
  - Bundle metadata filled out: long description, copyright, MIT
    licence flag, publisher, homepage, macOS minimum-system-version,
    Linux DEB deps.
  - Capability set (`capabilities/default.json`) — minimal: open
    external URLs in the project's allow-list (GitHub repo,
    workers.dev classroom URLs, future `modern8086.com` domain) plus
    the updater. No filesystem, no shell.execute.
  - CI's release workflow learns to build the desktop bundles on
    every `v*.*.*` tag (Linux DEB+AppImage, macOS universal DMG +
    .app, Windows MSI + NSIS) via `tauri-action`. Apple Developer
    ID + Authenticode secrets are referenced by their canonical
    names so wiring them is a repo-secrets change, not a workflow
    change. Bundles attach to the matching GitHub Release alongside
    the existing CLI binaries, all checksummed.
