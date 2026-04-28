# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting with `1.0.0`.

## [Unreleased]

### Added

- **emu8086-core** — almost-complete 8086 emulator: register file with high/low aliasing, 1 MiB segmented memory with `seg:off → linear` translation, mod-r/m memory addressing with segment overrides, MOV family (incl. LEA, XCHG, segment registers, accumulator moffs), arithmetic + logical + shift/rotate groups with full 8086 flag math (CF/OF/SF/ZF/AF/PF), stack (PUSH/POP regs/segregs/flags/r/m), control flow (JMP, all 16 Jcc, LOOP family, JCXZ, near CALL/RET), string ops with REP/REPE/REPNE, MUL/IMUL/DIV/IDIV with DivideError trap, port I/O (IN/OUT) with `out_log`, software interrupts (INT n / IRET / INT 3) with DOS subset (INT 21h fn 01h, 02h, 06h, 09h, 4Ch; INT 20h). 98 unit tests.
- **emu8086-assembler** — lex + two-pass parse + encode for the `.com` subset students need: ALU r/r and r/imm, MOV reg/imm and reg/reg, INT, PUSH/POP, INC/DEC reg16, JMP/CALL near, all 16 Jcc and LOOP family / JCXZ, RET, single-byte flag/halt/no-op opcodes, CBW/CWD/LAHF/SAHF/XLAT/PUSHF/POPF. Directives: `org`, `db`, `dw`. Number bases: decimal, MASM hex (`0FFh`), binary (`1011b`), octal (`077o`), C-style hex (`0x10`). Single-quote char literals `'A'`. Labels with forward references. Span-rich diagnostics. 18 unit tests.
- **emu8086-cli (`emu8086`)** — `assemble`, `run`, `run-asm` (assemble + run in one step), `version`. Diagnostics rendered with file path, 1-based line:column, source line, and a caret on the offending span. 2 e2e tests.
- **emu8086-wasm-api** — wasm-bindgen surface that batches `compile_and_run(source, max_steps) -> JSON` so the browser can drive the whole pipeline through a single call. 2 unit tests.
- **Web IDE shell** — textarea editor, Run button, output panel, register dump (AX..SS, IP), flag badges (CF/PF/AF/ZF/SF/TF/IF/DF/OF), error callouts pinned to the offending source line.
- **Examples** — `examples/hello.asm` (DOS hello-world via INT 21h fn 09h) and `examples/sum.asm` (1+...+10 → "55", showing the loop / Jcc / char-literal idioms).
- **Documentation** — `README.md`, `ARCHITECTURE.md`, `ROADMAP.md` (M0-M7), `BUILD_PLAN.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/{pain-points,emu8086-compatibility,student-experience,educator-guide,adr/0001-tech-stack}.md`.
- **Tooling** — Cargo + pnpm workspaces, Rust toolchain pinned to stable, dprint, markdownlint config, `.editorconfig`. GitHub Actions CI: Rust on Linux/macOS/Windows (fmt + clippy + test + wasm32 target build), Web (rust toolchain + wasm-pack + pnpm typecheck/build/test), markdownlint.
- **Repository hygiene** — Issue templates (bug report, feature request, contact-links config), pull-request template.

### Pending

- Memory operands in the assembler (`[bx]`, `[bx+si+0x10]`).
- `equ`, `dup`, `model`/`proc` directives, the `emu8086.inc` macro pack.
- Far calls/jumps, BCD adjust opcodes (DAA/DAS/AAA/AAS/AAM/AAD), LDS/LES.
- Monaco editor, time-travel debugger, virtual peripherals.
- Autograder + share-links + LMS integration (M5).
