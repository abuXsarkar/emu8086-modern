# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting with `1.0.0`.

## [Unreleased]

### Added (post-handoff)

- **8×8 LED matrix peripheral** (M4.2c). Standard port layout: port 10 (`0x0A`) selects the row index (0..7), port 9 (`0x09`) latches the row's 8-bit pixel data. New `Emulator::led_matrix_rows()` walks `out_log` to reconstruct the full 8-byte row buffer, automatically honoring `step_back` truncation. New React `LedMatrix` component renders an 8×8 SVG circle grid in the IDE's devices panel, plus an `examples/led_matrix.asm` smiley-face program and a wasm-api unit test that verifies row reconstruction byte-for-byte.
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
- **emu8086-cli (`emu8086`)** — `assemble`, `run`, `run-asm` (assemble + run in one step), `trace` (JSON step-by-step execution log — one record per instruction), `version`. Diagnostics rendered with file path, 1-based line:column, source line, and a caret on the offending span. 5 e2e tests.
- **emu8086-wasm-api** — wasm-bindgen surface that batches `compile_and_run(source, max_steps) -> JSON` so the browser can drive the whole pipeline through a single call. 2 unit tests.
- **Web IDE shell** — textarea editor, Run button, output panel, register dump (AX..SS, IP), flag badges (CF/PF/AF/ZF/SF/TF/IF/DF/OF), error callouts pinned to the offending source line.
- **Examples** — `examples/hello.asm` (DOS hello-world via INT 21h fn 09h), `examples/sum.asm` (1+…+10 = 55), `examples/array_sum.asm` (LODSB walk through a null-terminated byte array → 55), `examples/streq.asm` (REPE CMPSB → '='), `examples/countdown.asm` (`10 9 8 7 6 5 4 3 2 1`).
- **Documentation** — `README.md`, `ARCHITECTURE.md`, `ROADMAP.md` (M0-M7), `BUILD_PLAN.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/{pain-points,emu8086-compatibility,student-experience,educator-guide,adr/0001-tech-stack}.md`.
- **Tooling** — Cargo + pnpm workspaces, Rust toolchain pinned to stable, dprint, markdownlint config, `.editorconfig`. GitHub Actions CI: Rust on Linux/macOS/Windows (fmt + clippy + test + wasm32 target build), Web (rust toolchain + wasm-pack + pnpm typecheck/build/test), markdownlint.
- **Repository hygiene** — Issue templates (bug report, feature request, contact-links config), pull-request template.

### Pending

- `dup` (`db 16 dup(0)`), `BYTE PTR` / `WORD PTR` size overrides, `model`/`proc` directives, the `emu8086.inc` macro pack.
- Far calls/jumps, BCD adjust opcodes (DAA/DAS/AAA/AAS/AAM/AAD), LDS/LES.
- Monaco editor, time-travel debugger, virtual peripherals.
- Autograder + share-links + LMS integration (M5).
