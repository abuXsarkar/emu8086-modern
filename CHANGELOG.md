# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting with `1.0.0`.

## [Unreleased]

### Added — `/8051/` sibling tool

A third IDE for the Intel 8051, deployed at
[modern8086.com/8051](https://modern8086.com/8051) as a sibling under
the same chassis. Same Monaco shell, design system, classroom relay,
i18n, and deploy pipeline; distinct ISA core since the 8051 is a
3-space microcontroller (256-byte IDATA + 64 KiB XDATA + 64 KiB CODE,
8 PSW bits, register banks, bit-addressable space).

Shipped across PRs #138–#149:

- **Rust core** — Cpu / Psw / Memory data model + 256-opcode decoder
  + executor. Bank-aware R0–R7 access via PSW.RS1:RS0. SFR mirror for
  direct addressing of `ACC` / `B` / `DPTR` / `SP` / `PSW`. P0..P3
  writes logged into `io_log` to drive the IDE's device pane.
- **Assembler** — Keil A51 / ASEM-51 canonical dialect with a 5-rule
  tolerance preprocessor (Keil ⇄ SDCC asx8051 ⇄ AS31 ⇄ TASM ⇄ lab-
  manual PDFs all assemble first try). Two-pass encoder with full ISA
  including bit ops, MOVC look-up tables, AJMP / ACALL paging.
  `MOV DPTR, #LABEL` resolves at encode time so the canonical look-up
  table idiom works.
- **WASM API** — `Emulator` class with the same `load` / `step` / `run`
  / `state` / mem / `poke` / `drain_io_log` shape as the 8085 wasm.
  `state()` exposes A, B, DPTR, SP, PC + all 8 PSW bits + the active
  bank R[0..7] (so the IDE doesn't have to do bank math). 3-space
  memory accessors: `idata`, `xdata`, `code`.
- **Web IDE** (`/8051/`) — Monaco with 8051 Monarch language + hover
  docs (cycle counts), full register pane, PSW chips, 3-space memory
  inspector with toggle, examples dropdown with auto-IDATA / XDATA
  preload, I/O activity log, share-via-URL, breakpoints by PC,
  active-line highlight, diff-flash on changed cells.
- **Devices panel** — Same 8 trainer-kit primitives the 8085 ships
  (7-seg, traffic light, LED bar, hex keypad, stepper, printer,
  screen, robot), rebound to P0..P3 SFRs via per-device PortSelect.
- **Tutorials** — 4 progressive walkthroughs (Hello, Add two, DJNZ
  loop, Drive a port). Progress saves per-lesson in localStorage.
- **Landing** (`/8051/about/`) — 8 marketing slides: Hero / For
  students / 8 live devices / Pedagogy / Classroom / Share + save /
  Family / Credits.
- **Docs** (`/8051/docs/`) — full mnemonic reference + example list
  + CLI walkthrough sourced from `asm8051_docs.ts` and `examples.ts`.
- **CLI** — `m51` binary with `version`, `assemble`, and `run`
  subcommands. `--poke` and `--mem-dump` understand the 3 memory
  spaces (`idata:30=AA`, `xdata:2000,16`, `code:0,32`). Exit codes
  match the m85 pipeline so autograders work unchanged.
- **npm wrapper** — `@modern8086/cli-8051` (under the existing scope;
  `@modern8051` is taken on npm). Pre-tag inert; postinstall flips on
  once `m51-v*` is tagged.
- **Release pipeline** — `release-8051.yml` on `m51-v*.*.*` tags
  (independent of 8086 / 8085 pipelines). Four-target matrix +
  GitHub Release attach.
- **Distribution templates** — Homebrew formula, Scoop manifest,
  Chocolatey nuspec, all filled by `generate-m51-manifests.sh` from
  the live `checksums.txt` of any tagged release.
- **i18n** — 13 locales (en + 12 Indian + es) via the shared
  `LOCALES` registry; preference persists in localStorage.
- **Classroom mode** — Same Cloudflare Worker relay the 8086 and
  8085 IDEs use. Pill in the header; layer mounts on top of the IDE.

### Added — `/8085/` sibling tool

A second IDE for the Intel 8085, deployed at
[modern8086.com/8085](https://modern8086.com/8085) as a sibling under
the same chassis. Same Monaco shell, design system, PWA scope, and
deploy pipeline; distinct ISA core since the 8085 is genuinely a
different architecture (8-bit, separate mnemonic set, no segmentation).

Shipped across PRs #88–#97:

- **Rust core** — register/flag model, 64 KiB linear memory, ALU
  helpers, full 246-opcode decoder + executor, cycle budget for
  Web Worker safety. Regression tests against every documented bug
  in the major competitors (GNUSim8085 #71/#46, sim8085 #18/#44/#45,
  Phoxis review).
- **Assembler** — two-pass with full ISA encoding + 7-rule tolerance
  preprocessor so paste-in from sim8085 / GNUSim8085 / OshonSoft /
  lab-manual PDFs assembles on first try. 20 canonical lab programs
  gated by per-program integration tests so the IDE never silently
  ships a broken example.
- **WASM API** — `Emulator` class with `load`/`step`/`run(budget)`/
  `state`/`mem`/`poke` for the IDE; `assemble` one-shot for tooling.
- **Web IDE** — Monaco editor with 8085 Monarch language + hover docs
  on every mnemonic (the inline-docs gap sim8085 paywalls), register
  pane, flags chips, memory inspector with hex/dec/ASCII toggle,
  examples dropdown with auto-input-load, share-via-URL, chunked
  execution + Abort button (fixes the GNUSim8085 #21 / sim8085 #67
  "infinite loop freezes everything" pain point), dark mode, mobile
  breakpoint.
- **CLI** — `m85` binary with `version`, `assemble`, and `run`
  subcommands. `run` exposes `--poke`, `--bp`, `--max-steps`,
  and `--mem-dump` for autograding pipelines; exit code distinguishes
  HLT vs other stop reasons.
- **CI** — workflows build both 8085 wasm + 8086 wasm; full clippy/fmt
  gating across new crates.
- **Cross-link** — landing nav + footer link to /8085/, IDE-header
  chip in the 8086 IDE pointing at the sibling.

Research backing this work is in `docs/plans/8085-port.md` and
`docs/plans/8085-port-research.md` (4 parallel research agents
covered competitor landscape, dialect compatibility, canonical
example programs, and pain-point survey across 30+ sources).

### Added — `/8085/` polish (PRs #99–#111)

Follow-up work after the initial /8085/ launch:

- **npm wrapper** `@modern8086/cli-8085` (#99) — pre-release skeleton;
  inert until a tagged m85 release exists, then `npm install -g`
  fetches the per-platform binary from the GitHub Release.
- **`/labs/` catalogue** (#100) — family-of-tools landing page
  listing 8086 + 8085 (live) and the planned siblings (8051, ARM
  Cortex-M, RISC-V, K-map, cache sim, CPU scheduler, page
  replacement, subnet calc). Cross-link chips in both IDE headers
  funnel through here.
- **Inline error squiggles + ⬇ Save** (#101) — assembler errors mark
  the failing line in Monaco; Save downloads the buffer as `.a85`
  with a name slugged from the first non-empty line.
- **⌨ Keyboard shortcuts + ↻ Restart** (#102) — Ctrl/Cmd + Enter
  (Run), . (Step), S (Save), K (Share); Restart = Reset + Run in
  one click.
- **README install matrix** (#103) — lists /, /8085/, /labs/ +
  `m85` CLI alongside `m86`.
- **First-time quick-start strip** (#104) — one-line amber banner
  that shows on first visit, dismissed by Examples pick or ×.
- **↶ Back time-travel** (#105) — replay-from-start gives a
  step-back button that's correct by construction. No competitor
  shipped 8085 simulator I could find offers this.
- **End-to-end run-and-verify tests** (#106) — 12 canonical
  programs assembled + executed + outputs asserted in CI.
- **? help overlay** (#107) — shortcuts table + 4-step workflow +
  dialect notes + memory-layout convention, modal triggered by `?`.
- **`/8085/docs/` reference page** (#108) — long-form quick-start +
  full mnemonic table + tolerance-fix list + CLI usage. Content
  shared with the IDE's `asm8085_docs.ts` so they can't drift.
- **Tauri desktop bundling plan** (#109) — `docs/plans/8085-desktop.md`
  documents the layout for a future `packages/desktop-8085/` shell
  without touching the 8086 release pipeline.
- **Fast / Slow / Crawl Run speeds** (#110) — Slow (180 ms) and
  Crawl (800 ms) drive a step-by-step path with per-instruction UI
  refresh, useful for classroom demos. Fixes Launchpad #579326.
- **Changed-register flash** (#111) — registers and flags that
  changed in the last step pulse for 700 ms. Pairs with Slow/Crawl
  for a real watch-the-CPU-think experience.
- **CHANGELOG catch-up #99–#111** (#112).
- **`release-8085.yml` workflow** (#113) — `m85-v*` tag pushes
  produce native CLI binaries for four targets and attach them to
  a GitHub Release. Independent of the existing 8086 release
  pipeline (which fires on bare `v*.*.*`).
- **Auto-run toggle for Examples** (#114) — composes with Slow/Crawl
  for a self-narrating demo mode.
- **Click-to-copy on Symbols rows** (#115) — paste label addresses
  straight into a calculator or the memory inspector base.
- **m85-v0.1.0 activation docs** (#116) — README maintainer block +
  desktop-plan refresh now explain the exact tag-push to fire the
  first release.
- **`/labs/` 8085 card blurb** (#117) — catalogue mentions
  time-travel + slow/crawl + register flash + m85 CLI.
- **Monaco autocomplete** (#118) — mnemonics + registers + directives
  surface as completion suggestions with the inline docs as detail.
- **Accurate per-instruction cycle accumulation** (#119) — Run's
  cycle counter previously charged a flat `budget` cycles per chunk;
  `exec::run_with_cycles` now sums each StepRecord's actual cycles.
  Off-by-an-order-of-magnitude error fixed.

Test count across the 8085 stack now: **126** (49 assembler unit +
20 canonical-assemble + 12 end-to-end run-verify + 36 core +
9 wasm-api).

### Added — `/8085/` parity push (PRs #120–#131)

The work block that took /8085/ from "polished standalone IDE" to
"feature parity with modern8086":

- **CHANGELOG #112-#119 catch-up** (#120) — interim update.
- **Scope rename** (#123) — `@modern8085/cli` → `@modern8086/cli-8085`
  after the `@modern8085` npm org turned out not to be owned by the
  abuxsarkar account. Same scope as the 8086 binary, `-8085` infix
  keeps them distinct.
- **Classroom + i18n in 8085** (#124) — `useClassroomEditor`,
  `ClassroomPill`, `ClassroomLayer` from the shared
  `packages/web/src/classroom` module. Locale picker covers all 13
  existing locales (en, es, hi, bn, gu, kn, ml, mr, or, pa, ta,
  te, as).
- **IO ports + seven-segment** (#125) — `IN` / `OUT` no longer
  halt; they read/write `cpu.ports[n]`. First device renders that
  port byte as a 7-seg + decimal point.
- **Traffic light + LED bar** (#126) — plus a bundled count-up
  example program.
- **Hex keypad** (#127) — first input device; click writes a value
  to a port the program can `IN`.
- **Stepper + Printer + io_log stream** (#128) — `cpu.io_log` lets
  stream devices capture every OUT byte without losing repeats
  (critical for the Printer's "Hello!" example where two `l`s in a
  row otherwise vanish).
- **Tutorials panel** (#129) — 4 in-app walkthroughs (Hello, Add,
  Loops, Seven-segment), markdown-subset bodies, "Load this code"
  buttons, per-lesson progress in localStorage.
- **Screen + Robot** (#130) — green-on-black tty (LF/CR/BS/FF
  control bytes) and a 16×16 turtle-graphics canvas with
  pen-up/pen-down trail. **8/8 device parity with modern8086.**
- **/8085/about/ landing** (#131) — 8-slide public pitch:
  hero, for-students checklist, device grid, pedagogy, classroom,
  share+save, the family, credits.

Plus the maintainer actions taken in the same window:

- **Tag `m85-v0.1.0` pushed**, `release-8085.yml` produced 4 CLI
  binaries (linux-x86_64, macos-x86_64, macos-aarch64,
  windows-x86_64) attached to the matching GitHub Release.
- npm publish of `@modern8086/cli-8085@0.1.0` — pending OTP.

### Added — `/8085/` finishing touches (PRs #132–#135)

- **CHANGELOG parity catch-up** (#132).
- **Distribution manifest templates + generator** (#133) —
  `packaging/homebrew/Formula/m85.rb.template`,
  `packaging/scoop/m85.json.template`, `packaging/chocolatey-8085/`,
  and `packaging/scripts/generate-m85-manifests.sh`. Verified
  against the live m85-v0.1.0 release: real SHA-256s land in the
  right slots. Maintainer copies the filled files into the tap /
  bucket / chocolatey-push repos to activate each channel.
- **Tauri desktop scaffold** (#134) — `packages/desktop-8085/`
  mirrors `packages/desktop` with name + URL swaps. Cargo
  workspace + pnpm-workspace wired. `frontendDist:
  ../web/dist/8085` points the bundled app straight at the 8085
  IDE. Not built in any workflow yet; extending release-8085.yml
  with a desktop matrix is the next step per
  docs/plans/8085-desktop.md.
- **Brand mark SVG** (#135) — `Mark85` clones the modern8086 DIP-
  package mark with the centred text swapped to `0x85`. Wired into
  both /8085/ and /8085/about/ so every public surface reads as
  the same product family.

Final 8085 test count: **131** (49 + 22 + 13 + 38 + 9). Web
surfaces: `/8085/`, `/8085/about/`, `/8085/docs/`, `/labs/`. CLI
surfaces: `m85` binary, GitHub Release artifacts, npm wrapper
(awaiting OTP for first publish), Brew/Scoop/Choco templates.
Native: Tauri desktop scaffold ready, build pipeline pending.

## [1.1.4] — 2026-05-13

Android staging fix. v1.1.3's Gradle build produced the files in
`outputs/bundle/universalRelease/` and `outputs/apk/universal/release/`
but the stage step's find glob was too strict. Also Tauri only signs
the AAB, so the APK now gets signed with apksigner in CI.

One universal APK, one universal AAB. Per-ABI splits dropped — Tauri's
default is universal anyway.

## [1.1.3] — 2026-05-13

Third Android-fix patch. v1.1.2's capability-split fix worked at the
config layer, but the Gradle build then failed with 4 Kotlin
compile errors:

```text
Line 10: import java.util.Properties
                            ^ Expecting an element
         Unresolved reference: import
```

Root cause: `packaging/android/gradle-signing-patch.sh` was
*prepending* keystore-properties wiring to
`app/build.gradle.kts`, but Tauri 2.11's default scaffold already
includes that exact wiring — the patch produced a duplicate
`import` block at line 10, which Kotlin can't parse.

### Fixed

- **Android build** — release.yml drops the redundant
  "Patch gradle for release signing" step. The default Tauri
  scaffold already reads from `rootProject.file("keystore.properties")`,
  so writing that file (which the workflow already does in the
  next step) is the only thing needed.
- Deletes `packaging/android/gradle-signing-patch.sh` (no longer
  invoked; would only confuse future readers).

## [1.1.2] — 2026-05-13

Second Android-fix patch. v1.1.1's source-level cfg-gate (#82)
cleared the Rust compile errors, but the build still failed on the
*capability* layer: `packages/desktop/capabilities/default.json`
listed `updater:default`, which is gated out on Android along
with the plugin itself.

### Fixed

- **Android build (capability split)**. Capability files now split:
  - `capabilities/default.json` — cross-platform; opener +
    `core:default`.
  - `capabilities/desktop.json` — gates `updater:default` behind
    `"platforms": ["macOS", "windows", "linux"]`. Android / iOS
    builds skip this file entirely.

  Tauri merges every JSON in `capabilities/` at build time, and the
  `platforms` field is the documented mechanism for per-target
  exclusion.

No code changes, no source-language semantic changes.

## [1.1.1] — 2026-05-13

Patch release. v1.1.0 published cleanly for desktop / CLI but the
Android job failed to compile because `packages/desktop/src/lib.rs`
referenced desktop-only Tauri APIs (`tauri::menu`,
`tauri-plugin-window-state`, `tauri-plugin-updater`) without
`#[cfg(desktop)]` gates. Cross-compiling for
`aarch64-linux-android` failed at symbol resolution.

### Fixed

- **Android build** (#82). `packages/desktop/src/lib.rs` now gates
  the menu module, the window-state + updater plugin
  registrations, and the `setup` + `on_menu_event` chain on
  `#[cfg(desktop)]`. `packages/desktop/Cargo.toml` moves
  `tauri-plugin-window-state` and `tauri-plugin-updater` into a
  `[target.'cfg(not(any(target_os = "ios", target_os =
  "android")))'.dependencies]` block so cargo doesn't try to
  resolve them on mobile.
- This means v1.1.1's release page is the first one to actually
  ship the per-ABI signed APKs + universal AAB the Android
  pipeline was designed to produce.

No source-level changes to CPU semantics, the assembler, the web
IDE, or the desktop app behaviour. Existing v1.1.0 desktop /
browser users do not need to update.

## [1.1.0] — 2026-05-12

Brand-and-distribution release. The product is the same; everything
around it is renamed, sharpened, and pointed at a real domain. No
breaking changes to assembly programs or the CPU semantics.

### Headlines

- **Rebrand to `modern8086`**. The project, the npm scope
  (`@modern8086/*`), every Cargo crate (`modern8086-{core,assembler,
  devices,cli,wasm-api,desktop}`), the CLI binary (now **`m86`**, was
  `emu8086`), the Cloudflare worker (`modern8086-classroom`), and
  every localStorage key (`modern8086.*`). Done in one mechanical
  sweep so the v1.1.0 tag publishes against the rebranded
  identifiers everywhere. Refs to the legacy emu8086 *product* (the
  dialect name, lab-manual compatibility, `emu8086.inc` macro pack,
  credits) are deliberately preserved.
- **Custom domain — `modern8086.com`**. CNAME committed to
  `packages/web/public/`, deploy workflow drops the github.io
  sub-path base, desktop opener allowlist points at the new
  domain. Hosted IDE is live at https://modern8086.com.
- **Android pipeline.** Tauri Android target wired into
  `release.yml`. Every tag now produces signed APKs (one per ABI)
  plus a universal AAB. Gated on `vars.ANDROID_BUILD_ENABLED`; with
  `vars.PLAY_STORE_UPLOAD_ENABLED` flipped on the AAB
  auto-uploads to Play Console's Internal track via
  `r0adkll/upload-google-play`. Play Store listing in flight
  separately. `packaging/android/` carries the Play Store
  listing copy, the keystore setup walkthrough, the Gradle
  signing-config patch, and 1024×500 feature graphic + 1080×2160
  phone screenshots.
- **Distribution scaffolding for the four free-tier channels.**
  In-repo templates + a release-pipeline job that fills them
  on each tag and attaches the bundle as a release artifact:
  Homebrew tap (`Formula/m86.rb` + `Casks/modern8086.rb`), Scoop
  bucket (`m86.json`), Chocolatey (`m86.nuspec` + install
  scripts). One generator script
  (`packaging/scripts/generate-distribution-manifests.sh`)
  fills version + per-asset SHA-256 from the
  just-published Release's `checksums.txt`.
- **Light theme is the new default.** First-time visitors land
  on the paper palette. Only an explicit `vs-dark` in localStorage
  opts into dark, in both the pre-paint script and the React
  initialiser. (Saved preferences from v1.0.0 are preserved.)
- **Registers + Flags moved from the right rail to the left
  rail**, under Load Example / Drop File. The right rail is now
  devices-only, which lets the device gallery breathe
  vertically.
- **Gear + tutorial triggers aligned.** Both 36 × 36, same
  bottom edge, same shadow, 16 px between them. On phones they
  stack vertically with 8 px between them so a fat-thumb tap
  can't hit both.
- **Mobile floater clamp.** Floaters now respect the viewport on
  ≤ 760 px screens — saved desktop positions no longer strand a
  device pop-out off-screen, and tall content scrolls inside the
  floater frame.
- **Distribution-chip footer.** The website footer gains a row
  of install chips (npm / Homebrew / Scoop / Chocolatey / Desktop
  ↓) plus dashed "soon" chips for Play / App / Microsoft Stores.
  Hidden inside Tauri (the desktop user already has the app).
- **README overhaul.** Reorganised around the user journey:
  try-it-now → install → coming-to-stores → features → educator
  / developer paths → docs. Adds a per-platform "pick your
  download" table for desktop and per-ABI table for Android.

### Fixed

- **Multi-page navigation cascades.** From `/about/`, clicking
  "docs" used to resolve to `/about/docs/`; clicking again
  cascaded to `/about/docs/docs/`. Same shape from `/docs/` back
  to about. Every internal href is now root-absolute (`/`,
  `/about/`, `/docs/`).
- **IDE brand mark wasn't clickable.** Now wrapped in
  `<a href="/">` matching the convention on the about + docs
  pages.
- **Stale "M0–M5 shipped at alpha" footer copy.** Replaced
  with `v1.1.0 · MIT`.

### Removed

- Stale `t.footerNote` rendering. Key remains in i18n types /
  locale files (dead key only, removable in a later cleanup pass)
  to avoid touching 13 locale files for a single dropped string.

### Distribution

Per-channel status as of v1.1.0 tag:

| Channel | Status |
|---|---|
| GitHub Releases | Auto, every tag. |
| `@modern8086/cli` on npm | Auto-publishes on tag with `vars.NPM_PUBLISH_ENABLED=true` + `NPM_TOKEN`. |
| Android AAB + per-ABI APKs | Builds on tag with `vars.ANDROID_BUILD_ENABLED=true` + keystore secrets. |
| Homebrew tap | Manifests filled in-pipeline and attached to the Release for copy into the tap repo. |
| Scoop bucket | Same shape as Homebrew. |
| Chocolatey | Nuspec filled in-pipeline; `choco pack && push` from a maintainer machine. |
| Play Store | Pipeline ready; listing still being seeded — Plan B for v1.1.0 is sideload via the per-ABI APK on the GitHub Release. |
| Microsoft Store | Pipeline ready (MSI). Partner Center submission deferred. |
| Mac App Store | Awaiting Apple Developer Program enrolment. |

Full distribution playbook: [`docs/distribution.md`](docs/distribution.md).

## [1.0.0] — 2026-05-11

First stable release. Everything documented in
[`docs/user-manual.md`](docs/user-manual.md) is part of the
[`SEMVER.md`](SEMVER.md) compatibility contract from this version
onward.

### Headlines

- **Web IDE** — Monaco editor with 8086 syntax + snippets + hover
  docs, 13 UI translations (en, es, bn, as, hi, ta, te, gu, mr, kn,
  ml, pa, or) with graceful English fallback, paper / dark themes,
  share-links via URL fragment, 1-million-step run cap with a
  status banner that distinguishes halt vs step-limit vs error,
  responsive layout for phones / tablets, opt-in local-only
  metrics, accessible focus / role wiring throughout.
- **Time-travel debugger** — Step / ◀ Back / Reset, watch
  expressions, breakpoint predicates, source-line highlighting,
  memory hex panel with per-step change diffing.
- **Eight live peripherals** — traffic light, stepper motor, 8×8
  LED matrix, 7-segment display, B800-mapped 80×25 text screen,
  keyboard FIFO, LPT1 printer, 9×9 robot grid. Each pops out into
  a draggable floater with persistent position.
- **`emu8086` CLI** — `assemble`, `run`, `run-asm`, `trace` (JSON
  per-instruction execution log), `grade` (YAML spec → JUnit XML),
  `compat-report` (corpus check with `--exclude PATTERN`),
  `version`. Distributed natively, plus an
  [`@modern8086/cli`](packages/cli-npm) npm wrapper that auto-fetches
  the right prebuilt binary per platform.
- **Classroom mode** — start a live session with friendly word-pair
  room codes (`blue-fox-42`), roll-number-based identity,
  always-on teacher view with unilateral take-control, per-student
  notes, broadcast pane on the student side, accumulated
  submissions downloaded as a zip, A4 print-friendly session
  summary plus CSV export. Self-hosted via the bundled
  `docker-compose.yml`.
- **Plugin SDK 1.0** — TypeScript-only authoring surface for
  OUT-driven device plugins. One `registerDevicePlugin(...)` call;
  the IDE renders the plugin in the device gallery alongside the
  built-ins. Ships with an example buzzer plugin.
- **Native desktop shell** — Tauri 2 wraps the same web IDE for
  Linux, macOS, and Windows. `pnpm desktop:bundle` produces
  DEB/AppImage, DMG/.app, MSI/NSIS.
- **Self-host bundle** — single Docker image for the web IDE plus
  an optional sidecar image for the classroom relay. HMAC secret
  rotation, healthcheck endpoint, unprivileged runtime user.
- **Lab-manual compatibility** — assembler accepts MASM idioms
  used in the four major South Asian 8086 lab manuals: `db ?`,
  `NAME DB`, implicit deref, `.MODEL` / `PROC` / `ENDP`, `SEGMENT`
  / `ENDS`, `STRUC`, `LABEL`, `IF / ELSE / ENDIF`, `SEG` / `TYPE`
  / `LENGTH` / `SIZE` operators, all the lab-manual `INT 21h` /
  `INT 10h` / `INT 16h` / `INT 33h` subfunctions, virtual
  filesystem with file-I/O subfunctions.
- **In-app tutorials** — 10 hands-on lessons (Hello, Registers,
  Memory + addressing modes, Arithmetic + flags, Stack, Procedures,
  Interrupts, Devices, Time-travel debugger, Sharing + the
  autograder) with starter-code drop-ins and per-step progress.
- **User manual** — single-page reference at
  [`docs/user-manual.md`](docs/user-manual.md).
- **Governance** — [`SEMVER.md`](SEMVER.md) spells out what counts
  as breaking; [`docs/release-process.md`](docs/release-process.md)
  is the maintainer's checklist; [`SECURITY.md`](SECURITY.md) lays
  out the post-1.0 support matrix.

### Detail

For the full per-PR detail since the post-handoff window, see the
older `### Added (post-handoff)` entries below (preserved verbatim
to keep the audit trail intact).

### Added (post-handoff)

- **`SEGMENT`/`ENDS`, `LABEL`, `PUBLIC`/`EXTRN`, `STRUC`, `GROUP`, `IF`/`ELSE`/`ENDIF`, plus `SEG` / `TYPE` / `LENGTH` / `SIZE` operators** (closes audit gaps GAP-013, GAP-015 through GAP-018, GAP-020, GAP-031, GAP-032 — PR 4 of the lab-manual close-out plan; depends on PR 1's `ConstExpr` AST). The preprocessor's drop-list grows to cover linker concerns the manuals' multi-file sources name but our flat `.com` model doesn't track: `PUBLIC`, `EXTRN` / `EXTERN`, `GROUP`. Conditional-assembly markers — `IF` / `IFDEF` / `IFNDEF` / `IFB` / `IFNB` / `IFE` / `ELSEIF` / `ELSEIFDEF` / `ELSEIFNDEF` / `ELSEIFB` / `ELSEIFNB` / `ELSEIFE` / `ELSE` / `ENDIF` — are also dropped at the line level (we don't yet have a macro-time expression evaluator; the typical `IFDEF foo / inclusive body / ENDIF` library-protection pattern flows through correctly because its body would be included anyway). The full-segment form (`name SEGMENT [PUBLIC ALIGN ...]` ... `name ENDS`) lex-and-drops the markers and lets the body pass through to the parser, so M2 and M3 sources that use this form instead of `.MODEL SMALL` now assemble. `name STRUC` ... `name ENDS` is recognised as a record-type declaration and the entire block (including any field declarations inside) is dropped, since we don't model record types and the body would otherwise emit garbage bytes. `name LABEL <type>` becomes `name:` — we don't track per-label sizes separately yet, so the type byte (BYTE/WORD/DWORD) is consumed but not used. The parser's constant-expression primary now recognises `SEG label` (returns 0 — every segment register holds the same base in our flat model), `TYPE` / `LENGTH` / `SIZE` / `LENGTHOF` / `SIZEOF label` (return 1 each — best-effort default that lets sources assemble; multi-element-array correctness is tracked separately in the compatibility doc). 7 new encoder tests cover SEGMENT/ENDS pair-and-drop, PUBLIC / EXTRN / GROUP no-op behaviour, LABEL ↔ `:` equivalence, STRUC body-skipping, IF/ELSE/ENDIF inclusion, `SEG foo` returning 0, and all five MASM info operators returning 1. The encoder test harness also picks up the preprocessor in its pipeline, matching what `assemble()` does end-to-end.
- **`INT 10h` BIOS video subset** (closes audit gaps GAP-200 through GAP-208 — PR 3 of the lab-manual close-out plan). The previous DOS subset had no video service at all, so M4 BMSIT's `CLS PROC NEAR` (canonical `MOV AH, 0Fh ; INT 10h ; MOV AH, 0 ; INT 10h` clear-screen idiom) and M1 Hashemite Experiment 6's mouse-paint program both trapped on the first INT 10h call. Now: AH=00h sets the video mode and clears the 80×25 buffer at `0xB_8000` for text modes (so the CLS pattern works); AH=02h/03h round-trip cursor row+col; AH=06h/07h scroll-clear a window with a fill attribute (AL=0 clears the entire region — the most common usage); AH=09h writes a character + attribute at the cursor `CX` times without advancing it; AH=0Ah is the same without changing the attribute; AH=0Eh is the BIOS TTY service (advances cursor, handles BS/CR/LF, and pushes printable bytes to stdout so CLI programs that drive the screen via INT 10h still produce visible output); AH=0Fh reports the current mode (AL), column count (AH=80), and active page (BH=0); AH=0Ch/0Dh write/read pixel are accepted as no-ops because graphics-mode framebuffers at `0xA_0000` aren't yet modelled — the call returns cleanly so M1 Exp 6 runs to completion. New `Cpu::video_mode`, `cursor_row`, `cursor_col` fields; default `0x03` (80×25 colour text) so existing programs see the standard boot-time mode. 7 new core unit tests cover AH=00h buffer-clear, AH=0Fh default-mode read-back, the M4 CLS proc round-trip, AH=02h↔03h cursor round-trip, AH=09h character+attribute placement, AH=0Eh TTY stdout + cursor advance, and AH=06h whole-window clear with a fill attribute.
- **Virtual filesystem + `INT 21h` file I/O subfunctions** (closes audit gaps GAP-104, GAP-105, GAP-106, GAP-107, GAP-108, GAP-109 — PR 7 of the lab-manual close-out plan; depends on PR 2 for the dispatcher extension). New `Vfs` (path → bytes hash map) and `FileHandle` (path + position + writable) on `Cpu`, plus a 5-slot reserved-handle prefix so `AH=3Ch` / `AH=3Dh` allocate from index 5 (matching DOS's stdin/stdout/stderr/aux/prn convention). The six file-I/O subfunctions — `AH=3Ch` create-or-truncate, `AH=3Dh` open with mode (0/1/2 = read/write/rw), `AH=3Eh` close, `AH=3Fh` read with handle position tracking, `AH=40h` write with file extension on the fly, `AH=41h` delete — all set/clear CF and return the documented DOS error codes (2 = file not found, 5 = access denied, 6 = invalid handle). `Emulator::load_source` now preserves host-injected fields (VFS, clock) across re-loads since they conceptually represent "external state" the program should see across runs (real machine = real disk and clock survive). Wasm-bindgen surface gains `vfs_put`, `vfs_get`, and `vfs_paths` so the IDE can drop a real file in, run the program, and read back what was created/written. Five new core unit tests cover: AH=3Ch handle allocation, AH=3Dh open-not-found error path, the canonical M1 Experiment 5 create→write→close→open→read→close round-trip, AH=41h delete + double-delete-not-found, AH=3Eh invalid-handle error. New wasm-api end-to-end test exercises `vfs_put` → `load_source` → `run` → `vfs_get`, asserting the host-injected file persists across the load. (closes audit gaps GAP-200 through GAP-208 — PR 3 of the lab-manual close-out plan). The previous DOS subset had no video service at all, so M4 BMSIT's `CLS PROC NEAR` (canonical `MOV AH, 0Fh ; INT 10h ; MOV AH, 0 ; INT 10h` clear-screen idiom) and M1 Hashemite Experiment 6's mouse-paint program both trapped on the first INT 10h call. Now: AH=00h sets the video mode and clears the 80×25 buffer at `0xB_8000` for text modes (so the CLS pattern works); AH=02h/03h round-trip cursor row+col; AH=06h/07h scroll-clear a window with a fill attribute (AL=0 clears the entire region — the most common usage); AH=09h writes a character + attribute at the cursor `CX` times without advancing it; AH=0Ah is the same without changing the attribute; AH=0Eh is the BIOS TTY service (advances cursor, handles BS/CR/LF, and pushes printable bytes to stdout so CLI programs that drive the screen via INT 10h still produce visible output); AH=0Fh reports the current mode (AL), column count (AH=80), and active page (BH=0); AH=0Ch/0Dh write/read pixel are accepted as no-ops because graphics-mode framebuffers at `0xA_0000` aren't yet modelled — the call returns cleanly so M1 Exp 6 runs to completion. New `Cpu::video_mode`, `cursor_row`, `cursor_col` fields; default `0x03` (80×25 colour text) so existing programs see the standard boot-time mode. 7 new core unit tests cover AH=00h buffer-clear, AH=0Fh default-mode read-back, the M4 CLS proc round-trip, AH=02h↔03h cursor round-trip, AH=09h character+attribute placement, AH=0Eh TTY stdout + cursor advance, and AH=06h whole-window clear with a fill attribute.
- **Single-quoted multi-byte string literals**. The lexer used to treat single-quoted runs as packed-number "char literals" with a hard 1–4 byte cap, which made the canonical lab-manual idiom `db 'Hello, world!$'` reject with "char literal must be 1–4 bytes". MASM treats the same source as a 14-byte string; we now match it. The threshold is unambiguous: length 1 still emits a `Number` (so `mov al, 'A'` continues to work as a single-byte immediate), length 2+ emits a `String` token identical to the double-quoted form. Programs that wanted the legacy packed form (`mov ax, 'AB'` = 0x4142) write the literal directly. Empty `''` is rejected. 4 new lexer unit tests cover all four cases (one-byte packed, multi-byte string, two-byte threshold, empty rejected); the single-quote string idiom assembles + runs end-to-end via the CLI.
- **Virtual filesystem + `INT 21h` file I/O subfunctions** (closes audit gaps GAP-104, GAP-105, GAP-106, GAP-107, GAP-108, GAP-109 — PR 7 of the lab-manual close-out plan; depends on PR 2 for the dispatcher extension). New `Vfs` (path → bytes hash map) and `FileHandle` (path + position + writable) on `Cpu`, plus a 5-slot reserved-handle prefix so `AH=3Ch` / `AH=3Dh` allocate from index 5 (matching DOS's stdin/stdout/stderr/aux/prn convention). The six file-I/O subfunctions — `AH=3Ch` create-or-truncate, `AH=3Dh` open with mode (0/1/2 = read/write/rw), `AH=3Eh` close, `AH=3Fh` read with handle position tracking, `AH=40h` write with file extension on the fly, `AH=41h` delete — all set/clear CF and return the documented DOS error codes (2 = file not found, 5 = access denied, 6 = invalid handle). `Emulator::load_source` now preserves host-injected fields (VFS, clock) across re-loads since they conceptually represent "external state" the program should see across runs (real machine = real disk and clock survive). Wasm-bindgen surface gains `vfs_put`, `vfs_get`, and `vfs_paths` so the IDE can drop a real file in, run the program, and read back what was created/written. Five new core unit tests cover: AH=3Ch handle allocation, AH=3Dh open-not-found error path, the canonical M1 Experiment 5 create→write→close→open→read→close round-trip, AH=41h delete + double-delete-not-found, AH=3Eh invalid-handle error. New wasm-api end-to-end test exercises `vfs_put` → `load_source` → `run` → `vfs_get`, asserting the host-injected file persists across the load.
- **`INT 33h` mouse + minor `INT 21h` subfunctions + `WAIT` / `INT 3` / `ESC` no-ops** (closes audit gaps GAP-002, GAP-003, GAP-110, GAP-111, GAP-112, GAP-113, GAP-114, GAP-115, GAP-300, GAP-301, GAP-302, GAP-303 — PR 6 of the lab-manual close-out plan). New `Mouse` struct on `Cpu` (position + button mask) and a `set_mouse` setter the IDE host calls when a lab program polls the mouse; INT 33h dispatches AH=00h (init: AX=0xFFFF, BX=2 buttons), 01h/02h (show/hide cursor — observable no-op), 03h (read CX=x, DX=y, BX=button-mask), with a "return AX=0 silently" path for unknown subfunctions. INT 21h grows AH=05h (printer — routes byte to port 0x378 so the existing virtual printer reconstructs it), 0Bh (stdin status: AL=0xFF when a key is pending), 0Ch (flush+read: clear FIFO then dispatch to the AL-named subfunction), 0Dh (disk reset stub), 1Ah (set-DTA — captures DS:DX into a new `dta` field for round-trip correctness), 2Bh (set-date — wired into the host clock so a subsequent AH=2Ah reads back the same fields), and 30h (DOS version: report 5.00). INT 16h adds AH=02h (shift state: returns 0 — no modifiers held). New stubs at the dispatcher level: INT 14h / 17h return AH=0 (no error); INT 25h / 26h set CF + AH=05h (access denied — we have no disk model); the two-byte `CD 03` and one-byte `CC` INT3 forms are recognised as no-ops so accidentally-stepped-on debugger traps don't error. Opcode-level prefix bytes: `WAIT` / `FWAIT` (0x9B) decodes as a no-op (was previously the unimplemented-canary opcode; the canary moved to 0x0F, the 286+ multi-byte prefix); `LOCK` (0xF0) was already absorbed in the prefix loop; x87 ESC opcodes (D8–DF) consume their mod-r/m + displacement and continue. 9 new core unit tests cover INT 21h AH=05h printer-routing + AH=0Bh status + AH=30h DOS version, INT 16h AH=02h shift state, INT 33h AH=00 / 03 with `set_mouse` host injection, the one-byte INT3 form, the WAIT no-op, and the LOCK-prefix consumption.
- **Lab-manual compatibility audit** ([`docs/lab-manual-audit.md`](docs/lab-manual-audit.md)). Four 8086 microprocessor lab manuals — Hashemite (M1), Gopalan (M2), Sri Indu (M3), BMSIT (M4) — were sourced via public web search (URLs + access dates recorded) and scanned for every assembly mnemonic, directive, expression operator, INT subfunction, and I/O port the printed programs use. Each finding is filed as a stable `GAP-NNN` row with severity, manual+program citation, and a target PR. The audit verdicts ~45% of the manuals' programs run today as written; the document maps the remaining 55% across 8 PRs (PR 0 builds the test corpus, PRs 1–8 close every gap individually — no item silently deferred). Tracker section is updated on every closing PR.
- **Honest compatibility matrix** ([`docs/emu8086-compatibility.md`](docs/emu8086-compatibility.md)). The previous version of this document overstated support — many ✅ rows described features that were planned but not implemented (`OFFSET`, `SEG`, `STRUC`, `LABEL`, `IF/ELSE/ENDIF`, the entirety of INT 10h, eleven INT 21h subfunctions, the `emu8086.inc` macro pack, the `--dialect=nasm` mode, the legacy port-200/201/202 mappings). Tables now use a four-state legend (✅ implemented / 🚧 partial / ❌ planned / — out of scope) and every ❌ row links to a `GAP-NNN` row in the audit. README's "Source compatibility with emu8086" section updated to match.
- **Run-status banner** in the IDE. After a successful run the output panel grows an inline banner: green "✓ Program halted" when the program reaches `HLT` / `INT 21h` fn `4Ch` / `INT 20h`, amber "⏱ Stopped at step limit" when the 1 M-step cap is hit without halting (the common cause: infinite loop, or a `RET` used as program exit instead of `HLT` / `INT 21h` fn `4Ch`). Closes the UX gap legacy emu8086 covered with a "Program completed" modal — students transitioning from the legacy product were silently confused by our quiet completion. Banner uses `role="status"` + `aria-live="polite"` so screen readers announce the state change without grabbing focus. Strings are i18n'd in both EN and ES (`Strings` interface extended).
- **MASM lab-manual idioms in the assembler** (`?`, `NAME DB`, implicit deref). Three fixes to make real student lab programs assemble without rewriting:
  - `db ?` / `dw ?` / `dd ?` parses as a zero-initialized cell. The lexer emits `?` as a one-character identifier; the parser's data-item branch reads it as `0` (which matches MASM's "uninitialized" semantics in our flat `.com` image where memory is already zero).
  - `NAME DB <items>` (and `DW` / `DD`) parses as the equivalent of `NAME: db <items>` — the standard MASM single-line data declaration used in 100% of lab manuals. Implementation: after the `EQU` check in `parse_line_into`, peeking a directive keyword (`db`/`dw`/`dd`) emits the label and falls through to the existing directive parser.
  - `MOV AL, NUM` (where `NUM DB 5`) implicitly promotes to `MOV AL, [NUM]`. A pre-pass collects label sizes via `collect_label_sizes` (Label-followed-by-Db/Dw), then `promote_implicit_memory_refs` rewrites matching `MOV` operands **only when widths match**: `MOV AL, NUM` (reg8 + DB) and `MOV AX, RESULT` (reg16 + DW) promote, but `MOV DX, MSG` where `MSG` is a byte string keeps the address-load form.
- **Responsive layout for phones and tablets**. The IDE shipped with a fixed `1fr/320px` desktop grid, so a phone viewport overflowed (source pane and the devices/watches/breakpoints/memory aside stacked, headings overlapped). New `packages/web/src/responsive.css` (imported from `main.tsx`) — CSS rather than React inline styles because inline styles can't carry `@media` queries. Three rules at `max-width: 760px`: the `.app-layout` grid collapses to a single column so source / output / registers / devices flow linearly; header dropdowns wrap below the title (theme + language selectors no longer overlap the `h1`); outer page padding tightens (1.5rem 2rem → 1rem 0.75rem) and the editor frame drops from 420 px to 280 px tall so output + registers aren't always below the fold. The `.device-row` class replaces an inline flex container so peripheral cards keep wrapping cleanly at any viewport width (unchanged on desktop).
- **GitHub Pages auto-deploy**. New `.github/workflows/deploy.yml` runs on every push to `main`: Rust toolchain → `wasm-pack build` → pnpm → Vite build, publishes the static bundle to GitHub Pages. Concurrency-gated so a newer push supersedes an older still-building deploy. `actions/configure-pages@v5` runs with `enablement: true` so the workflow self-bootstraps Pages on a fresh repo (no manual "Settings → Pages → Source = GitHub Actions" step required first). Vite config grows a `VITE_BASE` environment hook (default `"/"` for dev / custom-domain / self-host); the deploy workflow sets `VITE_BASE=/${{ github.event.repository.name }}/` so the same code can serve from the repo's sub-path on GitHub Pages without breaking script + wasm + manifest URLs. The PWA manifest's `scope` and `start_url` derive from the same constant. README's Quick Start grows a Deployment section.
- **IDE debugger polish** (M4 long-tail). New: **conditional breakpoints** (e.g. `AX == 5`, `ZF`, `IP == 0x108`) — the Run button auto-detects active breakpoints and switches to a JS-side step-loop that pauses on the first truthy predicate, with a heading-aware highlight on the source line execution paused at; **watch expressions** with the same syntax — register/flag/comparison atoms — value rendered next to each entry and updated after every step / run / step-back; **memory-diff highlighting** — bytes that changed since the last step render in amber, restoring the M4 deliverable that was missing; **drag-and-drop `.asm` file loading** onto the editor pane (1 MiB cap); **light/dark theme toggle** in the header (persisted via localStorage). New `packages/web/src/debugExpr.ts` carries the tiny expression evaluator (registers / 9 flag bits / hex+dec+binary literals / six comparison ops); new `DebuggerListPanel.tsx` is the shared add/remove list UI for both watches and breakpoints. Footer note refreshed to drop the "M4 arrives later" claim.
- **`INVOKE name`** in the assembler. Rewrites at preprocess time to `call name`, so the lab-manual idiom of calling a no-arg procedure with `invoke greet` just works. The argument-bearing form (`invoke proc, ax, 1`) raises a clear error rather than silently dropping args, since the 8086 calling convention is caller-managed and silent miscompilation would be the worst possible failure mode.
- **`mov r16, segreg`** (8C /r reg16 destination). The matching reverse direction of `mov segreg, r16` was already wired in the encoder, but the reg16-dest fast path fell through to label resolution when the source identifier was a segreg name (`mov bx, es` → `undefined label \`es\``). Fix is in the segreg-source branch of `emit_mov`; four-byte unit test coverage (`mov bx, es`, `mov cx, ds`, `mov dx, ss`, `mov si, cs`), and `tests/conformance/mov_forms.asm` extended to include the form.
- **Assembler encoder gaps closed** — `LEA` (8D /r), `XCHG` in all forms (86/87 mod-r/m + the 1-byte 90+rw accumulator form), memory-form `PUSH` / `POP` (FF /6 and 8F /0), and segment-override prefixes (`CS:` / `DS:` / `ES:` / `SS:` → 2E/3E/26/36) on bracketed memory operands. Programs can now use the natural `mov ax, es:[bx]` syntax instead of swapping DS at runtime; the corresponding instructions in the CPU core were already complete. The parser threads the override on `MemRef::seg_override`, the encoder emits the prefix byte before the instruction body in pass 2, and `instr_size` adds 1 to the byte count in pass 1 so label resolution stays correct. Ten new unit tests in the assembler + a new `tests/conformance/seg_overrides.asm` (4 prefix bytes hit) + extensions to `stack_ops.asm` (memory push/pop) and `mov_forms.asm` (LEA + XCHG round-trip) widen the conformance corpus to 12.
- **Printer peripheral** (LPT1-style). New `Emulator::printer_paper()` walks `out_log` for writes to port `0x378` and reconstructs the paper buffer (LF advances a line, FF clears the page, CR is dropped, non-printables render as `·`). Replaying from the start means `step_back` rolls the printout back too. New React `Printer` component renders the buffer in a paper-shaped panel; `examples/printer.asm` prints two lines through the port; wasm-api end-to-end test loads the example and asserts the resulting paper byte-for-byte.
- **Robot peripheral**. Single command port at `0x12` accepts: `0` stop, `1` forward, `2` backward, `3` turn left (CCW 90°), `4` turn right (CW 90°). `Emulator::robot_state()` reconstructs `(x, y, heading)` by replaying the log from start, and `robot_commands()` returns the total motion-command count. New React `Robot` component renders a 9×9 grid centered at the origin with a heading-aware robot sprite and a step counter. `examples/robot.asm` walks a closed square; wasm-api end-to-end test verifies the robot returns to `(0, 0, N)` after the four-side path.
- **Conformance corpus expanded** from 8 to 11 programs. New entries: `stack_ops.asm` (PUSH/POP reg16 + segregs + `push cs` + PUSHF/POPF), `flag_ops.asm` (CLC/STC/CMC/CLD/STD/CLI/STI/LAHF/SAHF), and `mov_forms.asm` (every MOV encoding the assembler emits — reg/imm 8 + 16, reg/reg, mem/reg, reg/mem, mem/imm 8 + 16, accumulator moffs A0-A3, `mov segreg, r16`). The integration test's count-agnostic assertion picks them up automatically.
- **Keyboard peripheral** (M4.2 long-tail). New `Cpu::push_key(byte)` enqueues an ASCII byte into a per-CPU FIFO; `IN AL, 0x60` drains one byte at a time, `IN AL, 0x64` reports a 1-bit "data available" status. The same FIFO backs INT 16h `AH=00h` (blocking read) and `AH=01h` (peek without consuming, ZF=1 when empty), plus INT 21h `AH=01h` (read with echo) and `AH=06h` with `DL=0xFF` (non-blocking read). Step-back recording captures bytes consumed during a step in the snapshot and re-prepends them on rewind, so time-travel debugging works across keystrokes too. New React `Keyboard` component captures DOM keyboard events inside a focused textbox and forwards printable ASCII + Enter/Backspace/Tab/Esc/Ctrl+C through `Emulator::push_key`. Comes with an `examples/keyboard.asm` polling-loop demo, an end-to-end wasm-api test that loads the example, pre-pushes "hi"+Ctrl+C, and asserts the echoed stdout, plus seven new core unit tests covering port drain, status bit, step-back restore, and every BIOS/DOS subfunction.
- **8×8 LED matrix peripheral** (M4.2c). Standard port layout: port 10 (`0x0A`) selects the row index (0..7), port 9 (`0x09`) latches the row's 8-bit pixel data. New `Emulator::led_matrix_rows()` walks `out_log` to reconstruct the full 8-byte row buffer, automatically honoring `step_back` truncation. New React `LedMatrix` component renders an 8×8 SVG circle grid in the IDE's devices panel, plus an `examples/led_matrix.asm` smiley-face program and a wasm-api unit test that verifies row reconstruction byte-for-byte.
- **Conformance corpus** (`tests/conformance/`). Eight feature-grouped 8086 programs (`arithmetic_full`, `bitwise`, `shifts_rotates`, `all_jcc`, `modrm_addressing`, `bcd_adjusts`, `call_ret`, `string_ops_full`) covering ADC/SBB, all three TEST encodings, every shift/rotate variant in both count forms, all 16 Jcc + LOOP family, the mod-r/m memory-operand combinations, the six BCD adjust opcodes, near CALL/RET with both register-passing and stack-frame conventions, and every string opcode with REP/REPE/REPNE prefixes. New CLI integration test (`conformance_corpus_all_pass`) runs `compat-report` over the corpus and asserts n-of-n pass; adding a new program to the directory widens the assertion automatically.
- **i18n extraction baseline**. All user-facing strings in `App.tsx` lifted into `src/i18n/`: a `Strings` interface (in `types.ts`) declaring every key, English and Spanish locale files (`en.ts`, `es.ts`), and a tiny `useStrings()` / `useLocaleId()` hook pair backed by a localStorage-persisted active locale (with `navigator.language` detection on first load). Adding a new language is now a single-file copy-then-translate. A small language picker in the IDE header lets the user switch live without reloading.
- **PWA / offline support**. `vite-plugin-pwa` registered with `autoUpdate` strategy: the service worker pre-caches the IDE shell + the wasm core (~370 KiB total across 9 entries), so once a student loads the page the IDE keeps working in airplane mode. Manifest declares standalone-display + theme color + svg icons (any + maskable variants). New `public/icon.svg` + `public/icon-maskable.svg` are simple "86" glyphs against the project's teal theme. Service worker registration is wired in `main.tsx` via `virtual:pwa-register`.
- **Text-mode screen peripheral** (DOS B800:0000). New `Emulator::video_text()` slices 4000 bytes from linear `0xB8000` and renders 25 lines × 80 columns of the character bytes (attribute bytes dropped for now; non-printable bytes become spaces). React `Screen` component renders the buffer as a monospace `<pre>`; it self-hides when the buffer is all-blank so non-video programs don't see an empty 80×25 wall. Includes `examples/screen.asm` writing "HELLO" near the top-left and a wasm-api unit test asserting `HI` lands at row 0 col 0..1 with the rest blank.
- **`mov segreg, reg16` / `mov reg16, segreg`** in the assembler. Encodes 8E /r and 8C /r respectively (`segreg_code()` maps ES=0/CS=1/SS=2/DS=3 into modrm.reg). The CHANGELOG already advertised "MOV family (incl. segregs)" but only the PUSH/POP segreg forms had been wired up; this completes the matching MOV forms so programs can swap DS/ES to address video memory or other segment-relative regions.
- **Stepper motor peripheral**. Standard 4-coil convention on port 7 (bits 0..3 = N/E/S/W coils). New `Emulator::stepper_steps()` returns the count of port-7 writes (so `step_back` rolls it back automatically). React `Stepper` component renders the four coils, a rotor pointing at the centroid of lit-coil unit vectors (handles wave drive *and* full-step), and a step counter. Includes `examples/stepper.asm` running 16 wave-drive steps and a wasm-api unit test asserting count + final pattern.
- **Self-host Dockerfile** (M6.x). Three-stage build: `rust:slim` runs `wasm-pack build`, `node:20-alpine` runs `pnpm --filter @modern8086/web build`, `nginx:1.27-alpine` serves the result. Final image is ~74 MB (alpine + the ~370 KB JS+wasm bundle). Quickstart: `docker build -t modern8086 . && docker run --rm -p 8080:80 modern8086`. Includes a `.dockerignore` so `target/`, `node_modules/`, and built artifacts don't ship in the build context.
- **`compat-report --exclude PATTERN`**. Repeatable CLI flag that filters files whose relative path contains the pattern as a substring. Common case: `m86 compat-report examples --exclude lib/` to drop include-only macro packs that assemble to zero bytes. Includes a CLI integration test that verifies the count drops and `lib/stdlib.asm` is no longer reported.
- **`step_back` stdout sync**. New `Emulator::stdout()` getter returns the full current console output; the IDE's `onBack` handler now replaces `result.stdout` with the synced view, so a `◀ Back` over a printing instruction visually un-prints its byte. Previously the rolled-back byte stayed on screen until the user clicked Reset.
- **`.MODEL` / `PROC` / `ENDP` directives**. The lab-manual idiom (`.MODEL SMALL`, `.STACK`, `.DATA`, `.CODE`, `ASSUME`, `END start`) now lex-and-drop cleanly through the macro preprocessor — they're no-ops for our flat `.com` image but every textbook starts with them. `name PROC [NEAR|FAR]` rewrites to `name:` (a label), and the matching `name ENDP` line is dropped; the body's `ret` provides the procedure exit. Recognition is anchored to statement start so an identifier like `proc_count` in operand position is unaffected. Includes `examples/proc_hello.asm` exercising the full scaffold and a CLI integration test.

### Highlights since the project bootstrap

- **M0 → M5 milestones** all shipped at alpha quality. M6/M7 require external infrastructure (institute pilot, code-signing, external a11y audit) and are tracked but not started.
- **`emu8086`** CLI: `assemble`, `run`, `run-asm`, `trace` (JSON), `grade` (YAML spec → JUnit XML), `compat-report` (corpus check), `version`. File-level `include "..."` resolution before assembly.
- **Web IDE**: Monaco editor with full 8086-asm syntax highlighting, snippets, hover docs, red-squiggle error markers, **Reset / ◀ Back / Step ▶ / Run** debugger backed by the stateful `Emulator` class (with diff-snapshot time travel), live register/flag/memory panels, **7-segment display**, **traffic-light**, and **8×8 LED matrix** peripherals, share-link button (base64url URL fragment), Ctrl/Cmd+Enter, localStorage autosave, example loader.
- **Composite GitHub Action** at `.github/actions/grade/` for drop-in GitHub Classroom integration.
- **emu8086.inc-style stdlib** (`examples/lib/stdlib.asm`) shipping `PUTC`, `NEWLINE`, `PRINT`, `PRINTN`, `GOTOXY`, `CLEAR_SCREEN` — all built on the assembler's `MACRO`/`ENDM` mechanism with pre-expansion at definition time so nested macros resolve cleanly.
- **11 working example programs** in `examples/`, each with an integration test asserting byte-for-byte output through the CLI: hello, sum, array_sum, streq, countdown, stackdemo, macro_putc, hello_macros, hello_include, seven_seg, traffic.

### Added

- **emu8086-core** — almost-complete 8086 emulator: register file with high/low aliasing, 1 MiB segmented memory with `seg:off → linear` translation, mod-r/m memory addressing with segment overrides, MOV family (incl. LEA, XCHG, segment registers, accumulator moffs), arithmetic + logical + shift/rotate groups with full 8086 flag math (CF/OF/SF/ZF/AF/PF), stack (PUSH/POP regs/segregs/flags/r/m), control flow (JMP, all 16 Jcc, LOOP family, JCXZ, near CALL/RET), string ops with REP/REPE/REPNE, MUL/IMUL/DIV/IDIV with DivideError trap, port I/O (IN/OUT) with `out_log`, software interrupts (INT n / IRET / INT 3) with DOS subset (INT 21h fn 01h, 02h, 06h, 09h, 4Ch; INT 20h). 98 unit tests.
- **emu8086-assembler** — lex + two-pass parse + encode. Mnemonics: MOV (reg/imm, reg/reg, reg/mem, mem/reg, mem/imm, segregs), the eight ALU ops with full mod-r/m memory operands, the seven shift/rotate ops by 1 or by CL, MUL/IMUL/DIV/IDIV, NEG/NOT, TEST in all forms (84/85, A8/A9, F6/F7), INT, PUSH/POP (incl. segregs), INC/DEC reg16, JMP/CALL near, all 16 Jcc, LOOP/LOOPE/LOOPNE/JCXZ, RET, single-byte flag/halt/no-op opcodes, CBW/CWD/LAHF/SAHF/XLAT/PUSHF/POPF, the ten string ops (movsb..scasw), REP/REPE/REPNE prefixes. Directives: `org`, `db`, `dw`, `equ`. Number bases: decimal, MASM hex (`0FFh`), binary (`1011b`), octal (`077o`), C-style hex (`0x10`). Char literals `'A'` (and 1-4 byte packed `'AB'`). Memory operands: `[bx]`, `[bx+si]`, `[bx+si+disp]`, `[label]`, `[direct16]`. Labels with forward references. Span-rich `rustc`-style diagnostics. 41 unit tests.
- **modern8086-cli (`emu8086`)** — `assemble`, `run`, `run-asm` (assemble + run in one step), `trace` (JSON step-by-step execution log — one record per instruction), `version`. Diagnostics rendered with file path, 1-based line:column, source line, and a caret on the offending span. 5 e2e tests.
- **emu8086-wasm-api** — wasm-bindgen surface that batches `compile_and_run(source, max_steps) -> JSON` so the browser can drive the whole pipeline through a single call. 2 unit tests.
- **Web IDE shell** — textarea editor, Run button, output panel, register dump (AX..SS, IP), flag badges (CF/PF/AF/ZF/SF/TF/IF/DF/OF), error callouts pinned to the offending source line.
- **Examples** — `examples/hello.asm` (DOS hello-world via INT 21h fn 09h), `examples/sum.asm` (1+…+10 = 55), `examples/array_sum.asm` (LODSB walk through a null-terminated byte array → 55), `examples/streq.asm` (REPE CMPSB → '='), `examples/countdown.asm` (`10 9 8 7 6 5 4 3 2 1`).
- **Documentation** — `README.md`, `ARCHITECTURE.md`, `ROADMAP.md` (M0-M7), `BUILD_PLAN.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/{pain-points,emu8086-compatibility,student-experience,educator-guide,adr/0001-tech-stack}.md`.
- **Tooling** — Cargo + pnpm workspaces, Rust toolchain pinned to stable, dprint, markdownlint config, `.editorconfig`. GitHub Actions CI: Rust on Linux/macOS/Windows (fmt + clippy + test + wasm32 target build), Web (rust toolchain + wasm-pack + pnpm typecheck/build/test), markdownlint.
- **Repository hygiene** — Issue templates (bug report, feature request, contact-links config), pull-request template.
