# modern8085-core

Deterministic Intel 8085 CPU core. Sibling to `modern8086-core`.

Compiles to:

- `cdylib` for native consumers (CLI, Tauri shell).
- `wasm32-unknown-unknown` for the browser IDE (via `wasm-pack`).

See [`docs/plans/8085-port.md`](../../docs/plans/8085-port.md) for the phased plan, and [`docs/plans/8085-port-research.md`](../../docs/plans/8085-port-research.md) for the research that informed it.

Status: **M0** — register/flag model + version probe. Full ISA executor lands in M1.
