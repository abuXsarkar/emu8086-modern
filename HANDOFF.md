# Handoff — picking up `modern8086` on a fresh dev box

This document is for the maintainer (you) coming back to the project on a different machine. It captures **everything you need to get a working WSL dev environment, run the project, understand what shipped, and decide what to do next.** Read it top to bottom once; after that, the per-section anchors are reasonable navigation.

Last commit at handoff: `52bce97` on `main` (squash-merge of PR #1 — LED matrix, .MODEL/PROC/ENDP, Docker, IDE polish, conformance corpus). Repo: <https://github.com/abuXsarkar/modern8086>.

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
git clone https://github.com/abuXsarkar/modern8086.git
cd modern8086
git config user.name "Abu Sufian Sarkar"
git config user.email "abu@cyberdude.com"

# 6. Sanity check — should be all green
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings

# 7. Run a sample program through the CLI
cargo run -p modern8086-cli -- run-asm examples/hello.asm
# → Hello, world!

# 8. Build + serve the web IDE
pnpm install
wasm-pack build packages/wasm-api --target web --out-dir pkg --release
pnpm --filter @modern8086/web dev   # → http://localhost:5173
```

If you want gh auth without leaving the shell: `gh auth login --hostname github.com --git-protocol https --web` — then it'll pick up a fresh device-flow token and `gh auth setup-git` wires the credential helper for `git push`.

If pushing workflow files (anything under `.github/workflows/`) requires `workflow` scope: `gh auth refresh -h github.com -s workflow`.

---

## What's in this repo

```
modern8086/
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
│   ├── cli/          # modern8086-cli        (assemble, run, run-asm, trace, grade, compat-report)
│   ├── devices/      # rust + ts (placeholder; React device components live in web/)
│   └── web/          # @modern8086/web       (React + Vite + Monaco IDE)
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
│   ├── stepper.asm             → 16-step wave drive on the 4-coil stepper (port 7)
│   ├── screen.asm              → writes "HELLO" to text-mode video memory (B800:0000)
│   ├── keyboard.asm            → polls ports 0x60/0x64 and echoes each pushed key
│   ├── printer.asm             → prints "HELLO" / "PRINTER" via the LPT1 data port (0x378)
│   ├── robot.asm               → walks a closed square via motion commands (port 0x12)
│   ├── proc_hello.asm          → ".MODEL SMALL"/PROC/ENDP/END idiom, prints "Hello from PROC!"
│   └── assignments/sum10/      → autograder sample (spec.yml + submission.asm)
├── tests/
│   └── conformance/  # 12 feature-grouped 8086 programs — regression net for the assembler
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
| **emu8086-assembler** | Lex + macro preprocess + 2-pass parse + encode for nearly every M1 mnemonic — incl. LEA, the three XCHG forms (mod-r/m + 90+rw accumulator), memory-form PUSH/POP, segment-override prefixes (`CS:` / `DS:` / `ES:` / `SS:`) on bracketed memory operands, and both directions of `mov segreg, r16` / `mov r16, segreg`. Directives: `org`, `db`, `dw`, `equ`, `dup`, `BYTE PTR`/`WORD PTR`, plus the MASM-style scaffold (`.MODEL`, `.STACK`, `.DATA`, `.CODE`, `.STARTUP`, `.EXIT`, `ASSUME`, `END`) which is dropped as a no-op, and `name PROC [NEAR\|FAR] ... name ENDP` blocks which collapse into labeled blocks. User-defined `MACRO`/`ENDM` with positional args, pre-expansion at definition site, `@@`-label uniquing per call. Mod-r/m memory operands like `[bx+si+disp]`. Labels with forward references. ~66 unit tests. |
| **modern8086-cli** | `assemble`, `run`, `run-asm`, `trace` (JSON), `grade` (YAML spec → JUnit XML), `compat-report`, `version`. File-level `include "..."` resolution. ~10 e2e tests. |
| **emu8086-wasm-api** | `compile_and_run`, stateful `Emulator` class with `load_source`/`step`/`step_back`/`run`, `port_byte`, `memory_hex`. |
| **Web IDE (@modern8086/web)** | Monaco editor with 8086-asm syntax highlighting, snippets (8 idioms), hover docs (~80 mnemonics), red-squiggle error markers, example loader, localStorage autosave, share-link button (base64url URL fragment), Ctrl/Cmd+Enter, **Reset / ◀ Back / Step ▶ / Run** debug controls, current-IP line highlight that follows source, register/flag/memory hex panels, **7-segment display** + **traffic-light** + **8×8 LED matrix** + **stepper motor** + **text-mode screen** (B800:0000, 80×25, monochrome) + **keyboard input** (focused textbox feeds the FIFO at ports 0x60/0x64) + **LPT1 printer** (port 0x378) + **robot** (port 0x12, 9×9 grid) peripherals updating live as you step. |
| **CI** | Rust on Linux/macOS/Windows × fmt + clippy + tests + wasm32 build; web typecheck/build/test; markdownlint. All green at the time of writing. |
| **Composite GitHub Action** | `.github/actions/grade/action.yml` — drop-in for GitHub Classroom assignments. |

Total tests: **27 test groups, ~215 tests workspace-wide, all passing.**

### Pending — concrete next chunks

In priority order if I were continuing:

1. **Expand the conformance corpus with public-domain programs** from real-world sources (lab manuals, community repos). The current 12 programs are synthesized to cover the assembler's surface; they're a regression net for what we already encode, not an external compatibility check — and adding the external corpus would need network access to community repos that's outside what a chat session can do reliably.
2. **External work that requires real-world infrastructure** (M6/M7): institute pilot, external a11y audit, code-signing for desktop, trademark review. None of these are doable from a chat session — they need a partner.

### Known minor gaps / nits

- The `traffic.asm` and `seven_seg.asm` example tests are smoke (they don't currently capture port state via the CLI). They run cleanly but the integration test only asserts they assemble + halt cleanly. To actually verify device state via the CLI, expose `out_log` from the wasm-api to the CLI, or add a `--port-snapshot` JSON dump. (The new `led_matrix.asm` does have a wasm-api unit test that covers row state, so it's a step ahead of the other two.)
- `compat-report` now accepts repeatable `--exclude PATTERN` (substring match against the relative path), so the standard `--exclude lib/` invocation drops include-only macro packs from the corpus. The default walk still pulls them in — that was deliberate, since hard-coding "skip lib/" would surprise anyone using the dir for something else.
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
  cargo run -p modern8086-cli --quiet -- run-asm "$f"
  echo
done
```

### Run the autograder

```bash
cargo run -p modern8086-cli -- grade \
  examples/assignments/sum10/spec.yml \
  examples/assignments/sum10/submission.asm \
  --junit /tmp/sum10.xml
cat /tmp/sum10.xml
```

### Open the IDE

```bash
pnpm install
wasm-pack build packages/wasm-api --target web --out-dir pkg --release
pnpm --filter @modern8086/web dev
```

Or, with no host toolchain at all, ship the production build through Docker:

```bash
docker build -t modern8086 .
docker run --rm -p 8080:80 modern8086
# → http://localhost:8080
```

The Dockerfile is multi-stage (rust → node → nginx) and final image lands ~74 MB.

The dev server defaults to `http://localhost:5173`. To produce a static build for a server: `pnpm --filter @modern8086/web build` → `packages/web/dist/`.

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
$EDITOR packages/web/src/Keyboard.tsx       # input device — DOM keys → push_key(byte)
$EDITOR packages/web/src/Printer.tsx        # paper buffer reconstructed from out_log
$EDITOR packages/web/src/Robot.tsx          # (x,y,heading) reconstructed from out_log
$EDITOR packages/web/src/App.tsx            # refreshDevices polls each one

# For a stateful output device that needs full out_log replay (matrix,
# screen), add a Vec-returning method on Emulator that walks
# self.cpu.out_log; LedMatrix::led_matrix_rows is the worked example.
# For an input device, add a `push_*` method on Cpu that mutates state;
# the keyboard FIFO is the worked example (with step_back support via
# Snapshot::keys_popped).
```

---

## Author / git config

The repository is configured per-project to author commits as **Abu Sufian Sarkar <abu@cyberdude.com>** (no AI attribution in commit messages). On a fresh clone, set this explicitly:

```bash
cd modern8086
git config user.name "Abu Sufian Sarkar"
git config user.email "abu@cyberdude.com"
```

Don't change the global git config — only the per-repo one.

---

## Recent history at handoff

PR #1 (`Resume handoff: LED matrix, .MODEL/PROC/ENDP, Docker, IDE polish`) was squash-merged into `main` as `52bce97`, bundling the following work:

- 8×8 LED matrix peripheral (M4.2c).
- `.MODEL` / `.STACK` / `.DATA` / `.CODE` / `.STARTUP` / `.EXIT` / `ASSUME` / `END` directives + `PROC` / `ENDP` blocks (assembler).
- `step_back` stdout sync in the IDE.
- `compat-report --exclude PATTERN`.
- Self-host Dockerfile (~74 MB final image).
- Stepper motor peripheral.
- Text-mode screen peripheral (B800:0000) + `mov segreg/reg16` assembler forms.
- PWA / offline support via `vite-plugin-pwa`.
- i18n extraction baseline (English + Spanish).
- 8-program conformance corpus under `tests/conformance/`.

Run `git log --oneline | head -60` for a fuller picture; every commit since the bootstrap is on `main`, no stashes.

---

## When in doubt

- For "where is X built": `ARCHITECTURE.md` is the design doc, `BUILD_PLAN.md` the schedule, `ROADMAP.md` the milestone tracker.
- For "what was the legacy emu8086 problem we wanted to solve": `docs/pain-points.md`.
- For "how do educators adopt this": `docs/educator-guide.md`.
- For "is this dialect quirk supported": `docs/emu8086-compatibility.md`.

Welcome back. Cheers.
