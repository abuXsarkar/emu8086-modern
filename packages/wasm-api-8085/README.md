# modern8085-wasm-api

The wasm-bindgen surface the web IDE imports. Wraps `modern8085-core` + `modern8085-assembler` behind a stateful `Emulator` class plus an `assemble` convenience function.

The IDE drives the emulator from a Web Worker so the main thread stays responsive — even when the student's program is an infinite loop. The `run(budget)` method respects a cycle budget and surfaces a `BudgetExhausted` reason instead of blocking, which is the contract that powers the "Abort?" button.
