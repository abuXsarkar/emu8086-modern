# Examples

Each program here runs end-to-end through the assembler + emulator.
Every one has a matching integration test under `packages/cli/tests/`
that re-runs it in CI on every push, so the documentation never
drifts from reality.

| Program | What it shows | Output |
|---|---|---|
| [`hello.asm`](hello.asm) | DOS `INT 21h` fn 09h prints a `$`-terminated string | `Hello, world!` |
| [`sum.asm`](sum.asm) | `LOOP`-driven accumulation; ASCII-format a 2-digit number via cmp / sub-by-10 | `55` |
| [`array_sum.asm`](array_sum.asm) | `LODSB` walk through a null-terminated byte array, ALU on memory, signed `cmp` / `jl` for the format step | `55` |
| [`streq.asm`](streq.asm) | `REPE CMPSB` to compare two strings, `EQU` for the length, conditional output | `=` |
| [`countdown.asm`](countdown.asm) | Outer `LOOP` with `push`/`pop` to preserve the counter through a body that needs CX | `10 9 8 7 6 5 4 3 2 1 ` |
| [`stackdemo.asm`](stackdemo.asm) | `PUSH` / `POP` LIFO order, char literals, smallest possible 3-line stack demo | `321` |

Run any of them through the CLI:

```bash
cargo run -p modern8086-cli -- run-asm examples/hello.asm
cargo run -p modern8086-cli -- run-asm examples/array_sum.asm
cargo run -p modern8086-cli -- run-asm examples/streq.asm
```

Or trace one to see every instruction's effect on the registers:

```bash
cargo run -p modern8086-cli -- trace examples/hello.asm | jq .
```

## Adding a new example

1. Drop `your_example.asm` here. Use the existing examples for an idea of style; aim for one teaching idea per program.
2. Add an integration test under `packages/cli/tests/run_asm_<name>.rs` so the example can never silently rot. The existing tests show the pattern — they invoke the built CLI, check the exit status, and compare stdout to the expected output byte-for-byte.
3. Reference the program in the table above.

## Future deliveries (roadmap)

The following lab-manual idioms are not yet expressible in the
current assembler (see [ROADMAP](../ROADMAP.md)):

- `proc` / `endp`, `model` / `stack` / `data` / `code` segments — M2.4.
- The `emu8086.inc` macro pack (`PRINT`, `PRINTN`, `GOTOXY`, …) — M2.6.

Once these land, we'll mirror more of the legacy emu8086 sample
folder (the traffic-light, stepper-motor, and 7-segment programs)
under `examples/devices/`.
