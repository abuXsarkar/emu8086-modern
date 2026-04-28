# Tests

Top-level test suites that span multiple packages.

- `conformance/` — opcode-by-opcode 8086 ISA tests (`program.asm` + `expected.json`).
- `dialects/` — corpus of programs in the `emu8086` and `nasm` dialects.
- `fixtures/` — shared inputs.

Per-package unit tests live next to their code under `packages/*/src/`.
