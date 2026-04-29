# Handoff — picking up `emu8086-modern` on a fresh dev box

This document is for the maintainer (you) coming back to the project on a different machine. It captures **everything you need to get a working WSL dev environment, run the project, understand what shipped, and decide what to do next.** Read it top to bottom once; after that, the per-section anchors are reasonable navigation.

Last commit at handoff: `837efc9` on `main` (CHANGELOG highlights). Repo: <https://github.com/abuXsarkar/emu8086-modern>.

---

## TL;DR — get running on a fresh WSL Ubuntu box in 8 minutes

```bash
# 0. WSL Ubuntu 24.04 (or any Linux) prerequisites
sudo apt update
sudo apt install -y build-essential pkg-config curl git

# 1. Rust (stable). Installs into $HOME/.cargo, no sudo needed.
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
  --default-toolchain stable --target wasm32-unknown-unknown \
  --profile minimal --component rustfmt --component clippy
source "$HOME/.cargo/env"   # picks up cargo on PATH for this shell
echo 'source "$HOME/.cargo/env"' >> ~/.bashrc

# 2. Node 20 + pnpm. Node 18 also works for builds but throws a soft engine warning.
# If your distro Node is < 20, install via nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20 && nvm use 20
# pnpm via npm (avoids corepack quirks):
npm config set prefix ~/.local
npm install -g pnpm@9.12.0
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"

# 3. wasm-pack (for the browser IDE). Either of these works:
cargo install wasm-pack --locked
# or download the prebuilt binary from rustwasm.github.io if cargo install is slow

# 4. gh CLI (optional, for pushing/PRs). Either:
sudo apt install -y gh
# or grab the tarball into ~/.local/bin:
curl -fsSL https://github.com/cli/cli/releases/latest/download/gh_2.62.0_linux_amd64.tar.gz \
  | tar -xz -C /tmp
mkdir -p ~/.local/bin && cp /tmp/gh_*_linux_amd64/bin/gh ~/.local/bin/gh

# 5. Clone + first build
git clone https://github.com/abuXsarkar/emu8086-modern.git
cd emu8086-modern
git config user.name "Abu Sufian Sarkar"
git config user.email "abu@cyberdude.com"

# 6. Sanity check — should be all green
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings

# 7. Run a sample program through the CLI
cargo run -p emu8086-cli -- run-asm examples/hello.asm
# → Hello, world!

# 8. Build + serve the web IDE
pnpm install
wasm-pack build packages/wasm-api --target web --out-dir pkg --release
pnpm --filter @emu8086/web dev   # → http://localhost:5173
```

If you want gh auth without leaving the shell: `gh auth login --hostname github.com --git-protocol https --web` — then it'll pick up a fresh device-flow token and `gh auth setup-git` wires the credential helper for `git push`.

If pushing workflow files (anything under `.github/workflows/`) requires `workflow` scope: `gh auth refresh -h github.com -s workflow`.

---

## What's in this repo

```
emu8086-modern/
├── Cargo.toml              # workspace root
├── package.json            # pnpm workspace root
├── pnpm-workspace.yaml
├── rust-toolchain.toml     # pinned to stable
├── README.md               # public-facing summary
├── ARCHITECTURE.md         # design — read this for the why
├── ROADMAP.md              # M0..M7 with status flags after this run
├── BUILD_PLAN.md           # week-by-week schedule and risks
├── CHANGELOG.md            # what's shipped
├── CONTRIBUTING.md / SECURITY.md / CODE_OF_CONDUCT.md
├── HANDOFF.md              # ← this document
├── docs/
│   ├── adr/0001-tech-stack.md
│   ├── educator-guide.md   # GitHub Classroom integration etc
│   ├── pain-points.md      # the legacy-emu8086 comparison
│   ├── emu8086-compatibility.md
│   └── student-experience.md
├── packages/
│   ├── core/         # emu8086-core   (Rust 8086 CPU, compiles to wasm)
│   ├── assembler/    # emu8086-assembler  (lex + macro preprocess + parse + encode)
│   ├── wasm-api/     # emu8086-wasm-api   (wasm-bindgen surface for the IDE)
│   ├── cli/          # emu8086-cli        (assemble, run, run-asm, trace, grade, compat-report)
│   ├── devices/      # rust + ts (placeholder; React device components live in web/)
│   └── web/          # @emu8086/web       (React + Vite + Monaco IDE)
├── examples/         # 11 working .asm programs + lib/stdlib.asm
│   ├── lib/stdlib.asm     # PUTC / NEWLINE / PRINT / PRINTN / GOTOXY / CLEAR_SCREEN
│   ├── hello.asm
│   ├── sum.asm                 → "55"
│   ├── array_sum.asm           → "55" via LODSB
│   ├── streq.asm               → "=" via REPE CMPSB
│   ├── countdown.asm           → "10 9 8 7 6 5 4 3 2 1 "
│   ├── stackdemo.asm           → "321"
│   ├── macro_putc.asm          → "Hi" via inline macro
│   ├── hello_macros.asm        → "Hello via macros!"
│   ├── hello_include.asm       → "Hello via include!" (uses `include`)
│   ├── seven_seg.asm           → lights all 7 segments of port 199
│   ├── traffic.asm             → N/S green, E/W red on port 4
│   ├── led_matrix.asm          → smiley on the 8×8 LED matrix (ports 9 + 10)
│   ├── proc_hello.asm          → ".MODEL SMALL"/PROC/ENDP/END idiom, prints "Hello from PROC!"
│   └── assignments/sum10/      → autograder sample (spec.yml + submission.asm)
├── tests/            # cross-package conformance harnesses (not yet populated)
└── .github/
    ├── workflows/ci.yml          # Rust + web + markdownlint matrix
    ├── actions/grade/action.yml  # composite Action for GH Classroom
    ├── ISSUE_TEMPLATE/
    └── pull_request_template.md
```

---

## Status — what's shipped, what isn't

### Shipped at alpha

| Layer | What works |
|---|---|
| **emu8086-core** | Mainline 8086 ISA: registers (with high/low aliasing), 1 MiB segmented memory + mod-r/m, MOV family (incl. LEA, XCHG, segregs, accumulator moffs, LDS/LES), arithmetic with full flag math (CF/OF/SF/ZF/AF/PF), logical, shifts/rotates, stack, control flow (all 16 Jcc + LOOP family + JCXZ + near *and* far CALL/RET/JMP), string ops with REP/REPE/REPNE, MUL/IMUL/DIV/IDIV with DivideError trap, port I/O, software interrupts including DOS INT 21h subset (01h/02h/06h/09h/4Ch), BCD adjusts (DAA/DAS/AAA/AAS/AAM/AAD). **Time-travel debugger** via diff-snapshot `step_back`. ~110 unit tests. |
| **emu8086-assembler** | Lex + macro preprocess + 2-pass parse + encode for nearly every M1 mnemonic. Directives: `org`, `db`, `dw`, `equ`, `dup`, `BYTE PTR`/`WORD PTR`, plus the MASM-style scaffold (`.MODEL`, `.STACK`, `.DATA`, `.CODE`, `.STARTUP`, `.EXIT`, `ASSUME`, `END`) which is dropped as a no-op, and `name PROC [NEAR\|FAR] ... name ENDP` blocks which collapse into labeled blocks. User-defined `MACRO`/`ENDM` with positional args, pre-expansion at definition site, `@@`-label uniquing per call. Mod-r/m memory operands like `[bx+si+disp]`. Labels with forward references. ~55 unit tests. |
| **emu8086-cli** | `assemble`, `run`, `run-asm`, `trace` (JSON), `grade` (YAML spec → JUnit XML), `compat-report`, `version`. File-level `include "..."` resolution. ~10 e2e tests. |
| **emu8086-wasm-api** | `compile_and_run`, stateful `Emulator` class with `load_source`/`step`/`step_back`/`run`, `port_byte`, `memory_hex`. |
| **Web IDE (@emu8086/web)** | Monaco editor with 8086-asm syntax highlighting, snippets (8 idioms), hover docs (~80 mnemonics), red-squiggle error markers, example loader, localStorage autosave, share-link button (base64url URL fragment), Ctrl/Cmd+Enter, **Reset / ◀ Back / Step ▶ / Run** debug controls, current-IP line highlight that follows source, register/flag/memory hex panels, **7-segment display** + **traffic-light** + **8×8 LED matrix** peripherals updating live as you step. |
| **CI** | Rust on Linux/macOS/Windows × fmt + clippy + tests + wasm32 build; web typecheck/build/test; markdownlint. All green at the time of writing. |
| **Composite GitHub Action** | `.github/actions/grade/action.yml` — drop-in for GitHub Classroom assignments. |

Total tests: **22 test groups, ~200+ tests workspace-wide, all passing.**

### Pending — concrete next chunks

In priority order if I were continuing:

1. **Stepper motor + screen + keyboard peripherals** (M4.2 long tail). Same shape as the existing devices.
2. **Conformance corpus** (M1 exit criterion). Walk legacy emu8086 sample programs (the public-domain ones), assemble them via `emu8086 compat-report`, fix any divergences, commit them under `tests/conformance/`.
3. **Self-host Docker image** (M6.x). A multi-stage `Dockerfile`: stage 1 builds the wasm-api + web; stage 2 is `nginx:alpine` serving `packages/web/dist/`. ~30 lines.
4. **PWA / service worker**. Vite has a plugin (`vite-plugin-pwa`) that adds offline caching with one config line. Useful for "Chromebook in airplane mode" labs.
5. **i18n extraction** (M6 deliverable). All UI strings in `packages/web/src/App.tsx` go through a key/value lookup table; baseline English file plus one or two translations.
6. **External work that requires real-world infrastructure** (M6/M7): institute pilot, external a11y audit, code-signing for desktop, trademark review. None of these are doable from a chat session — they need a partner.

### Known minor gaps / nits

- The `traffic.asm` and `seven_seg.asm` example tests are smoke (they don't currently capture port state via the CLI). They run cleanly but the integration test only asserts they assemble + halt cleanly. To actually verify device state via the CLI, expose `out_log` from the wasm-api to the CLI, or add a `--port-snapshot` JSON dump.
- `step_back`'s stdout truncation is "best-effort" in the IDE — the wasm-api strips bytes correctly on the core side, but the React state's accumulated `result.stdout` doesn't get re-synced after every back-step (a step that printed a byte will visually leave the byte until you Reset). Easy fix: have `step_back` return the post-step stdout directly so the IDE can replace, not append.
- The `compat-report` walks `examples/` recursively, which means `examples/lib/stdlib.asm` gets included in the corpus. It currently passes (assembles to 0 bytes — all macros, no instructions) but it's a slightly weird signal. Either add a `.compat-ignore` mechanism or have compat-report skip files that match `lib/*.asm`.
- The README claims "200+ tests" — actual is around 200, but the precise count creeps up commit-to-commit. If you care about tightness, parameterize via a small `cargo xtask count-tests` script.

---

## How the pieces connect

```
                     ┌──────────────────────────────────────┐
                     │              packages/web            │
                     │  React + Vite + Monaco editor        │
                     │                                      │
                     │  imports ../wasm-api/pkg/*.js        │
                     └──────────────┬───────────────────────┘
                                    │ wasm-bindgen calls
                                    ▼
                  ┌─────────────────────────────────────┐
                  │         packages/wasm-api           │
                  │  Emulator class + compile_and_run   │
                  │  (re-exports core + assembler)      │
                  └────────┬─────────────────┬──────────┘
                           │                 │
                           ▼                 ▼
              ┌────────────────────┐   ┌─────────────────────┐
              │ packages/core      │   │ packages/assembler  │
              │ Cpu / Memory /     │   │ lex → preprocess →  │
              │ step / step_back   │   │ parse → encode      │
              └─────────▲──────────┘   └────────────▲────────┘
                        │                            │
                        └─────── packages/cli ───────┘
                            assemble / run / run-asm /
                            trace / grade / compat-report
```

Source-map and includes flow `cli` → `assembler`. The web IDE's per-step source highlight is driven by `AssembledImage::line_map`, surfaced via `wasm-api`, walked by `App.tsx::lineForIp`.

---

## Concrete recipes

### Run every example

```bash
for f in examples/*.asm; do
  case "$f" in *lib*) continue ;; esac
  echo "==== $f ===="
  cargo run -p emu8086-cli --quiet -- run-asm "$f"
  echo
done
```

### Run the autograder

```bash
cargo run -p emu8086-cli -- grade \
  examples/assignments/sum10/spec.yml \
  examples/assignments/sum10/submission.asm \
  --junit /tmp/sum10.xml
cat /tmp/sum10.xml
```

### Open the IDE

```bash
pnpm install
wasm-pack build packages/wasm-api --target web --out-dir pkg --release
pnpm --filter @emu8086/web dev
```

The dev server defaults to `http://localhost:5173`. To produce a static build for a server: `pnpm --filter @emu8086/web build` → `packages/web/dist/`.

### Run all tests

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
pnpm typecheck
pnpm -r build
```

### Pick up a new peripheral

```bash
# All three current peripherals share the same shape — read one to learn it:
$EDITOR packages/web/src/SevenSegment.tsx   # one byte → seven segments
$EDITOR packages/web/src/TrafficLight.tsx   # one byte → 8 lamps in a layout
$EDITOR packages/web/src/LedMatrix.tsx      # walks out_log for a row buffer
$EDITOR packages/web/src/App.tsx            # refreshDevices polls each one

# For a stateful device that needs full out_log replay (matrix, screen,
# keyboard buffer), add a Vec-returning method on Emulator that walks
# self.cpu.out_log; LedMatrix::led_matrix_rows is the worked example.
```

---

## Author / git config

The repository is configured per-project to author commits as **Abu Sufian Sarkar <abu@cyberdude.com>** (no AI attribution in commit messages). On a fresh clone, set this explicitly:

```bash
cd emu8086-modern
git config user.name "Abu Sufian Sarkar"
git config user.email "abu@cyberdude.com"
```

Don't change the global git config — only the per-repo one.

---

## Last 10 commits at handoff

```
837efc9 docs(CHANGELOG): post-M5 highlights at the top of Unreleased
d7dcbde docs(ROADMAP): mark M0-M5 shipped, M6-M7 deferred to external infra
396331e feat(cli,examples): file-level `include "path"` resolution
fff7f98 feat(assembler,examples): macros pre-expand at definition; emu8086.inc-style stdlib
7b7e02e feat(cli): compat-report subcommand — institute corpus check
2e7bcb7 docs(README): post-M5 — covers macros, autograder, GH Action, share-links, devices
318b7fb feat(web): M5.3 — share-links via URL fragment
ee089c1 feat(ci,docs): M5.2 — composite GitHub Action for the autograder
29ef922 feat(cli): M5.1 — autograder subcommand with YAML spec + JUnit XML
cb89ea6 feat(assembler,examples): M2.6 — macro support (name MACRO/ENDM)
```

Run `git log --oneline | head -60` for a fuller picture; every commit since the bootstrap is on `main`, no branches to merge, no stashes.

---

## When in doubt

- For "where is X built": `ARCHITECTURE.md` is the design doc, `BUILD_PLAN.md` the schedule, `ROADMAP.md` the milestone tracker.
- For "what was the legacy emu8086 problem we wanted to solve": `docs/pain-points.md`.
- For "how do educators adopt this": `docs/educator-guide.md`.
- For "is this dialect quirk supported": `docs/emu8086-compatibility.md`.

Welcome back. Cheers.
