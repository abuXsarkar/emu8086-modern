# Roadmap

This roadmap defines the path from an empty repository to **`emu8086-modern` 1.0** — the version we expect to be deployed in undergraduate computer-architecture courses.

Dates assume the project starts in **May 2026** with one core maintainer (~20 hrs/week) plus part-time contributors. They are targets, not commitments. If reality drifts, we update this file rather than letting it lie.

A milestone is "done" only when the **exit criteria** are met. We do not slip exit criteria; we slip dates.

| Milestone | Theme | Status | Exit criteria summary |
|---|---|---|---|
| [M0](#m0--bootstrap) | Bootstrap | ✅ shipped | Repo, CI, docs, hello-wasm in browser |
| [M1](#m1--cpu-core) | 8086 CPU core | ✅ shipped | Mainline ISA + DOS subset of INT 21h |
| [M2](#m2--assembler-emu8086-dialect) | Assembler (emu8086 dialect) | ✅ shipped | Lex+parse+encode for nearly every M1 mnemonic incl. LEA + XCHG + memory-form PUSH/POP, segment-override prefixes (`CS:` / `DS:` / `ES:` / `SS:`), both directions of `mov segreg, r16` / `mov r16, segreg`, `org`/`db`/`dw`/`equ`/`dup`/BYTE-WORD PTR, user `MACRO`/`ENDM`, file-level `include`, `.MODEL`/`.STACK`/`.DATA`/`.CODE`/`.STARTUP`/`.EXIT`/`ASSUME`/`END` directives, `PROC`/`ENDP` blocks. |
| [M3](#m3--web-ide-alpha) | Web IDE alpha | ✅ shipped | Monaco editor with syntax highlighting + snippets + hover docs + error markers + share-link, Reset/Step/Back/Run debugger, register/flag/memory panels, 7-seg + traffic-light peripherals |
| [M4](#m4--time-travel-debugger--devices) | Time-travel + devices | ✅ shipped (alpha) | step_back via diff snapshots; 7-seg, traffic-light, 8×8 LED matrix, stepper motor, text-mode screen (B800:0000), keyboard FIFO (ports 0x60/0x64 + INT 16h/INT 21h), LPT1 printer (port 0x378), robot (port 0x12) peripherals. |
| [M5](#m5--educator-features) | Educator features | ✅ shipped (alpha) | `emu8086 grade` autograder + JUnit XML, GitHub Action, share-links via URL fragment. Pending: LTI 1.3 launch, classroom-mode broadcast. |
| [M6](#m6--beta--pilot) | Beta and institute pilot | needs external partner | Self-host Docker image, a11y audit, pilot course |
| [M7](#m7--10-release) | 1.0 polish | needs signing infra + audit | Tauri desktop builds, plugin SDK, code-signing, external a11y audit |

---

## M0 — Bootstrap

**Window:** May 2026 (2 weeks).
**Owner:** maintainer.

### Deliverables
- This repository populated with: README, ARCHITECTURE, ROADMAP, BUILD_PLAN, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, ADR-0001.
- Monorepo skeleton (`packages/{core,assembler,web,devices,cli}`).
- Cargo workspace + pnpm workspace configured.
- CI on GitHub Actions: Rust build/test on Linux+macOS+Windows; pnpm install + Vite build.
- A "hello-wasm" path: empty Rust core compiled to wasm, loaded into the React app, invokes one function and renders a result. Proves the toolchain end-to-end.
- Issue templates and PR template in `.github/`.
- Project board with a column per future milestone.

### Exit criteria
- `cargo test` and `pnpm build` both green on CI.
- A new contributor can run `git clone && pnpm install && pnpm dev` and see the placeholder IDE in <10 minutes.

---

## M1 — CPU core

**Window:** May–Jun 2026 (6 weeks).

### Deliverables
- Full register file with high/low byte aliasing, segment registers, FLAGS.
- Decoder for all documented 8086 opcodes (≈300 instructions counting modr/m forms).
- Executor for the same, with cycle-correct flag semantics. (Cycle-accurate *timing* deferred to a later optional ADR.)
- Memory model: 1 MiB flat, segmented address translation.
- Software interrupts: subset of `INT 21h` (function 01h, 02h, 09h, 0Ah, 4Ch) and `INT 10h` (set cursor, write char) sufficient for typical labs.
- Snapshot + step-back primitives.
- Conformance test suite skeleton (≥1 test per opcode group).

### Exit criteria
- Conformance suite passes 100% on Linux, macOS, Windows.
- `proptest` flag-arithmetic tests run for 1 hour without finding counterexamples.
- The 12 sample programs shipped with the legacy emu8086 (the ones in the `Samples/` folder distributed with v4.08) produce the same final register/memory state as the legacy product, recorded as a regression baseline.

### Risks
- **Flag computation edge cases** (especially `AF` and `OF` for `IMUL`, `IDIV`, shifts of variable count). Mitigation: import the Intel 8086 reference `.csv` test vectors from public sources; implement against them, not against intuition.
- **Decoder ambiguity** in some prefix combinations (segment override + `LOCK` + repeat). Mitigation: explicit precedence table, documented in code.

---

## M2 — Assembler (emu8086 dialect)

**Window:** Jul 2026 (4 weeks).

### Deliverables
- Lexer + parser + two-pass codegen.
- `emu8086` dialect features: `org 100h`, `.MODEL`, `db/dw/dd`, `EQU`, `DUP`, `OFFSET`, `SEG`, `PTR`, label-relative jumps, the `emu8086.inc` macro pack (`PRINT`, `PRINTN`, `GOTOXY`, `CURSOROFF`, `CURSORON`, `CLEAR_SCREEN`, …).
- `nasm` dialect: stricter, no implicit macros.
- Diagnostic engine with span/caret/help, "did you mean…?" suggestions, and links to the in-app instruction reference.
- Source-map output (`.asm:line:col` for every emitted byte) — required by the IDE to highlight the current line during stepping.

### Exit criteria
- 50 public-domain emu8086 lab programs assemble byte-for-byte against a reference (where the reference is unambiguous) or run to identical final state (where it is not).
- Average assembler error message includes (a) source span, (b) plain-language reason, (c) at least one actionable suggestion when applicable. Verified by review of 30 sample errors.

### Risks
- **Undocumented emu8086 syntax quirks.** Mitigation: build a corpus of real lab programs (call for contributions from educators) and grow the parser until the corpus is green. Don't try to derive the dialect from the manual alone.

---

## M3 — Web IDE alpha

**Window:** Aug 2026 (4 weeks).

### Deliverables
- React + Vite app shell.
- Monaco editor with 8086-asm language definition (tokens, basic completions, hover for opcodes).
- Run / step / pause / reset controls.
- Panels: registers, flags, memory hex view, stack, output console.
- Source-line highlighting tied to current `IP`.
- Light/dark themes.
- Local persistence (IndexedDB autosave).

### Exit criteria
- A student can paste a typical lab program, assemble, run, and step through it without using anything but the IDE.
- Cold start under 2.0 s on a 2018 MacBook Air over broadband.

---

## M4 — Time-travel debugger + devices

**Window:** Sep 2026 (4 weeks).

### Deliverables
- Step-back implementation backed by snapshot+replay.
- Conditional breakpoints (`AX == 5 && CF`).
- Watch expressions over registers and memory (`[BX+SI]`).
- Memory-diff highlighting (cells changed since last step).
- Devices (round 1): traffic-light, 7-segment display, LED matrix, printer, screen, keyboard.
- Device plugin SDK draft (TS + Rust dual-implementation; a single registry).

### Exit criteria
- Step-back works on programs of up to 10 M total steps with <50 ms latency at any point in the trace.
- All round-1 devices pass round-trip tests: a recorded session replays to the same final pixel/state.

---

## M5 — Educator features

**Window:** Oct 2026 (4 weeks).

### Deliverables
- **Share-link** (`?gist=…` or fragment-encoded buffer + initial state) — recipients see exactly the sender's program and starting condition.
- **Classroom mode** — teacher broadcasts their session; students follow read-only or fork to their own buffer.
- **CLI autograder** with the YAML spec described in `ARCHITECTURE.md`.
- **GitHub Action** that runs the autograder on PRs in a student fork and writes a check.
- **LTI 1.3 launch** stub with worked examples for Moodle and Canvas.

### Exit criteria
- A 30-student GitHub Classroom assignment runs end-to-end: teacher posts spec, students submit, scores appear in the classroom dashboard.
- A teacher can run a 50-minute live-coding session with classroom mode without dropping any students under simulated 5% packet loss.

---

## M6 — Beta and institute pilot

**Window:** Nov 2026 (4 weeks).

### Deliverables
- Self-host Docker image (web IDE + share-link service + autograder).
- Accessibility pass: WCAG 2.1 AA, full keyboard navigation, screen-reader pass with NVDA + VoiceOver.
- Internationalization: extraction of all UI strings, English baseline, Spanish + Bengali translations as proof.
- One real undergraduate course running labs on the platform for the term.
- Instrumentation (opt-in, anonymous) to measure error frequencies; data drives fix prioritization.

### Exit criteria
- ≤2 unresolved P0 / P1 bugs at end of pilot.
- Pilot instructor signs off that the platform is "no worse than emu8086 plus measurably better in [their list]".
- A11y audit by an external reviewer comes back with no AA-blocking findings.

---

## M7 — 1.0 release

**Window:** Dec 2026 (4 weeks).

### Deliverables
- Native desktop app (Tauri) for Linux/macOS/Windows.
- Plugin SDK 1.0 with a published example device plugin.
- Complete user manual + interactive in-app tutorials (10 lessons covering segments, registers, addressing modes, stack, procedures, interrupts, devices, debugging, autograder, share-links).
- Release notes, semver policy, security policy, contributor recognition.
- 1.0 git tag + GitHub release with prebuilt artifacts.

### Exit criteria
- All milestones M0–M6 closed.
- `npm install -g @emu8086/cli` works from a clean machine.
- Hosted `https://emu8086.app` (or chosen domain) serves the IDE over HTTPS with <1.5 s TTI.

---

## After 1.0

These ideas are explicitly **not** on the 1.0 roadmap. They are recorded so the project does not forget them:

- **Block-based view** for absolute-beginner labs (drag-and-drop instructions). ADR-0002.
- **8087 FPU**. ADR-0003.
- **Cycle-accurate timing mode**. ADR-0004.
- **Native ARM build for Raspberry-Pi labs**.
- **Offline PWA bundle** that installs from the browser.
- **Multi-language UI** beyond the 3 launch languages.
- **Course-author dashboard** for sharing problem sets across institutes.

A contribution adding any of these is welcome at any time, but won't block 1.0.
