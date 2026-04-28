# emu8086-wasm-api

Thin wasm-bindgen surface that combines `emu8086-core` and `emu8086-assembler` into a single browser-friendly call.

Built via `wasm-pack build packages/wasm-api --target web --out-dir pkg`.

Exposes:

- `compile_and_run(source: string, max_steps: number) -> string` — JSON-encoded result with stdout, registers, exit code, and optional diagnostic.
- `version() -> string` — re-exported core version.

The web app under `packages/web/` imports this pkg and renders the result.
