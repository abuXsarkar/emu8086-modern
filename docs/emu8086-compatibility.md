# emu8086 source compatibility

Goal: existing emu8086 lab manuals, sample programs, and lecture slides should run on `emu8086-modern` **without source modification** under the default `emu8086` dialect.

This document tracks what we accept and what we don't. The compatibility target is legacy emu8086 v4.08 (the most widely deployed version in courses).

> **Reading this document:** until 2026-05-08 this file overstated support — many ✅ rows described features that were planned but not implemented. The tables below now reflect the actual state of the code at `main`. Gaps that used to be marked ✅ are marked ❌ with a `GAP-NNN` link to [`lab-manual-audit.md`](./lab-manual-audit.md), where each gap is mapped to the lab program that exposes it and to the PR that will close it.

## Status legend

- ✅ — implemented and exercised by the test suite or a shipping example
- 🚧 — partial; named flag or subset works, full feature does not
- ❌ — planned, not yet implemented; the cell links to `GAP-NNN` in the [lab-manual audit](./lab-manual-audit.md) and to the PR that closes it
- — — out of scope (not 8086, or deliberately not supported)

---

## Dialect selection

```asm
; Default: emu8086
include "emu8086.inc"
org 100h
PRINT "Hello"
ret
```

```asm
; Strict NASM-style mode: --dialect=nasm
[BITS 16]
org 0x100
section .text
mov ah, 9
mov dx, msg
int 21h
ret
msg: db "Hello", 0Dh, 0Ah, "$"
```

The CLI flag is `--dialect={emu8086,nasm}`. The web IDE picks the dialect from the buffer's first non-comment line: `; @dialect: nasm`. Default is `emu8086`.

| Feature | Status | Notes |
|---|---|---|
| `--dialect=emu8086` (default) | ✅ | the lab-manual flow today |
| `--dialect=nasm` (strict) | ❌ | not yet implemented; current parser is single-dialect |
| `; @dialect:` IDE override | ❌ | follows the CLI flag |

---

## What the assembler accepts

### Templates and program model

| Feature | Status | Notes |
|---|---|---|
| `.com` template (`org 100h`, single segment, code+data mix) | ✅ | Default. All shipping examples use this form. |
| `.exe` template (`.MODEL SMALL`, `.STACK`, `.DATA`, `.CODE`) | 🚧 | The directives lex-and-drop cleanly, but we still emit a flat `.com` image. Programs that depend on a real DS-from-@data setup may behave unexpectedly. |
| `SEGMENT … ENDS` full-segment form | ❌ | [GAP-013](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 4 |
| `.bin` raw template | ❌ | nice-to-have, not on roadmap |
| `.MODEL TINY/SMALL/COMPACT/MEDIUM/LARGE/HUGE` | 🚧 | All forms accepted as no-ops; we don't actually switch model. |

### Number bases

All four common literal forms work today.

| Form | Status | Notes |
|---|---|---|
| `123` decimal | ✅ | |
| `0FFh`, `0FFH` hex | ✅ | Leading `0` required (MASM rule). |
| `1011b`, `1011B` binary | ✅ | |
| `077o` octal | ✅ | |
| `0x1F` C-style hex | ✅ | Accepted as an extension. |
| `'A'` / `'AB'` char literals | ✅ | `'AB'` packs as `0x4241` per MASM convention. |
| `FF12` (hex without `0` prefix or `H` suffix) | ❌ | [GAP-033](./lab-manual-audit.md#assembler--expression-operators) — PR 1 emits a clear "did you mean `0FF12H`?" diagnostic |

### Pseudo-ops and directives

| Pseudo | Status | Notes |
|---|---|---|
| `db`, `dw`, `dd` | ✅ | including `db ?` for uninitialized cells |
| `dq`, `dt` | ❌ | [GAP-019](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 5 |
| `EQU` | ✅ | basic `name EQU value` works; full constant expressions are [GAP-012](./lab-manual-audit.md#assembler--directives--pseudo-ops) (PR 1) |
| `=` (alias for EQU) | 🚧 | accepted as identifier, not equivalent to `EQU` yet |
| `DUP` | ✅ | `db 16 DUP(0)` and `db 16 DUP(?)`. Nested DUP supported. |
| `OFFSET label` | ❌ | [GAP-010](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 1 (top priority) |
| `SEG label` | ❌ | [GAP-031](./lab-manual-audit.md#assembler--expression-operators) — PR 4 |
| `BYTE PTR` / `WORD PTR` (inside brackets) | ✅ | `mov BYTE PTR [bx], 1` |
| `BYTE PTR` / `WORD PTR` (without brackets) | ❌ | [GAP-014](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 5 (`INC BYTE PTR var`) |
| `LABEL` directive | ❌ | [GAP-016](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 4 |
| `STRUC` / `ENDS` (record type) | ❌ | [GAP-017](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 4 |
| `MACRO` / `ENDM` (positional args) | ✅ | nested macros and `LOCAL` not supported |
| `INCLUDE "file.inc"` | ✅ | searches CWD + `--include` paths |
| `IF / ELSE / ENDIF` (also `IFDEF`, `IFNDEF`) | ❌ | [GAP-018](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 4 (lex-and-drop) |
| `ORG` | ✅ | |
| `END start` | ✅ | optional entry-point label; we still execute from `org` for `.com` |
| `PROC` / `ENDP` | ✅ | NEAR/FAR variants both accepted; body's `ret` provides the exit |
| `INVOKE name` (no args) | ✅ | rewrites to `call name` |
| `INVOKE name, arg1, ...` | ❌ | [GAP-021](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 4 |
| `PUBLIC` / `EXTRN` / `EXTERN` | ❌ | [GAP-015](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 4 (lex-and-drop) |
| `GROUP` directive | ❌ | [GAP-020](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 4 |
| `ASSUME` | ✅ | accepted as no-op |
| `.STARTUP` / `.EXIT` | ✅ | accepted as no-op (we already start at `org` and exit on `INT 21h fn 4Ch`) |
| `name DB <items>` shorthand | ✅ | parses as `name: db <items>` |

### Expression operators

| Operator | Status | Notes |
|---|---|---|
| `+`, `-` (binary) | ✅ | |
| `*` | ✅ | |
| `/`, `%` (`MOD`) | ❌ | [GAP-030](./lab-manual-audit.md#assembler--expression-operators) — PR 1 |
| `<<`, `>>` | ❌ | [GAP-034](./lab-manual-audit.md#assembler--expression-operators) — PR 5 |
| `&`, `|`, `^`, `~` | ❌ | [GAP-035](./lab-manual-audit.md#assembler--expression-operators) — PR 5 |
| Unary `-` (incl. inside `[bx-2]`) | ✅ | |
| `OFFSET` | ❌ | [GAP-010](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 1 |
| `SEG` | ❌ | [GAP-031](./lab-manual-audit.md#assembler--expression-operators) — PR 4 |
| `TYPE` / `LENGTH` / `SIZE` / `LENGTHOF` | ❌ | [GAP-032](./lab-manual-audit.md#assembler--expression-operators) — PR 4 |
| `$` (current location counter) | ❌ | [GAP-011](./lab-manual-audit.md#assembler--directives--pseudo-ops) — PR 1 (`LEN EQU $-MSG`) |

### `emu8086.inc` macro pack

The legacy `emu8086.inc` ships a set of macros that many lab manuals depend on (`PRINT`, `PRINTN`, `GOTOXY`, `CLEAR_SCREEN`, `PUTC`, `GET_STRING`, `SCAN_NUM`, `PRINT_NUM`, `SET_VIDEO_MODE`, `DEFINE_*`).

**Status: ❌ not shipped today.** The file `emu8086.inc` does not exist in the repository. PR 3 (INT 10h video subset) and PR 6 (mouse / minor INTs) provide the underlying syscalls these macros wrap; once those land, an `emu8086.inc` shim becomes a small follow-up.

### Operand-size inference

emu8086 is forgiving where MASM/NASM are strict — `mov [bx], 1` is accepted as `mov BYTE PTR [bx], 1` (with a warning).

| Behavior | Status | Notes |
|---|---|---|
| Implicit byte size on `mov [bx], imm8` | 🚧 | currently rejected with "ambiguous size"; should warn-and-accept under `emu8086` dialect |
| `MOV AL, NUM` where `NUM DB 5` (implicit `[NUM]` deref) | ✅ | shipped — width-checked; `MOV DX, MSG` where `MSG` is byte string keeps the address-load form |

### I/O ports

`emu8086-modern` and legacy emu8086 both reserve a small set of ports for virtual peripherals. The two port maps overlap but are not identical. Lab manuals that use 8255 PPI hardware-trainer ports use a third, completely different set — documented in [GAP-400 to GAP-403](./lab-manual-audit.md#hardware--io-ports) (PR 8).

| Port | Device (legacy emu8086) | Device (emu8086-modern) | Status |
|---|---|---|---|
| 4 | Traffic light | Traffic light | ✅ matches |
| 7 | Stepper motor | Stepper motor | ✅ matches |
| 9 | LED matrix (data) | LED matrix (data) | ✅ matches |
| 10 | LED matrix (address) | LED matrix (address) | ✅ matches |
| 199 | 7-segment display | 7-segment display | ✅ matches |
| 200 | Printer | (we use 0x378 LPT1) | 🚧 mismatch — see PR 8 follow-up |
| 201 | Robot (forward) | (we use 0x12 — composite) | 🚧 mismatch |
| 202 | Robot (turn) | (we use 0x12 — composite) | 🚧 mismatch |

### Software interrupts

Currently implemented in `packages/core/src/cpu.rs`:

| INT | Subfunctions today | Notes |
|---|---|---|
| `INT 20h` | (the entire interrupt) | Legacy CP/M exit. ✅ |
| `INT 21h` | `00h`, `01h`, `02h`, `06h`, `09h`, `4Ch` | ✅ for these; the rest are listed below |
| `INT 16h` | `00h`, `01h` | ✅ |

Missing INT 21h subfunctions (cited from lab manuals):

| Subfn | Description | Status | Citation |
|---|---|---|---|
| `AH=08h` | read char without echo | ❌ | [GAP-103](./lab-manual-audit.md#cpu--int-21h-dos-subfunctions-currently-support-01h-02h-06h-09h-00h-4ch) — PR 2 |
| `AH=0Ah` | buffered keyboard input | ❌ | [GAP-100](./lab-manual-audit.md#cpu--int-21h-dos-subfunctions-currently-support-01h-02h-06h-09h-00h-4ch) — PR 2 |
| `AH=2Ah` | get system date | ❌ | [GAP-102](./lab-manual-audit.md#cpu--int-21h-dos-subfunctions-currently-support-01h-02h-06h-09h-00h-4ch) — PR 2 |
| `AH=2Ch` | get system time | ❌ | [GAP-101](./lab-manual-audit.md#cpu--int-21h-dos-subfunctions-currently-support-01h-02h-06h-09h-00h-4ch) — PR 2 |
| `AH=3Ch..41h` | file create/open/close/read/write/delete | ❌ | [GAP-104..109](./lab-manual-audit.md#cpu--int-21h-dos-subfunctions-currently-support-01h-02h-06h-09h-00h-4ch) — PR 7 (needs virtual filesystem) |
| `AH=05h, 0Bh, 0Ch, 0Dh, 1Ah, 2Bh, 30h` | misc minor | ❌ | GAP-110..115 — PR 6 |

Missing INT 10h video — currently **not implemented at all**:

| Subfn | Description | Status | Citation |
|---|---|---|---|
| `AH=00h` | set video mode | ❌ | [GAP-200](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |
| `AH=02h` | set cursor position | ❌ | [GAP-202](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |
| `AH=03h` | get cursor | ❌ | [GAP-207](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |
| `AH=06h` / `07h` | scroll up / down | ❌ | [GAP-203](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |
| `AH=09h` / `0Ah` | write char with / without attribute | ❌ | [GAP-204, 205](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |
| `AH=0Eh` | TTY write | ❌ | [GAP-206](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |
| `AH=0Fh` | get current video mode | ❌ | [GAP-201](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |
| `AH=0Ch` / `0Dh` | write / read pixel | ❌ | [GAP-208](./lab-manual-audit.md#cpu--int-10h-video-currently-none) — PR 3 |

Other interrupts: INT 33h (mouse) — ❌ [GAP-300](./lab-manual-audit.md#cpu--other-interrupts), PR 6. INT 14h, INT 17h, INT 25h/26h — minor; PR 6 stubs.

Functions outside the implemented list trap to a clear "INT N AH=H not implemented" diagnostic rather than silently no-op'ing. This is deliberately stricter than legacy behavior; legacy emu8086 silently ignores most unimplemented subfunctions.

---

## Where we deliberately diverge

We diverge only when the legacy behavior is a clear bug or pedagogical foot-gun.

| Legacy behavior | Our behavior | Why |
|---|---|---|
| Silent truncation when an immediate exceeds operand size (`mov al, 300`) | Hard error with caret + suggestion to use `ax` | Silent truncation costs more student debugging hours than any other quirk we have measured. |
| `INT 21h fn 5Ah` etc. silently no-op | "INT 21h fn 5Ah is not implemented" trap | Surfaces the gap; a student sees it instantly instead of debugging an empty buffer. |
| Self-modifying code that writes into the prefetch queue's window passes silently | Diagnostic warning | Catches accidental self-overwrites, common in early labs. |

Divergences here are recorded after explicit ADR review (`docs/adr/`).

---

## Compatibility test corpus

The shipping regression suite is `tests/conformance/`, with 12 feature-grouped 8086 programs (arithmetic_full, bitwise, shifts_rotates, all_jcc, modrm_addressing, bcd_adjusts, call_ret, string_ops_full, stack_ops, flag_ops, mov_forms, seg_overrides). These exercise our own assembler and CPU; they do not directly measure lab-manual compatibility.

The lab-manual compatibility corpus is the work of PR 0 in [`lab-manual-audit.md`](./lab-manual-audit.md): a `tests/lab-corpus/` directory ingesting representative programs from each of the four manuals, with a per-program "expected behavior" table that CI can assert against. Until PR 0 lands, the per-manual percentages quoted in the audit are inspections, not measurements.

---

## Reporting a compatibility bug

If a program runs differently on legacy emu8086 and on `emu8086-modern`:

1. Check the [lab-manual audit](./lab-manual-audit.md) — the gap may already be filed under a `GAP-NNN` ID.
2. If not, open an issue tagged `compat:emu8086` with: the program, any `.inc` files it depends on, the divergence (final register / memory / device state difference, or error message difference), and the legacy emu8086 version compared against.
3. We treat dialect compatibility as a first-class feature. A regression here blocks the next release.
