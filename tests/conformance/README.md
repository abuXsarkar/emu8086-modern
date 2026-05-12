# Conformance corpus

Standalone `.asm` programs that exercise broad slices of the 8086 ISA
+ assembler dialect. The goal is regression coverage: if a future
change breaks ADC, the BCD adjusts, or the full set of conditional
jumps, one of these programs stops assembling and `compat-report`
flags it.

Each file is a minimal `.com` program (`org 100h` + `mov ax, 4C00h /
int 21h` exit) focused on one feature group. They're intentionally
small and feature-grouped so a regression points at exactly which
slice of the assembler / encoder broke.

## Running locally

```bash
m86 compat-report tests/conformance --exclude README.md
```

(`--exclude` is unnecessary in practice — the walker only picks up
`*.asm` files. The README is here for human readers, not the
assembler.)

A CLI integration test (`packages/cli/tests/conformance_corpus.rs`)
asserts every file in this directory passes, so CI catches regressions
automatically without anyone having to remember to run the corpus by
hand.

## Coverage matrix

| File | Slice exercised |
| --- | --- |
| `arithmetic_full.asm` | ADD/ADC/SUB/SBB, INC/DEC reg16, MUL/IMUL/DIV/IDIV reg16 |
| `bitwise.asm` | AND/OR/XOR/NOT, TEST in all three encodings (84/85, A8/A9, F6/F7) |
| `shifts_rotates.asm` | SHL/SHR/SAR/ROL/ROR/RCL/RCR by 1 and by CL, byte and word forms |
| `all_jcc.asm` | All 16 Jcc forms, LOOP/LOOPE/LOOPNE/JCXZ |
| `modrm_addressing.asm` | `[bx]`, `[bx+si]`, `[bx+disp8]`, `[bx+disp16]`, `[direct]`, `[bp+si+disp]`, with BYTE PTR / WORD PTR overrides |
| `bcd_adjusts.asm` | DAA, DAS, AAA, AAS, AAM, AAD |
| `call_ret.asm` | Near CALL/RET with arguments via registers and via the stack |
| `string_ops_full.asm` | MOVSB/MOVSW, STOSB/STOSW, LODSB/LODSW, CMPSB/SCASB with REP/REPE/REPNE |
| `stack_ops.asm` | PUSH/POP reg16 + segreg (CS push-only) + PUSHF/POPF + memory-form `push word ptr [bx+si]` / `pop word ptr [bx+si]` (FF /6 / 8F /0) |
| `flag_ops.asm` | CLC/STC/CMC, CLD/STD, CLI/STI, LAHF/SAHF |
| `mov_forms.asm` | reg/imm 8 + 16, reg/reg, mem/reg, reg/mem, mem/imm 8 + 16, accumulator moffs (A0-A3), both `mov segreg, r16` (8E /r) and `mov r16, segreg` (8C /r), plus LEA (8D /r) and the three XCHG forms (86/87 mod-r/m + 90+rw accumulator) |
| `seg_overrides.asm` | All four segment-override prefixes (CS:/DS:/ES:/SS: → 2E/3E/26/36) on bracketed memory operands |
