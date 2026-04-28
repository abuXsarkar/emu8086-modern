# emu8086-modern

> A modern, open-source, cross-platform 8086 emulator and assembly-language IDE — purpose-built for students and easy for institutes to adopt.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Status: M2 in progress](https://img.shields.io/badge/status-M2--in--progress-yellow)
![Tests: 124](https://img.shields.io/badge/tests-124%20passing-brightgreen)
![Platforms: Web · Linux · macOS · Windows](https://img.shields.io/badge/platforms-web%20%7C%20linux%20%7C%20macos%20%7C%20windows-blue)

`emu8086-modern` is a clean-room reimplementation of the classroom-favorite emu8086 IDE, built for the way courses are taught today: in browsers, on Chromebooks, in Linux labs, with Git, and with autograding. It keeps source compatibility with existing emu8086 course materials wherever practical, while fixing the legacy software's biggest pain points.

---

## Why this project exists

Legacy emu8086 has been the de-facto teaching tool for 8086 assembly for two decades. It is also:

- **Windows-only** (works on macOS/Linux only via Wine, with rendering glitches),
- **Shareware** with nag screens and a paid full version,
- **Closed-source**, so bugs cannot be fixed by educators,
- **Stuck in a Win9x-era UI** that students find alien,
- **Hard to integrate** with version control, online assignments, or autograders,
- **Cryptic** in its error messages, with little context for new learners.

Our students still need to learn 8086 — it is in the syllabus of hundreds of CS/ECE programmes worldwide because it is the cleanest entry point into real ISA-level thinking. We don't want to replace the *curriculum*. We want to replace the *tool*.

## The product in one paragraph

A free, MIT-licensed 8086 emulator that runs in a browser tab (and as a native desktop app), drives the same virtual peripherals as emu8086 (traffic light, stepper motor, 7-segment display, LED matrix, printer, robot), assembles a superset of emu8086 syntax, and ships with a modern editor, time-travel debugger, classroom-ready share links, and a CLI autograder that drops into GitHub Classroom.

---

## Pain points we are explicitly solving

| Legacy emu8086 pain point | What `emu8086-modern` does instead |
|---|---|
| Windows-only; broken under Wine | Browser-first (works on Chromebooks, iPads); native builds for Windows / macOS / Linux via Tauri |
| Closed-source shareware with nag screens | MIT-licensed, no paywall, no telemetry by default |
| Tiny, dated text editor | Monaco editor with syntax highlighting, autocomplete, hover docs, snippets, multi-cursor |
| Cryptic single-line errors | `rustc`-style diagnostics: source span, caret, "did you mean…?", links to instruction reference |
| No version control | Built-in load-from-Git, save-to-Gist, share-link (`?gist=…`), import-from-file-drop |
| Step-only debugger | Step **forward and backward** (time-travel), conditional breakpoints, watch expressions, memory-diff highlighting |
| Single-user only | Optional live collaboration (Yjs CRDT), classroom mode for teachers to broadcast a session |
| Static peripheral windows | Themable, accessible, scriptable virtual devices; plugin SDK for custom devices |
| No autograding | Headless CLI runner + GitHub Action; JSON test spec; works with GitHub Classroom out of the box |
| English-only UI | Localized UI (i18n from day one); RTL support |
| Inaccessible (poor contrast, mouse-only) | WCAG 2.1 AA target, full keyboard control, screen-reader labels |
| No mobile/tablet | Responsive layout; tablet-friendly debug controls |

A more detailed breakdown lives in [`docs/pain-points.md`](docs/pain-points.md).

---

## Source compatibility with emu8086

The legacy emu8086 has syntax quirks that thousands of textbooks and lab manuals depend on (e.g. the `emu8086.inc` macro library, `.MODEL SMALL` shortcuts, the `org 100h` `.com` template, `PRINT` / `PRINTN` / `GOTOXY` macros, the virtual `OUT` ports for the traffic light). Our assembler accepts these as a **dialect** (`--dialect=emu8086`, the default) so that existing course materials run unmodified. A stricter `--dialect=nasm` is also offered.

See [`docs/emu8086-compatibility.md`](docs/emu8086-compatibility.md) for the full compatibility matrix.

---

## What works today

- **Emulator core (Rust + wasm).** Almost the entire 8086 ISA: full register file with high/low aliasing, 1 MiB segmented memory, mod-r/m addressing modes with segment overrides, the MOV family (incl. `LEA`, `XCHG`, segment registers, accumulator-direct moffs), arithmetic with 8086-correct flag math (CF/OF/SF/ZF/AF/PF), logical and shift/rotate group, full stack ops, control flow including all 16 conditional jumps, the LOOP family + JCXZ, near `CALL`/`RET`, string ops with REP/REPE/REPNE, `MUL`/`IMUL`/`DIV`/`IDIV` with divide-error trap, port I/O (`IN`/`OUT`), software interrupts including a DOS `INT 21h` subset (functions 01h, 02h, 06h, 09h, 4Ch).
- **Assembler (Rust).** Lex + two-pass parse + encode for `.com`-style programs. Mnemonics: `mov`, the eight ALU ops, `int`, `push`/`pop` (incl. segregs), `inc`/`dec`, all 16 `Jcc`, `LOOP`/`JCXZ`, `JMP`/`CALL` near, `RET`, the single-byte flag/halt/no-op opcodes, `cbw`, `cwd`, `lahf`, `sahf`, `xlat`, `pushf`, `popf`. Directives: `org`, `db`, `dw`. Number bases: dec, `0FFh` MASM hex, `1011b` binary, `077o` octal, `0x10` C-style hex. Char literals `'A'`. Labels with forward references.
- **CLI (`emu8086`).** `assemble`, `run`, `run-asm` (assemble + run in one step), `version`. Source diagnostics show the file path, 1-based line:column, source line, and a caret on the offending span — `rustc`-style.
- **Web IDE (React + Vite + wasm).** A textarea editor, Run button, output panel, register dump, flag badges. The wasm bundle includes both the assembler and the core, so the browser is the runtime.
- **CI.** Rust on Linux/macOS/Windows, web build, markdown lint.

The same hello-world program can be run through any of these surfaces and produces identical output.

## Quick start

```bash
# Build and run the CLI
cargo build -p emu8086-cli --release
cargo run  -p emu8086-cli -- run-asm examples/hello.asm
# → Hello, world!

cargo run  -p emu8086-cli -- run-asm examples/sum.asm
# → 55

# Or build artifacts separately
cargo run -p emu8086-cli -- assemble examples/hello.asm -o hello.com
cargo run -p emu8086-cli -- run hello.com

# Run the web IDE locally
pnpm install
wasm-pack build packages/wasm-api --target web --out-dir pkg --release
pnpm --filter @emu8086/web dev    # opens http://localhost:5173
```

What is **not** built yet (planned, see [`ROADMAP.md`](ROADMAP.md)):

- Memory operands in the assembler (`[bx]`, `[bx+si+0x10]`, …) — M2.3.
- `equ`, `dup`, full `model` / `proc` directives — M2.4-M2.5.
- The `emu8086.inc` macro pack (`PRINT`, `PRINTN`, `GOTOXY`, …) — M2.6.
- Far jumps and calls, BCD adjust opcodes, `LDS`/`LES` — late M1.
- Monaco editor, time-travel debugger, virtual peripherals — M3-M4.
- Autograder, share-links, classroom mode, LMS integration — M5.

---

## Project layout

```
emu8086-modern/
├── packages/
│   ├── core/         # Rust 8086 CPU core (compiles to wasm + native lib)
│   ├── assembler/    # Rust assembler (emu8086 dialect, more soon)
│   ├── wasm-api/     # wasm-bindgen surface combining core + assembler
│   ├── devices/      # Virtual peripherals (traffic light, 7-seg, …)
│   ├── web/          # React + TS IDE (Monaco arrives in M3)
│   └── cli/          # Headless runner / autograder
├── examples/         # Sample programs (hello.asm, sum.asm, …)
├── tests/            # Conformance test suite (ISA + dialect)
├── docs/             # Architecture, ADRs, educator guide, …
└── .github/          # CI, issue/PR templates
```

Full architecture in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system design, module map, data flow
- [`ROADMAP.md`](ROADMAP.md) — milestones M0 → M7 with exit criteria
- [`BUILD_PLAN.md`](BUILD_PLAN.md) — week-by-week build schedule, risks, DoD
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to set up the repo and submit changes
- [`SECURITY.md`](SECURITY.md) — vulnerability disclosure policy
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — community standards
- [`docs/pain-points.md`](docs/pain-points.md) — detailed legacy comparison
- [`docs/emu8086-compatibility.md`](docs/emu8086-compatibility.md) — dialect compatibility matrix
- [`docs/student-experience.md`](docs/student-experience.md) — UX principles
- [`docs/educator-guide.md`](docs/educator-guide.md) — guide for institutes adopting the tool
- [`docs/adr/0001-tech-stack.md`](docs/adr/0001-tech-stack.md) — architecture decision: Rust + wasm + React

---

## How institutes can adopt this

A first-class goal of the project is **frictionless institute adoption**. We commit to:

1. **No-install path.** The hosted web IDE works on any modern browser, including school-managed Chromebooks.
2. **Self-host bundle.** A single Docker image runs the web IDE, autograder, and a share-link service entirely on a campus network — no outbound internet required.
3. **Curriculum portability.** Existing emu8086 lab manuals run unchanged under the `emu8086` dialect.
4. **LMS integration.** LTI 1.3 launch from Moodle / Canvas / Blackboard. Assignments return a numeric score automatically.
5. **GitHub Classroom integration.** A GitHub Action grades pushed assignments using a YAML test spec.
6. **Accessibility & i18n.** WCAG 2.1 AA; UI strings translatable; RTL support. Important for adoption outside the Anglosphere.

Details and a step-by-step pilot plan live in [`docs/educator-guide.md`](docs/educator-guide.md).

---

## Contributing

We welcome contributions from students, educators, and the open-source community. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) before opening an issue or PR.

Good first issues are tagged [`good-first-issue`](https://github.com/abuXsarkar/emu8086-modern/labels/good-first-issue) once the bootstrap milestone (M0) is complete.

## License

[MIT](LICENSE) — free for commercial, academic, and personal use.

## Acknowledgements

This project is independent of the original emu8086 software (© Emu8086, Inc.) and contains none of its code. We thank the original authors for two decades of teaching tooling, which we hope to honor by carrying the experience forward into a more open and modern era.
