# User manual

A single-page reference for the IDE, the CLI, and how the pieces fit
together. The on-screen [in-app tutorials](#in-app-tutorials) cover the
language itself; this document is more of a tour map.

> **Looking for something specific?**
>
> - The assembly language and emulator semantics: [`docs/emu8086-compatibility.md`](emu8086-compatibility.md).
> - GitHub Classroom + autograder: [`docs/educator-guide.md`](educator-guide.md).
> - Classroom mode (live sessions, hand-raise, comments): [`docs/classroom-mode.md`](classroom-mode.md).
> - Architecture and internals: [`ARCHITECTURE.md`](../ARCHITECTURE.md).
> - Roadmap and what's planned next: [`ROADMAP.md`](../ROADMAP.md).

---

## 1. The 60-second tour

Open the IDE. You'll see four regions:

| Region | What's in it |
|---|---|
| Header | App title; theme toggle; language picker; classroom pill |
| Left rail (desktop) | Example picker; file-drop hint |
| Center | Editor toolbar (Reset, ◀ Back, Step ▶, Run, Share); Monaco editor; output panel |
| Right rail | Registers; flags; devices; memory hex; debugger (watches, breakpoints) |

A **Tutorials** button (`📖`) lives in the bottom-right. A **Tweaks**
gear (`⚙`) sits next to it for appearance settings (density, layout,
accent, paper-grain, optional opt-in local metrics).

Want the shortest possible getting-started? Pick *hello* from the
example dropdown and press **Run**. You should see `hello` in the
output panel.

---

## 2. The editor

The editor is Monaco with an 8086-asm language definition wired in:

- **Syntax highlighting** for instructions, registers, directives,
  number literals, char literals, strings, and labels.
- **Snippets** for the eight or so most-typed idioms (typing `mov`
  then Tab cycles a few mnemonic templates).
- **Hover docs** on most mnemonics — hover any instruction to see a
  one-line summary.
- **Red squiggles** on assemble errors, with the message attached
  to the offending span. `Reset` and `Step` both surface the error
  inline in the output region too.

**Themes:** Light (paper) and Dark, toggled from the header. The
theme also drives the editor: light → `emu-paper` (tokens map to
the IDE's accent colors); dark → `emu-paper-dark`.

**File drop:** drag any `.asm` file (under 1 MiB) onto the editor
frame and its contents replace the buffer. Large files are rejected
with an inline toast.

**Persistence:** the editor's buffer auto-saves to `localStorage` on
every edit. A page refresh comes back to your last state. A
share-link in the URL (`#code=…`) takes precedence over the saved
buffer.

---

## 3. Running programs

Five buttons on the toolbar:

- **Load example…** swap the buffer for one of the built-in
  programs (`hello`, `sum`, `array_sum`, `streq`, `countdown`,
  `stackdemo`, `macro_putc`, `hello_macros`, `hello_include`,
  `seven_seg`, `traffic`, `led_matrix`, `stepper`, …). Picking one
  resets the stepper.
- **Reset** re-assembles the source and points the stepper at
  instruction 0. Doesn't auto-run.
- **◀ Back** rewinds one instruction. The full register file, flag
  word, memory, and stdout buffer roll back. See §6.
- **Step ▶** runs exactly one instruction. If the stepper hasn't
  been initialized, the first **Step** assembles + lands at the
  entry point.
- **Run (Ctrl/Cmd+Enter)** runs to completion, hits `HLT` / `INT
  21h fn 4Ch`, hits a breakpoint, or trips the 1,000,000-step cap
  (status banner: *Stopped at step limit*).
- **↗ Share** base64url-encodes the editor buffer into a URL
  fragment and copies the link.

A toast at the top of the editor confirms transient actions —
*link copied*, *reset — back at instruction 0*, *fix the errors
before stepping*, etc.

---

## 4. Registers and flags

The right rail shows all 13 named registers (`AX BX CX DX SI DI BP
SP IP CS DS ES SS`) in hex. They update live between steps and
during the run.

Flag badges below show `CF PF AF ZF SF TF IF DF OF`. A lit badge
means the flag is currently set after the most recent
flag-affecting instruction. `CMP` sets flags without storing the
result — the canonical conditional-jump pattern.

For more on register semantics: [`emu8086-compatibility.md`](emu8086-compatibility.md).

---

## 5. Devices

Eight peripherals are emulated. Each updates on every step the
program writes to its port:

| Device | Port(s) | Notes |
|---|---|---|
| Traffic light | 4 | Bits 0..2 = red / yellow / green |
| Stepper motor | 7 | Bits 0..3 = N/E/S/W coils; rotor renders the centroid |
| LED matrix 8×8 | 8–15 | One row per port |
| 7-segment display | 199 (0xC7) | Bits 0..7 = segments + decimal point |
| Keyboard | 0x60 / 0x64 | Focused textbox feeds the FIFO |
| Printer (LPT1) | 0x378 | Append-only paper roll |
| Robot | 0x12 | 9×9 grid; bytes are commands |
| Text screen | mem-mapped B800:0000 | 80×25 monochrome via INT 10h |
| Buzzer (example plugin) | 200 (0xC8) | Pulses on write; optional sound |

Want to add another device? See [`docs/plugin-sdk.md`](plugin-sdk.md) — TypeScript-only, no Rust changes.

Each device has an **↗ pop out** button to detach into a draggable
floating window. The window's position persists per device. Arrow
keys nudge the focused floater for keyboard a11y (Shift = 64 px
jump).

---

## 6. The time-travel debugger

Three controls cooperate:

- **Step ▶** advances one instruction. The history is kept inside
  the emulator core as a diff snapshot per step.
- **◀ Back** rewinds. The register file, flag word, memory, and
  stdout buffer reset to the pre-step values. **Step ▶** after a
  **Back** re-executes the same instruction.
- **Reset** discards the history entirely.

Two persistent debug surfaces on the right rail:

**Watches.** Add expressions that evaluate after every step. The
expression language covers register references (`AX`, `IP`), memory
loads (`[100h]`, `[BX+2]`), flag references (`ZF`, `CF`), arithmetic
(`AX + BX`), and comparisons (`AX == 0`, `CX > 10`). Expressions
persist in `localStorage`.

**Breakpoints.** Same expression language, used as a stop predicate
during **Run**. Execution pauses at the first step where any
predicate is truthy. The toast names the offending breakpoint and
the source line is highlighted. Useful: `IP == 0x108`, `[100h] !=
0`, `CF == 1 && ZF == 0`.

---

## 7. Sharing and classroom mode

**Share-links** are URL fragments — the encoded buffer rides inside
the `#code=` hash. No server, no expiry, no telemetry. Recipients
open the link and the IDE decodes the fragment back into the
editor on load. The share-link wins over any locally-saved buffer.

**Classroom mode** is a separate live-session feature, opened from
the "Classroom" pill in the header. A teacher creates a room
(`color-animal-NN` code); students join with code + roll number.
Once in:

- Teacher sees a roster, can broadcast their screen, take control
  of any student's editor, leave per-student notes, kick.
- Student sees a read-only "Following teacher" pane when the
  teacher broadcasts, can raise/lower their hand, submit current
  code, read the teacher's notes.
- At end-of-class the teacher can print a session summary (A4
  attendance + activity sheet) or export CSV.

Full reference: [`docs/classroom-mode.md`](classroom-mode.md).

---

## 8. Internationalization

The IDE ships with translations in 13 languages: English, Spanish,
Bengali, Assamese, Hindi, Tamil, Telugu, Gujarati, Marathi,
Kannada, Malayalam, Punjabi, Odia. The language picker is in the
header; the selection persists across reloads.

Locales fall back to English for any string that hasn't been
translated yet — adding a key only requires updating `en.ts`. To
contribute a translation, copy `packages/web/src/i18n/en.ts` and
translate as much as you like; the build will not fail on missing
keys.

---

## 9. The CLI

A native `emu8086` binary mirrors the in-browser experience for
batch / autograder / CI use:

```bash
# Assemble + run a single file
m86 run-asm examples/hello.asm

# Just assemble (writes a flat .com-style binary to stdout)
m86 assemble examples/hello.asm > hello.bin

# Trace execution as JSON, one record per instruction
m86 trace examples/sum.asm

# Run an autograder spec against a submission
m86 grade spec.yml student-submission.asm

# Sweep a corpus and report which files assembled cleanly
m86 compat-report examples/ --exclude lib/
```

The `grade` subcommand is the heart of the autograder story.
A spec is a small YAML file declaring expected stdout, exit codes,
register values at exit, and optional timeouts. Output is human
readable by default, JUnit XML with `--junit` for CI runners.

Full grader docs + an example spec: [`docs/educator-guide.md`](educator-guide.md).

---

## 10. The desktop app

The `pnpm desktop:dev` / `pnpm desktop:bundle` commands build a
native Tauri 2 shell hosting the same web IDE on Linux, macOS, and
Windows. Bundles land in `packages/desktop/target/release/bundle/`
as DEB + AppImage, DMG + .app, or MSI + NSIS depending on the host.

The desktop binary is offline-capable: the wasm core, the web
bundle, and the IDE chrome all ship inside the binary. No network
calls except to whatever URL you point a classroom session at.

Prerequisites and full instructions: [`packages/desktop/README.md`](../packages/desktop/README.md).

---

## In-app tutorials

The `📖` button in the bottom-right opens a ten-lesson on-rails
tour:

1. **Hello, 8086** — load and run a program; see what happens.
2. **Registers** — the eight 16-bit GPRs, halves, MOV.
3. **Memory + addressing modes** — the segment:offset model and
   how square-bracket expressions resolve.
4. **Arithmetic and flags** — ADD/SUB/MUL/DIV; CF/ZF/SF/OF; CMP.
5. **The stack** — PUSH/POP, SP, the procedure pattern.
6. **Procedures** — CALL/RET, parameter passing.
7. **Interrupts** — DOS services via INT 21h.
8. **Devices** — drive the LED matrix, traffic light, 7-segment.
9. **The time-travel debugger** — Step / Back / watches /
   breakpoints.
10. **Sharing + the autograder** — share-links, classroom mode,
    the CLI grader.

Each lesson is 4–7 steps. Most include a "Load this code"
affordance that drops a starter snippet into the editor; you read,
you run, you tweak. Progress saves locally so you can come back to
where you left off.

---

## 11. Self-hosting

The IDE runs as a static site (no server required), or behind any
HTTP host. The bundled `Dockerfile` ships an nginx image; the
classroom-mode WebSocket relay has its own image. Bring both up
with the workspace-root `docker-compose.yml`:

```bash
export M86_CLASSROOM_HMAC_SECRET=$(openssl rand -base64 32)
docker compose up --build
# IDE:    http://localhost:8080
# Relay:  ws://localhost:8787  (also /healthz over HTTP)
```

The classroom relay is optional — the IDE works on its own and
only consults the relay when a teacher starts a session or a
student joins via `?room=…`.

### Classroom on GitHub Pages / Vercel: use the Cloudflare Worker

Static hosts (GitHub Pages, Vercel's static deploy, Netlify…)
can't run the Node sidecar themselves. For those, deploy the
classroom server to Cloudflare Workers + Durable Objects
instead — free tier, zero ops, same protocol:

```bash
pnpm --filter @modern8086/classroom-server-worker exec wrangler login
openssl rand -base64 32 | pnpm --filter @modern8086/classroom-server-worker \
  exec wrangler secret put M86_CLASSROOM_HMAC_SECRET
pnpm --filter @modern8086/classroom-server-worker cf-deploy
```

That gives you a URL like
`https://modern8086-classroom.<your-name>.workers.dev`. Set
`VITE_CLASSROOM_WS_URL` as a GitHub Actions **repo variable** (no
quoting — bare URL with the `wss://` scheme and `/ws` suffix:
`wss://modern8086-classroom.<your-name>.workers.dev/ws`); the
GitHub Pages deploy workflow picks it up automatically on the
next push to `main`. Full details:
[`packages/classroom-server-worker/README.md`](../packages/classroom-server-worker/README.md).

---

## 12. Where to file feedback

- **Bugs and feature requests:** the repo's GitHub Issues. Include
  a share-link (`↗ Share`) wherever the buffer is part of the
  repro; that's almost always faster than describing the code.
- **Lab-manual compatibility gaps:** [`docs/lab-manual-audit.md`](lab-manual-audit.md)
  tracks what idioms still hit assembler errors. PRs welcome.
- **Translation contributions:** add a key to your locale's file
  under `packages/web/src/i18n/`. Missing keys fall back to English
  with no build break.
