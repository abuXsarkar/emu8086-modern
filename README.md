# modern8086

> A modern, open-source 8086 emulator and assembly-language IDE.
> Built for classrooms, runs in a browser tab, ships as a CLI, a
> desktop app, and (soon) on every major app store.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-1E3A8A.svg)](CHANGELOG.md)
[![Live IDE](https://img.shields.io/badge/live-modern8086.com-0a7?logo=googlechrome&logoColor=white)](https://modern8086.com)
[![CI](https://img.shields.io/github/actions/workflow/status/abuXsarkar/modern8086/ci.yml?branch=main&label=CI)](https://github.com/abuXsarkar/modern8086/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/platforms-web%20·%20linux%20·%20macOS%20·%20windows%20·%20android-1E3A8A.svg)](#install)

---

## Try it now

Open [**modern8086.com**](https://modern8086.com) in any modern
browser. The full IDE — Monaco editor, assembler, emulator,
time-travel debugger, eight live peripherals, ten interactive
tutorials, classroom mode — runs entirely client-side. No sign-in,
no install, no data leaves your device.

> Works on Chromebooks, iPads, Android tablets, and every desktop
> browser. The wasm core fits in ~370 KB and the IDE is fully
> offline-capable once loaded (PWA).

---

## Install

There's a path for every kind of user. Pick the one that fits.

### Browser (no install)

```
https://modern8086.com
```

### CLI — `m86`

```bash
# Cross-platform via npm (Node 18+)
npm install -g @modern8086/cli

# macOS / Linux via Homebrew
brew tap abuxsarkar/modern8086
brew install m86

# Windows via Scoop
scoop bucket add modern8086 https://github.com/abuXsarkar/scoop-modern8086
scoop install m86

# Windows via Chocolatey
choco install m86

# Or from source
cargo install --git https://github.com/abuXsarkar/modern8086 modern8086-cli
```

The `m86` CLI assembles, runs, traces, and grades 8086 assembly
programs headlessly. Drops into GitHub Classroom via the bundled
composite action.

### Desktop app

Native windows that wrap the same web IDE. Single source,
single binary, native menus and file-system access. All bundles
linked below come from the
[latest GitHub Release](https://github.com/abuXsarkar/modern8086/releases/latest).

| Your machine | Recommended download | Notes |
|---|---|---|
| **macOS** — Apple Silicon (M1+) or Intel | [`modern8086_1.1.0_universal.dmg`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086_1.1.0_universal.dmg) | One universal `.dmg` covers both Intel and Apple Silicon. |
| **Windows 10/11** — most users | [`modern8086_1.1.0_x64-setup.exe`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086_1.1.0_x64-setup.exe) | NSIS installer; doesn't need admin rights (`installMode: currentUser`). |
| **Windows** — corporate / Group Policy | [`modern8086_1.1.0_x64_en-US.msi`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086_1.1.0_x64_en-US.msi) | WiX MSI for IT-managed deployments. |
| **Linux** — Debian / Ubuntu / Mint | [`modern8086_1.1.0_amd64.deb`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086_1.1.0_amd64.deb) | `sudo dpkg -i …` |
| **Linux** — any distro, no install | [`modern8086_1.1.0_amd64.AppImage`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086_1.1.0_amd64.AppImage) | `chmod +x` and run; portable, no system changes. |

Or via Homebrew Cask on macOS:

```bash
brew tap abuxsarkar/modern8086
brew install --cask modern8086
```

### Android (sideload)

Every release ships **signed APKs** (one per CPU architecture)
alongside the universal AAB. Pick the one that matches your phone.

| Your device | Download | When to use |
|---|---|---|
| **Modern phones** (Pixel, Galaxy S/A, OnePlus, Xiaomi — anything 2019+) | [`modern8086-android-1.1.0-arm64-v8a.apk`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086-android-1.1.0-arm64-v8a.apk) | Default pick. 95% of Android phones in use today. |
| **Older 32-bit phones** (pre-2019, budget devices) | [`modern8086-android-1.1.0-armeabi-v7a.apk`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086-android-1.1.0-armeabi-v7a.apk) | Use only if `arm64-v8a` says "incompatible". |
| **Android emulators** (BlueStacks, Genymotion, x86 images) | [`modern8086-android-1.1.0-x86_64.apk`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086-android-1.1.0-x86_64.apk) | x86_64 emulator images. |
| **Very old x86 emulators** | [`modern8086-android-1.1.0-x86.apk`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086-android-1.1.0-x86.apk) | Rare; legacy 32-bit x86. |
| Play Store (when live) | [`modern8086-android-1.1.0.aab`](https://github.com/abuXsarkar/modern8086/releases/latest/download/modern8086-android-1.1.0.aab) | Not for sideload — Play Console only. |

**To install an APK on Android:** Settings → enable "Install from
unknown sources" for your file manager or browser → open the
downloaded `.apk`. Play Store listing in flight; see
[Coming soon](#coming-soon).

> **Not sure which ARM ABI?** On a connected device with `adb`:
> `adb shell getprop ro.product.cpu.abi`. Or just try the `arm64-v8a`
> first — installation will fail cleanly if it doesn't match, and
> you can drop down to `armeabi-v7a`.

### CLI binary by hand

If you'd rather not use npm / Homebrew / Scoop / Chocolatey:

| Your machine | Download | After download |
|---|---|---|
| **macOS** — Apple Silicon | [`m86-macos-aarch64.tar.gz`](https://github.com/abuXsarkar/modern8086/releases/latest/download/m86-macos-aarch64.tar.gz) | `tar -xzf … && sudo mv m86 /usr/local/bin/` |
| **macOS** — Intel | [`m86-macos-x86_64.tar.gz`](https://github.com/abuXsarkar/modern8086/releases/latest/download/m86-macos-x86_64.tar.gz) | Same as above. |
| **Linux** — x86_64 | [`m86-linux-x86_64.tar.gz`](https://github.com/abuXsarkar/modern8086/releases/latest/download/m86-linux-x86_64.tar.gz) | `tar -xzf … && sudo mv m86 /usr/local/bin/` |
| **Windows** — x86_64 | [`m86-windows-x86_64.zip`](https://github.com/abuXsarkar/modern8086/releases/latest/download/m86-windows-x86_64.zip) | Unzip; put `m86.exe` somewhere on your `PATH`. |

Each release also ships a `checksums.txt` —
verify with `sha256sum -c` (or `Get-FileHash` on PowerShell)
before running.

### Self-host

A single Docker image runs the IDE and (optionally) the classroom
relay on your campus network — no outbound internet required.

```bash
docker compose up --build
# IDE              http://localhost:8080
# Classroom relay  ws://localhost:8787
```

See [`docs/educator-guide.md`](docs/educator-guide.md) for the
full pilot-deployment recipe.

---

## Coming soon

These channels are in flight. Tracking issues / setup docs linked.

| Channel | Status | Tracking |
|---|---|---|
| **Google Play Store** | Closed-test running; production gated on Google's 14-day pilot | [`packaging/android/SETUP.md`](packaging/android/SETUP.md) |
| **Microsoft Store** | MSI ready; Partner Center submission queued | [`docs/distribution.md#6-microsoft-store`](docs/distribution.md) |
| **Mac App Store** | Awaiting Apple Developer Program enrolment | [`docs/distribution.md#7-mac-app-store`](docs/distribution.md) |
| **Snap / Flathub** | Linux desktop store packaging | [`docs/distribution.md#8-snap-flathub-aur`](docs/distribution.md) |

The release pipeline emits every artifact on every tag —
distribution catches up as each gate is opened.

---

## What's in the box

- **8086 CPU core** in Rust → wasm. Full mainline ISA, the DOS
  subset of `INT 21h` that lab manuals use, the BIOS subset of
  `INT 10h` / `INT 16h`. Deterministic snapshot/restore.
- **Time-travel debugger.** Step forward, step **back**,
  conditional breakpoints, watch expressions, source-line
  highlighting, memory-diff highlights.
- **Eight live peripherals.** Traffic light, stepper motor, 8×8
  LED matrix, 7-segment display, 80×25 text screen at `B800:0000`,
  keyboard FIFO, LPT1 printer, 9×9 robot grid. Each pops out into a
  draggable floater with persistent position.
- **Plugin SDK.** TypeScript-only authoring surface for custom
  OUT-driven device plugins. One `registerDevicePlugin(...)` call;
  the IDE picks it up. Ships with an example buzzer plugin.
- **Classroom mode.** Friendly word-pair room codes
  (`blue-fox-42`), roll-number-based identity, always-on teacher
  view with unilateral take-control, per-student notes, broadcast
  pane on the student side, A4 print-friendly session summary
  plus CSV export. Self-hosted via the bundled `docker-compose.yml`
  or deployed to Cloudflare Workers (free tier).
- **Autograder.** `m86 grade spec.yml submission.asm` runs a YAML
  test spec against a submission and emits JUnit XML for CI. The
  bundled GitHub Action wires this into GitHub Classroom in five
  lines.
- **Share links.** Programs encode into the URL fragment — paste a
  link into chat and the receiver gets the exact same source +
  state.
- **13 UI languages.** English, Spanish, plus 11 Indian regional
  languages (Bengali, Hindi, Tamil, Telugu, Gujarati, Marathi,
  Kannada, Malayalam, Punjabi, Odia, Assamese). Graceful fallback
  to English for any missing string.
- **Source-compatible** with the classic emu8086 dialect and the
  four major South Asian lab manuals (Hashemite, Gopalan, Sri Indu,
  BMSIT). Coverage tracked in
  [`docs/emu8086-compatibility.md`](docs/emu8086-compatibility.md).

---

## Why this project exists

Legacy emu8086 has been the de-facto teaching tool for 8086
assembly for two decades. It is also:

- **Windows-only** (broken under Wine on macOS/Linux),
- **Shareware** with nag screens and a paid full version,
- **Closed-source**, so bugs can't be fixed by educators,
- **Stuck in a Win9x UI** that students find alien,
- **Hard to integrate** with version control, online assignments,
  or autograders,
- **Cryptic** in its error messages.

8086 is still in the syllabus of hundreds of CS/ECE programmes
because it's the cleanest entry point into real ISA-level
thinking. We don't want to replace the curriculum — we want to
replace the tool.

| Legacy emu8086 | `modern8086` |
|---|---|
| Windows-only; broken under Wine | Browser-first; native builds for Win/macOS/Linux/Android |
| Closed-source shareware | MIT-licensed, no paywall, no telemetry by default |
| Tiny dated text editor | Monaco — syntax highlighting, autocomplete, hover docs, snippets |
| Cryptic single-line errors | `rustc`-style diagnostics: source span, caret, "did you mean…?" |
| No version control | Load-from-Git, save-to-Gist, share-link via URL fragment |
| Step-only debugger | Time-travel: **step backward**, conditional breakpoints, watches |
| Single-user only | Live classroom sessions, teacher broadcast, student takeover |
| Static peripheral windows | Themable, accessible, scriptable; plugin SDK for custom devices |
| No autograding | Headless CLI + GitHub Action; YAML spec; works with GitHub Classroom |
| English-only UI | 13 languages, RTL support |
| Inaccessible (mouse-only, poor contrast) | WCAG 2.1 AA target; full keyboard control; ARIA labels |

A deeper breakdown lives in [`docs/pain-points.md`](docs/pain-points.md).

---

## For educators

A first-class goal of the project is **frictionless institute
adoption**. We commit to:

1. **No-install path.** The hosted IDE at
   [modern8086.com](https://modern8086.com) works on any modern
   browser, including school-managed Chromebooks.
2. **Self-host bundle.** A single Docker image runs the web IDE,
   autograder, and the classroom-mode relay entirely on a campus
   network — no outbound internet required.
3. **Curriculum portability.** Existing emu8086 lab manuals run
   unchanged under the `emu8086` dialect.
4. **LMS integration.** GitHub Classroom out of the box; LTI 1.3
   launch from Moodle / Canvas / Blackboard in flight.
5. **Accessibility & i18n.** WCAG 2.1 AA; UI translatable; RTL
   support. Important for adoption outside the Anglosphere.

The step-by-step pilot plan lives in
[`docs/educator-guide.md`](docs/educator-guide.md).

---

## For developers

```bash
# Clone and bootstrap
git clone https://github.com/abuXsarkar/modern8086
cd modern8086
pnpm install

# Build the wasm core, then run the IDE
wasm-pack build packages/wasm-api --target web --out-dir pkg --release
pnpm --filter @modern8086/web dev          # opens http://localhost:5173

# Run the test suite
cargo test --workspace                      # 219 tests across the Rust crates
pnpm -r test                                # classroom server + protocol tests

# Try the CLI without installing
cargo run -p modern8086-cli -- run-asm examples/hello.asm
```

Project layout:

```text
modern8086/
├── packages/
│   ├── core/         Rust 8086 CPU core (compiles to wasm + native lib)
│   ├── assembler/    Rust assembler (emu8086 dialect)
│   ├── wasm-api/     wasm-bindgen surface
│   ├── devices/      Virtual peripherals
│   ├── web/          React + Vite IDE
│   ├── cli/          modern8086-cli (binary: m86)
│   ├── cli-npm/      Node-shim wrapper that downloads the right binary
│   ├── desktop/      Tauri 2 shell (Linux / macOS / Windows / Android)
│   ├── plugin-sdk/   TypeScript SDK for custom device plugins
│   └── plugins/      Bundled example plugins (buzzer)
├── examples/         Sample programs (hello.asm, sum.asm, …)
├── tests/            Conformance test suite
├── docs/             Architecture, ADRs, educator guide, …
├── packaging/        Per-channel distribution manifests + Android scaffold
└── .github/          CI, release workflow, issue/PR templates
```

Full architecture in [`ARCHITECTURE.md`](ARCHITECTURE.md). The
day-one stack decision: [`docs/adr/0001-tech-stack.md`](docs/adr/0001-tech-stack.md).

---

## Documentation

| Topic | Document |
|---|---|
| Single-page user reference (IDE, debugger, devices, CLI, self-host) | [`docs/user-manual.md`](docs/user-manual.md) |
| System design + module map | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Roadmap (M0 → M7 with exit criteria) | [`ROADMAP.md`](ROADMAP.md) |
| Distribution channels (npm / Homebrew / Scoop / Choco / Play / Store) | [`docs/distribution.md`](docs/distribution.md) |
| Plugin authoring | [`docs/plugin-sdk.md`](docs/plugin-sdk.md) |
| Educator pilot guide | [`docs/educator-guide.md`](docs/educator-guide.md) |
| Classroom-mode protocol | [`docs/classroom-mode.md`](docs/classroom-mode.md) |
| Lab-manual compatibility audit | [`docs/lab-manual-audit.md`](docs/lab-manual-audit.md) |
| Dialect compatibility matrix | [`docs/emu8086-compatibility.md`](docs/emu8086-compatibility.md) |
| Versioning policy (what counts as breaking) | [`SEMVER.md`](SEMVER.md) |
| Release-cut checklist | [`docs/release-process.md`](docs/release-process.md) |
| Security policy | [`SECURITY.md`](SECURITY.md) |
| Code of conduct | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

---

## Contributing

We welcome contributions from students, educators, and the
open-source community. Read
[`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) before opening an issue
or PR.

Good first issues are tagged
[`good-first-issue`](https://github.com/abuXsarkar/modern8086/labels/good-first-issue).

## License

[MIT](LICENSE) — free for commercial, academic, and personal use.

## Acknowledgements

This project is independent of the original emu8086 software
(© Emu8086, Inc.) and contains none of its code. We thank the
original authors for two decades of teaching tooling, which we
hope to honour by carrying the experience forward into a more
open and modern era.
