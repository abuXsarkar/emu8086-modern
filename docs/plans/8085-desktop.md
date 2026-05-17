# /8085/ desktop packaging — plan

A plan for shipping the 8085 IDE as a standalone desktop app, in parallel with the existing modern8086 desktop (Tauri 2 + Wry). **Not implemented yet** — this doc captures the layout so a future PR can land it cleanly without touching the 8086 release pipeline.

## Two viable shapes

### A. Separate Tauri shell (recommended)

A second Tauri shell at `packages/desktop-8085/`, with its own `tauri.conf.json`, identifier, icons, and Cargo binary. Builds independently of `modern8086`; emits its own AppImage / .dmg / .msi / .deb.

Pros:
- 8086 and 8085 are different products with different launch behaviour. A separate shell lets each have its own taskbar icon, file associations (`.a86` vs `.a85`), and update channel.
- No risk of accidentally bundling 8086 capabilities into the 8085 build, or vice versa.
- The 8086 release pipeline (PR #87 → tag → CI matrix → GitHub Release) stays exactly as it is.

Cons:
- ~150 KB of duplicated capability JSON + a second `Cargo.toml`.
- Two release workflows to maintain.

### B. Single shell, multi-window

One Tauri shell with two `app.windows[]` entries pointing at `/` and `/8085/`. Both load from `../web/dist`.

Pros:
- One binary, one updater, one App Store listing.

Cons:
- Single OS-level icon and product name — confusing for users who want "the 8085 app" specifically.
- Both products updated in lockstep — breaks the "ship 8085 polish without retesting 8086" guarantee.

**Going with A.** The shells share the web `dist/`, so disk cost is small. The release independence is worth the duplication.

## File layout (when implemented)

```
packages/
  desktop/                  # existing 8086 shell — UNCHANGED
  desktop-8085/             # new
    Cargo.toml              # binary: modern8085-desktop
    build.rs                # tauri-build, same shape as desktop/
    src/
      main.rs               # mirror desktop/src/main.rs, point at /8085/
      lib.rs
    tauri.conf.json         # see template below
    capabilities/
      default.json          # the 8086 set, minus updater:default — that
                            # is gated to desktop.json per PR #85
      desktop.json
    icons/                  # new 8085-specific icon set; the brand
                            # mark uses an "85" digit pair on a teal
                            # tint instead of 8086's blue
    package.json            # npm-side scripts: dev / build
    README.md
```

## `tauri.conf.json` template

Identical to `packages/desktop/tauri.conf.json` except for:

```json
{
  "productName": "modern8085",
  "identifier": "com.cyberdude.modern8085",
  "version": "0.1.0",
  "build": {
    "beforeDevCommand": "pnpm --filter @modern8086/web dev",
    "beforeBuildCommand": "pnpm --filter @modern8086/web build",
    "devUrl": "http://localhost:5173/8085/",
    "frontendDist": "../web/dist/8085"
  },
  "app": {
    "windows": [
      {
        "title": "modern8085",
        "url": "index.html",
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ]
  },
  "bundle": {
    "shortDescription": "8085 emulator and assembly IDE.",
    "longDescription": "Modern, open-source Intel 8085 microprocessor emulator and assembly IDE for students. Sibling to modern8086 — same chassis, distinct ISA core.",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

`frontendDist: "../web/dist/8085"` is the key — the existing Vite build already emits `dist/8085/index.html` (PR #92, #93), so the Tauri shell can point straight at it without re-bundling anything.

Note: `devUrl` has the `/8085/` suffix so `pnpm desktop-8085:dev` opens the right page.

## Cargo workspace + npm scripts

```toml
# Cargo.toml workspace.members
"packages/desktop-8085",
```

```json
// root package.json
"desktop-8085:dev": "pnpm --filter @modern8085/desktop dev",
"desktop-8085:bundle": "pnpm --filter @modern8085/desktop bundle"
```

```yaml
# pnpm-workspace.yaml
  - "packages/desktop-8085"
```

## Release workflow

A separate `.github/workflows/release-8085.yml` triggered by tags matching `m85-v*`. Mirror the existing 8086 release matrix:

| Step | Same as 8086? |
|---|---|
| Build wasm-api-8085 (web target) | yes (already done by deploy.yml) |
| Build Tauri bundles (Win / Mac / Linux) | yes — change paths to `packages/desktop-8085` |
| Build Android AAB + APK | optional v0.2; defer |
| Upload to GitHub Release | yes |
| Publish @modern8085/cli to npm with the binaries embedded | yes — the npm wrapper (#99) already expects this |

Tag scheme: `m85-vX.Y.Z` (distinct from `vX.Y.Z` used by 8086).

## Android packaging

The 8086 Android pipeline took 4 fix passes (#82–#87) to stabilise; do not start the 8085 Android port until the desktop targets are green and we have at least one tagged release. When we do, the lessons from #87 apply: the find globs for the AAB/APK output paths must match what current Gradle produces, and the APK needs apksigner separately (Tauri 2.11 only signs the AAB).

## Order of execution

1. Tag `m85-v0.1.0` from current main with no Tauri builds — just the CLI + web. Confirms the npm wrapper download path works once a release exists.
2. Scaffold `packages/desktop-8085/` per this doc. Tauri's CLI can generate the bones from a template.
3. Local `pnpm desktop-8085:dev` smoke test — does the window open, does the IDE load, does wasm initialise?
4. Wire `release-8085.yml`. Build desktop targets on a tag push.
5. Document install paths in the README's CLI block (already done for `npm install -g @modern8085/cli` in PR #103).
6. Defer Android until v0.2.

## Why this is documented but not built right now

Three reasons:

1. **No version-bump on main.** Bumping anything in the workspace to 0.1.0 / 1.2.0 risks tripping the existing 8086 release pipeline (it tags on version changes). The desktop scaffold needs its own version namespace; that's the `m85-v*` tag scheme above.
2. **First-release verification needs the npm wrapper to work end-to-end** — and that needs binaries. Chicken-and-egg, but cleanly resolvable by following the Order of Execution above.
3. **Web first.** The web IDE is where 90% of students will land. Desktop polish is for the 10% who want a launcher icon. Ship the web experience cleanly first; this plan documents how desktop slots in when we choose to add it.
