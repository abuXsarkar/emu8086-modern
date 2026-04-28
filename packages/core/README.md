# emu8086-core

Deterministic 8086 CPU core. Single source of truth for emulation across the web IDE, the CLI, and the autograder.

Compiles to:

- `cdylib` for native consumers (CLI, Tauri shell).
- `wasm32-unknown-unknown` (with the `wasm` feature) for the browser IDE.

See [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) for the design.

Status: **skeleton (M0)**. The real decoder + executor lands in M1 — see [`../../ROADMAP.md`](../../ROADMAP.md).
