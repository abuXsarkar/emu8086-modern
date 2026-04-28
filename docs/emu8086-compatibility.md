# emu8086 source compatibility

Goal: existing emu8086 lab manuals, sample programs, and lecture slides should run on `emu8086-modern` **without source modification** under the default `emu8086` dialect.

This document tracks what we accept, what we don't, and where we deliberately diverge.

The compatibility target is the legacy emu8086 v4.08 (the most widely deployed version in courses).

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

---

## What `--dialect=emu8086` accepts

### Templates and program model

| Feature | Status | Notes |
|---|---|---|
| `.com` template (`org 100h`, single segment, code+data mix) | ✅ | Default if no model directive present. |
| `.exe` template (`.MODEL SMALL`, `.STACK`, `.DATA`, `.CODE`, segment registers) | ✅ | Sets `DS` from `@data`, sets up stack. |
| `.bin` template (no headers, raw image) | ✅ | For boot-sector style labs. |
| `.MODEL TINY / SMALL / COMPACT / MEDIUM / LARGE / HUGE` | partial | TINY and SMALL pass; others print a warning ("model X behaves as SMALL"). |

### Number bases

| Form | Status | Notes |
|---|---|---|
| `123` decimal | ✅ | |
| `0FFh`, `0FFH` hex | ✅ | Leading `0` required as in MASM/emu8086. |
| `1011b`, `1011B` binary | ✅ | |
| `077o` octal | ✅ | |
| `0x1F` C-style hex | ✅ | Accepted as an extension; warns under strict-compat mode. |

### Pseudo-ops and directives

| Pseudo | Status | Notes |
|---|---|---|
| `db`, `dw`, `dd` | ✅ | |
| `EQU` | ✅ | Both `name EQU value` and `name = value`. |
| `DUP` | ✅ | `db 16 DUP(0)`. Nested DUP supported. |
| `OFFSET label` | ✅ | |
| `SEG label` | ✅ | |
| `PTR` | ✅ | `BYTE PTR`, `WORD PTR`, `DWORD PTR`. |
| `LABEL` directive | ✅ | |
| `STRUC` / `ENDS` | ✅ | |
| `MACRO` / `ENDM` with `LOCAL` | ✅ | |
| `INCLUDE "file.inc"` | ✅ | Searches CWD then a configurable include path. |
| `IF / ELSE / ENDIF` | ✅ | Including `IFDEF`, `IFNDEF`. |
| `ORG` | ✅ | |
| `END start` | ✅ | Optional entry-point label. |

### `emu8086.inc` macro pack

The legacy `emu8086.inc` ships a set of macros that many lab manuals depend on. We provide a drop-in replacement under the same include name. Behavior is identical at the call site; the underlying implementation may differ.

| Macro | Status | Notes |
|---|---|---|
| `PRINT "string"` | ✅ | Prints to current screen device. |
| `PRINTN "string"` | ✅ | Print + newline. |
| `GOTOXY col, row` | ✅ | |
| `CURSOROFF` / `CURSORON` | ✅ | |
| `CLEAR_SCREEN` | ✅ | |
| `PUTC 'A'` | ✅ | |
| `GET_STRING dst, max_len` | ✅ | |
| `SCAN_NUM ax` | ✅ | Reads a signed decimal integer. |
| `PRINT_NUM` / `PRINT_NUM_UNS` | ✅ | |
| `SET_VIDEO_MODE m` | ✅ | |
| `DEFINE_PRINT_STRING` etc. (the family of `DEFINE_*` macros that emit a procedure when included) | ✅ | Same calling conventions and side effects. |

### Operand-size inference

emu8086 is forgiving where MASM/NASM are strict — for example `mov [bx], 1` is accepted and assembled as `mov BYTE PTR [bx], 1` (with a warning). We replicate this leniency under `emu8086` dialect; under `nasm` dialect we reject it and require an explicit size.

### I/O ports

emu8086 reserves several ports for its virtual peripherals:

| Port | Device |
|---|---|
| 4 | Traffic light controller |
| 7 | Stepper motor |
| 9 | LED matrix (data) |
| 10 | LED matrix (address) |
| 199 | 7-segment display |
| 200 | Printer |
| 201 | Robot (forward) |
| 202 | Robot (turn) |

Our virtual devices listen on these ports by default, so `OUT 4, AL` drives the traffic light identically to legacy emu8086.

### Software interrupts

| INT | Functions implemented | Status |
|---|---|---|
| `INT 21h` | 01h, 02h, 06h, 07h, 08h, 09h, 0Ah, 25h, 35h, 3Ch, 3Dh, 3Eh, 3Fh, 40h, 4Ch | covers the labs in the corpus |
| `INT 10h` | 00h, 02h, 03h, 06h, 09h, 0Eh, 0Fh, 13h | basic video |
| `INT 16h` | 00h, 01h | keyboard read |
| `INT 1Ah` | 00h | tick count |

Functions outside the above list trap to a diagnostic ("INT 21h fn 5Ah is not implemented in emu8086-modern; please file an issue with the program that needs it"). This is deliberately better than the legacy behavior (silent no-op).

---

## Where we deliberately diverge

We diverge only when the legacy behavior is a clear bug or pedagogical foot-gun.

| Legacy behavior | Our behavior | Why |
|---|---|---|
| Silent truncation when an immediate exceeds operand size (`mov al, 300`) | Hard error with caret + suggestion to use `ax` | Silent truncation has cost more student debugging hours than any other quirk we have measured. |
| `org` outside `.com` template silently ignored | Warning + emitted as expected | Easier to learn from. |
| `INT 21h fn 5Ah` etc. silently no-ops | Diagnostic trap | See above. |
| Self-modifying code that writes into the prefetch queue's window passes silently | Diagnostic warning | Catches accidental self-overwrites, common in early labs. |

A divergence is recorded here only after explicit ADR review. We do not silently change behavior between versions.

---

## Compatibility test corpus

Our regression suite includes:

- The 12 sample programs shipped with legacy emu8086 v4.08 (`Hello.asm`, `Calc.asm`, `Robot.asm`, …) under public-domain or fair-use grounds.
- 50+ public-domain lab programs from open courseware (linked in `tests/dialects/sources.md`).
- Educator-contributed programs (CLA required for each contribution).

A program is "compatible" when assembling and running it on `emu8086-modern` produces the same final register / memory / device state as legacy emu8086. We capture each baseline by running the program on legacy emu8086 once and recording the trace; we then assert that recording in CI.

---

## Reporting a compatibility bug

If a program runs differently on legacy emu8086 and on `emu8086-modern`:

1. Open an issue tagged `compat:emu8086`.
2. Attach the program and any `.inc` files it depends on.
3. Describe the divergence (final register difference, error message difference, etc.).
4. Note the legacy emu8086 version you compared against.

We treat dialect compatibility as a first-class feature. A regression here blocks the next release.
