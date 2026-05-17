// Per-mnemonic hover docs for the Monaco editor. Mirrors the 8085
// asm8085_docs structure so the IDE renders identical hover cards
// across the family.
//
// `cycles` strings are machine cycles (× 12 oscillator periods on a
// stock 8051). Most instructions are 1 cycle; `MOVX` / `MUL` / `DIV`
// and the branch family are 2; `MUL AB` / `DIV AB` are 4.

export type OpcodeDoc = { summary: string; detail: string; cycles?: string };

export const OPCODE_DOCS: Record<string, OpcodeDoc> = {
  // Data transfer
  MOV: {
    summary: "Move data between A / Rn / direct / @Ri / immediate",
    detail: "`MOV dst, src` — the 8051's most overloaded mnemonic. Direct addresses access IDATA + SFRs. Flags unaffected.",
    cycles: "1 (reg), 2 (with direct)",
  },
  MOVX: {
    summary: "Move data to/from external RAM (XDATA)",
    detail: "`MOVX A, @Ri` / `MOVX A, @DPTR` reads XDATA; reverse stores. `Ri` covers 0-FFH; `DPTR` covers 0-FFFFH.",
    cycles: "2",
  },
  MOVC: {
    summary: "Move byte from code memory (look-up tables)",
    detail: "`MOVC A, @A+DPTR` or `MOVC A, @A+PC` — fetches a byte from program memory at the offset address.",
    cycles: "2",
  },
  PUSH: {
    summary: "Push direct address onto stack",
    detail: "`PUSH direct` — SP is pre-incremented, then `IDATA[SP] = mem[direct]`.",
    cycles: "2",
  },
  POP: {
    summary: "Pop stack into direct address",
    detail: "`POP direct` — `mem[direct] = IDATA[SP]`, then SP decremented.",
    cycles: "2",
  },
  XCH: {
    summary: "Exchange A with Rn / direct / @Ri",
    detail: "`XCH A, src` — atomic-looking swap. Flags unaffected.",
    cycles: "1",
  },
  XCHD: {
    summary: "Exchange low nibbles of A and @Ri",
    detail: "`XCHD A, @Ri` — used for packed-BCD arithmetic.",
    cycles: "1",
  },

  // Arithmetic
  ADD: {
    summary: "A = A + src",
    detail: "Sets CY, AC, OV from the 8-bit sum. `src` can be Rn / direct / @Ri / #imm.",
    cycles: "1",
  },
  ADDC: {
    summary: "A = A + src + CY",
    detail: "Add-with-carry. Sets CY, AC, OV.",
    cycles: "1",
  },
  SUBB: {
    summary: "A = A - src - CY",
    detail: "Subtract-with-borrow. CY acts as the borrow-in.",
    cycles: "1",
  },
  INC: {
    summary: "Increment A / Rn / direct / @Ri / DPTR",
    detail: "Flags unaffected (except by `INC DPTR` which is 2 cycles).",
    cycles: "1 (2 for DPTR)",
  },
  DEC: {
    summary: "Decrement A / Rn / direct / @Ri",
    detail: "No DPTR form. Flags unaffected.",
    cycles: "1",
  },
  MUL: {
    summary: "B:A = A × B (unsigned)",
    detail: "`MUL AB` — 8×8 unsigned multiply. CY cleared; OV set if product > FFH.",
    cycles: "4",
  },
  DIV: {
    summary: "A = A / B, B = A mod B (unsigned)",
    detail: "`DIV AB` — CY cleared; OV set on divide-by-zero (A and B undefined).",
    cycles: "4",
  },
  DA: {
    summary: "Decimal-adjust A after BCD addition",
    detail: "`DA A` — corrects A to packed BCD after `ADD` / `ADDC`. Reads CY and AC.",
    cycles: "1",
  },

  // Logical
  ANL: {
    summary: "A = A AND src, or bit AND",
    detail: "`ANL A, src` for byte forms; `ANL C, bit` / `ANL C, /bit` for the bit-AND variants.",
    cycles: "1-2",
  },
  ORL: {
    summary: "A = A OR src, or bit OR",
    detail: "Same shape as ANL — byte form on A, bit form on C.",
    cycles: "1-2",
  },
  XRL: {
    summary: "A = A XOR src",
    detail: "Byte form only.",
    cycles: "1-2",
  },
  CLR: {
    summary: "Clear A, C, or a bit",
    detail: "`CLR A`, `CLR C`, `CLR bit`.",
    cycles: "1",
  },
  SETB: {
    summary: "Set C or a bit",
    detail: "`SETB C` or `SETB bit`.",
    cycles: "1",
  },
  CPL: {
    summary: "Complement A / C / bit",
    detail: "`CPL A` inverts all bits of A; `CPL C` flips carry; `CPL bit` flips the addressed bit.",
    cycles: "1",
  },
  RL: { summary: "Rotate A left", detail: "`RL A` — A7 → A0, others shift left. CY unaffected.", cycles: "1" },
  RLC: { summary: "Rotate A left through CY", detail: "`RLC A` — A7 → CY, CY → A0.", cycles: "1" },
  RR: { summary: "Rotate A right", detail: "`RR A` — A0 → A7, others shift right. CY unaffected.", cycles: "1" },
  RRC: { summary: "Rotate A right through CY", detail: "`RRC A` — A0 → CY, CY → A7.", cycles: "1" },
  SWAP: { summary: "Swap nibbles of A", detail: "`SWAP A` — high and low nibbles exchanged. Flags unaffected.", cycles: "1" },

  // Bit ops
  JC: { summary: "Jump if Carry set", detail: "`JC rel` — relative ±127 from next-PC.", cycles: "2" },
  JNC: { summary: "Jump if Carry clear", detail: "`JNC rel` — relative ±127.", cycles: "2" },
  JB: { summary: "Jump if bit set", detail: "`JB bit, rel` — tests any bit-addressable location.", cycles: "2" },
  JNB: { summary: "Jump if bit clear", detail: "`JNB bit, rel` — tests any bit-addressable location.", cycles: "2" },
  JBC: { summary: "Jump if bit set, then clear it", detail: "`JBC bit, rel` — atomic test-and-clear.", cycles: "2" },

  // Branches
  ACALL: { summary: "Absolute call within 2KB page", detail: "`ACALL addr11` — top 5 bits of PC kept.", cycles: "2" },
  LCALL: { summary: "Long call (full 16-bit address)", detail: "`LCALL addr16` — pushes return PC, jumps anywhere.", cycles: "2" },
  RET: { summary: "Return from subroutine", detail: "Pops PC high then low from stack.", cycles: "2" },
  RETI: { summary: "Return from interrupt", detail: "Like RET but also re-enables the priority level that fired.", cycles: "2" },
  AJMP: { summary: "Absolute jump within 2KB page", detail: "`AJMP addr11` — top 5 bits of PC kept.", cycles: "2" },
  LJMP: { summary: "Long jump (full 16-bit address)", detail: "`LJMP addr16` — anywhere in 64K.", cycles: "2" },
  SJMP: {
    summary: "Short relative jump",
    detail: "`SJMP rel` — ±127 from next-PC. `SJMP $` (80 FE) is the canonical halt-equivalent.",
    cycles: "2",
  },
  JMP: { summary: "Indirect jump", detail: "`JMP @A+DPTR` — adds A to DPTR for the new PC (jump tables).", cycles: "2" },
  JZ: { summary: "Jump if A = 0", detail: "`JZ rel` — ±127.", cycles: "2" },
  JNZ: { summary: "Jump if A ≠ 0", detail: "`JNZ rel` — ±127.", cycles: "2" },
  CJNE: {
    summary: "Compare and jump if not equal",
    detail: "`CJNE A, src, rel` / `CJNE Rn, #imm, rel` / `CJNE @Ri, #imm, rel`. Sets CY if first < second.",
    cycles: "2",
  },
  DJNZ: {
    summary: "Decrement and jump if not zero",
    detail: "`DJNZ Rn, rel` / `DJNZ direct, rel` — canonical 8051 loop counter.",
    cycles: "2",
  },
  NOP: { summary: "No operation", detail: "Burns 1 cycle. Flags unaffected.", cycles: "1" },

  // Directives
  ORG: { summary: "Set origin (load address)", detail: "`ORG addr` — subsequent code/data assembles starting at `addr`." },
  EQU: { summary: "Symbol = constant", detail: "`NAME EQU value` — names a numeric constant for use as a literal." },
  DATA: { summary: "Symbol = direct byte address", detail: "`NAME DATA addr` — used to name SFRs and IDATA locations." },
  BIT: { summary: "Symbol = bit address", detail: "`NAME BIT addr` — names a bit-addressable location." },
  DB: { summary: "Define bytes", detail: "Emits one or more bytes inline. Accepts numbers and 'string' literals." },
  DW: { summary: "Define 16-bit words", detail: "Emits big-endian (8051 convention)." },
  DS: { summary: "Define storage (reserve bytes)", detail: "`DS n` — advances the location counter by n bytes (zero-fill)." },
  END: { summary: "End of source", detail: "Optional; tokens after END are ignored." },
};
