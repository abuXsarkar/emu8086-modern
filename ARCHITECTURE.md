# Architecture

This document describes the system design of `modern8086`. It is a living document — significant changes are recorded as Architecture Decision Records (ADRs) under [`docs/adr/`](docs/adr/).

---

## 1. Goals and non-goals

### Goals
- **Correctness.** Bit-exact 8086 semantics, including FLAGS, segmented addressing, prefetch-queue-aware timing (optional), and faithful interrupt behavior.
- **Portability.** Single emulator core that runs in browsers (wasm), in Node.js (wasm), as a Linux/macOS/Windows native library, and in CI (CLI).
- **Determinism.** A given input program + input event log → identical execution trace, every time. Required for time-travel debugging, autograding, and reproducible bug reports.
- **Source compatibility.** Existing emu8086 lab manuals must assemble and run without source modification.
- **Pedagogy first.** Every architectural choice is judged by how clearly it makes the machine model visible to a student.

### Non-goals
- Full PC/AT compatibility. We do not boot MS-DOS, do not implement BIOS beyond the subset emu8086 exposes, and do not aim for cycle-perfect timing of obscure prefetch quirks.
- 80286+ protected mode. Real mode 8086/8088 only.
- Performance parity with V86 / DOSBox. We optimize for clarity and stepping speed, not throughput.

---

## 2. Component map

```
                          ┌───────────────────────────────────┐
                          │              Web IDE              │
                          │   (React + TS, Monaco, Tailwind)  │
                          │                                   │
                          │  ┌──────────┐   ┌──────────────┐  │
                          │  │ Editor   │   │ Debug panels │  │
                          │  │ (Monaco) │   │ regs/flags/  │  │
                          │  │          │   │ mem/stack    │  │
                          │  └────┬─────┘   └──────┬───────┘  │
                          │       │                │          │
                          │       └────┬───────────┘          │
                          │            ▼                      │
                          │   ┌─────────────────┐             │
                          │   │ Devices runtime │ (SVG/WebGL) │
                          │   │ traffic-light…  │             │
                          │   └────────┬────────┘             │
                          └────────────┼──────────────────────┘
                                       │ JSON-RPC over wasm-bindgen
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │            emu8086-core (Rust)             │
                  │                                            │
                  │   ┌──────────┐  ┌──────────┐  ┌─────────┐  │
                  │   │ Decoder  │→ │ Executor │→ │ Tracer  │  │
                  │   └──────────┘  └────┬─────┘  └────┬────┘  │
                  │                      ▼             ▼       │
                  │   ┌──────────┐  ┌──────────┐  ┌─────────┐  │
                  │   │ Memory   │  │ Devices  │  │Snapshots│  │
                  │   │ (1 MiB)  │←→│ (I/O)    │  │ (undo)  │  │
                  │   └──────────┘  └──────────┘  └─────────┘  │
                  │                                            │
                  └─────────────▲──────────────────────────────┘
                                │
                                │  same crate
                                │
   ┌────────────────────────────┴──────────────────────┐
   │                                                   │
   ▼                                                   ▼
┌──────────────────┐                         ┌─────────────────────┐
│ modern8086-cli      │                         │ emu8086-assembler   │
│ headless runner, │                         │ src.asm → image     │
│ autograder       │                         │ dialects: emu8086,  │
│                  │                         │ nasm                │
└──────────────────┘                         └─────────────────────┘
```

---

## 3. Layers, in detail

### 3.1 Core emulator (`packages/core`, Rust)

A single Rust crate that compiles to:
- a **`cdylib`** for native consumers (CLI, future Tauri shell),
- a **`wasm32-unknown-unknown`** target with `wasm-bindgen` bindings for the web IDE.

#### Internal modules

| Module | Responsibility |
|---|---|
| `cpu::regs` | Register file: `AX/BX/CX/DX/SI/DI/BP/SP/IP`, segment regs, FLAGS. Helpers for high/low byte aliasing (`AH`/`AL`). |
| `cpu::decode` | Stream of bytes → `Instruction` AST. One function per opcode group; table-driven where it pays off. Each `Instruction` carries source-mapped origin offsets when assembled by our assembler. |
| `cpu::execute` | `Instruction` → state mutation. Returns a `StepRecord` describing every byte read/written, every flag changed, and every device port touched. This record is what feeds the time-travel debugger and the trace log. |
| `mem` | Flat 1 MiB byte array + `seg:off → linear` translation. Tracks read/write watchpoints. |
| `io` | I/O port dispatcher. Devices register port handlers. |
| `interrupts` | Software (`INT n`) and hardware (`IRQ`) entrypoints. Subset of DOS `INT 21h` and BIOS `INT 10h/16h` matching what emu8086 emulates. |
| `snapshot` | Copy-on-write snapshot of `(regs, mem dirty pages, device states)`. Snapshots are taken every N steps; the time-travel debugger reconstructs intermediate states by replaying from the nearest snapshot. |
| `trace` | Append-only `Vec<StepRecord>`. The host can stream this for live UI updates or persist it for replay. |

#### Public API (sketch)

```rust
pub struct Emulator { /* … */ }

impl Emulator {
    pub fn new(image: &[u8], origin: u16) -> Self;
    pub fn step(&mut self) -> StepRecord;
    pub fn step_back(&mut self) -> StepRecord;       // time travel
    pub fn run_until(&mut self, pred: BreakCondition) -> Vec<StepRecord>;
    pub fn snapshot(&self) -> Snapshot;
    pub fn restore(&mut self, snap: &Snapshot);
    pub fn read_mem(&self, lin: u32, len: u32) -> &[u8];
    pub fn registers(&self) -> &Registers;
    pub fn attach_device(&mut self, d: Box<dyn Device>);
}
```

`StepRecord` is intentionally rich — every UI panel and the autograder consume it instead of re-deriving information from raw memory.

### 3.2 Assembler (`packages/assembler`, Rust)

- Hand-written lexer (small token set, fast).
- Hand-written recursive-descent parser producing a `Program` AST with full source spans.
- Two-pass codegen: pass 1 lays out symbols; pass 2 emits bytes.
- **Dialects** are layered as preprocessor transforms over a common AST:
  - `emu8086`: expands `emu8086.inc` macros (`PRINT`, `PRINTN`, `GOTOXY`, `CURSOROFF`, …), accepts `org 100h`, accepts the relaxed operand-size inference emu8086 does, treats the well-known I/O ports (4, 7, 9, …) as the documented virtual devices.
  - `nasm`: stricter, no built-in macros, explicit sizes.
- Diagnostics: `codespan-reporting` style — span, caret, label, note, help. We invest here because *unhelpful errors* is the #1 student complaint about legacy emu8086.

### 3.3 Devices (`packages/devices`)

Each virtual peripheral is **two artifacts** kept in lockstep:
1. A Rust `Device` (port-mapped I/O) compiled into the core, so the CLI / autograder can drive it headlessly.
2. A TypeScript/React component that renders the device and sends user input back through the IDE.

Initial device set (matches emu8086):
- Traffic light controller
- 7-segment display
- Stepper motor
- LED matrix
- Robot
- Printer
- Screen (text-mode 80×25)
- Keyboard

Plugin SDK lets educators add their own (e.g. a custom lab board) without forking the project.

### 3.4 Web IDE (`packages/web`)

- **Framework:** React 18 + TypeScript, built with Vite.
- **Editor:** Monaco, with an 8086-asm language definition (tokens, hover docs, completions, snippets, gutter for breakpoints).
- **State:** Zustand store for UI state; the emulator state lives in wasm and is read each render via a stable view.
- **Styling:** Tailwind CSS + shadcn/ui primitives. Dark mode by default.
- **Layout:** dockable panels (resizable splits) — editor / registers / flags / memory / stack / output / devices.
- **Time-travel UI:** a horizontal scrubber over the `StepRecord` trace; clicking a moment restores the matching snapshot.
- **Collaboration (optional, M5+):** Yjs CRDT over WebSocket, present-cursors, "follow teacher" mode.
- **Persistence:** IndexedDB for unsaved buffers + autosave; share-link encodes the buffer + emulator state in the URL fragment (no server needed); optional save-to-Gist when signed in.

### 3.5 Native shell

We use **Tauri** (Rust + system webview) to ship the web IDE as a desktop app. This keeps a single web codebase and gives us file-system access, native menus, and small binaries (~10 MB vs Electron's 100 MB+). Decision details in [ADR-0001](docs/adr/0001-tech-stack.md).

### 3.6 CLI / autograder (`packages/cli`)

```
m86 assemble src.asm -o prog.bin
m86 run prog.bin
m86 trace src.asm --max-steps 1_000_000 --json > trace.json
m86 grade --spec assignment.yml --submission student.asm
```

The `grade` subcommand is the institute integration point. Spec example:

```yaml
# assignment.yml
name: "Lab 3 — find max in array"
timeout_ms: 5000
cases:
  - name: "ascending"
    setup_memory:
      "DS:0100": [1, 2, 3, 4, 5]
    expect:
      AX: 5
      flags: { ZF: 0 }
  - name: "all-equal"
    setup_memory:
      "DS:0100": [7, 7, 7, 7, 7]
    expect:
      AX: 7
```

The runner emits a JUnit XML report so GitHub Classroom and most CI systems display it natively.

---

## 4. Data flow: a single step in the IDE

1. User clicks **Step**.
2. Web IDE calls `emulator.step()` over wasm-bindgen.
3. Rust core decodes one instruction, executes it, builds a `StepRecord`, returns it (zero-copy where possible).
4. Web IDE applies the `StepRecord` to its UI store: highlights changed registers, scrolls memory view, animates device updates, appends to trace, marks the new IP in Monaco's gutter.
5. If a breakpoint or watch fires, we stop; otherwise we either wait for the next click (`step`) or schedule the next animation frame (`run`).

For `run`, we run a batch of N steps inside wasm before yielding to JS, to keep the per-step overhead negligible while still allowing a 60 fps UI.

---

## 5. Determinism, snapshots, and time travel

- **Sources of nondeterminism** are quarantined: device input events (keyboard, GUI clicks on devices) are recorded in an event log keyed by step number.
- A run is fully described by `(initial_image, event_log)`. Replaying that pair always produces the same trace. This is what makes share-links and autograding solid.
- **Snapshots** are taken every 4 096 steps. To "step back" by K, we restore the most recent snapshot ≤ current_step − K and replay forward. With the chosen interval, step-back latency is <16 ms in typical programs.

---

## 6. Performance budget

| Operation | Target |
|---|---|
| `step()` round trip from JS | < 100 µs |
| 1M-step `run` | < 1 s on a 2020 laptop |
| Initial wasm load | < 500 KB gzipped |
| Cold start (browser tab → ready to type) | < 1.5 s on broadband |

These are stretch targets, not gating requirements; correctness ships before optimization.

---

## 7. Security model

- The emulator is a sandbox; nothing it does escapes wasm. There is no host file access from emulated code; "file" interrupts redirect to the IDE's virtual filesystem (in IndexedDB).
- The web IDE never executes student-supplied JavaScript. Programs are bytes interpreted by the wasm core.
- The CLI autograder runs user submissions inside a wasm runtime (e.g. `wasmtime`) with a timeout and memory cap, so a hostile submission cannot harm a grading server.
- See [`SECURITY.md`](SECURITY.md) for disclosure policy.

---

## 8. Testing strategy

1. **Unit tests** per opcode in `core` (one `#[test]` per Intel manual paragraph).
2. **Conformance suite** under `tests/conformance/` — pairs of `program.asm` + `expected.json` (final regs/flags/memory snippet). Mirrors and extends the test corpus used by other 8086 emulators (e.g. `8086tiny`, `v86` test suite) where licenses permit.
3. **Dialect tests** under `tests/dialects/` — we keep a corpus of public-domain emu8086 lab programs and assert the assembler accepts them and the run output matches a reference.
4. **Property tests** with `proptest` for arithmetic flag computation (`AF`, `OF`, `PF` are easy to get wrong).
5. **End-to-end tests** for the web IDE with Playwright: load → type → run → assert UI state.
6. **Snapshot tests** for diagnostics output.

CI matrix runs Rust tests on Linux/macOS/Windows × stable/MSRV, and Playwright on Chromium/Firefox/WebKit.

---

## 9. Open questions / future ADRs

- ADR-0002 — Should we offer a **block / scratch** drag-and-drop view for absolute beginners, layered over the text editor? Pedagogical upside vs maintenance cost.
- ADR-0003 — How to handle **8087 FPU** instructions: implement, stub, or refuse? (Most courses skip it; some don't.)
- ADR-0004 — **Cycle-accurate timing** as an opt-in feature. Useful for hardware-track courses; expensive to implement.
- ADR-0005 — **Multi-language UI** infrastructure: ICU MessageFormat vs simple key/value JSON.

ADRs go in [`docs/adr/`](docs/adr/) and are linked from this document when accepted.
