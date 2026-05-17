// Per-mnemonic hover docs for the Monaco editor. Each entry is a
// short summary line + a longer "detail" body. Mirrors the inline
// docs sim8085 paywalls — we ship them free.

export type OpcodeDoc = { summary: string; detail: string };

export const OPCODE_DOCS: Record<string, OpcodeDoc> = {
  // Data transfer
  MOV: {
    summary: "Move data between registers / [HL]",
    detail: "`MOV dst, src` copies an 8-bit register or [HL] to another. Flags unaffected.",
  },
  MVI: {
    summary: "Move immediate byte to register / [HL]",
    detail: "`MVI dst, d8` loads the literal `d8` into a register or [HL]. Flags unaffected.",
  },
  LXI: {
    summary: "Load 16-bit immediate into a register pair",
    detail: "`LXI rp, d16` sets BC, DE, HL, or SP to the literal d16. Flags unaffected.",
  },
  LDA: { summary: "Load A from a 16-bit address", detail: "`LDA addr` → A = mem[addr]." },
  STA: { summary: "Store A to a 16-bit address", detail: "`STA addr` → mem[addr] = A." },
  LHLD: {
    summary: "Load HL from a 16-bit address (little-endian)",
    detail: "`LHLD addr` → L = mem[addr], H = mem[addr+1].",
  },
  SHLD: {
    summary: "Store HL to a 16-bit address (little-endian)",
    detail: "`SHLD addr` → mem[addr] = L, mem[addr+1] = H.",
  },
  LDAX: { summary: "Load A indirect via BC or DE", detail: "`LDAX B` → A = mem[BC]; `LDAX D` → A = mem[DE]." },
  STAX: { summary: "Store A indirect via BC or DE", detail: "`STAX B` → mem[BC] = A; `STAX D` → mem[DE] = A." },
  XCHG: { summary: "Exchange HL and DE", detail: "Swap the contents of HL and DE. Flags unaffected." },

  // Arithmetic
  ADD: { summary: "A = A + reg or [HL]", detail: "Sets S, Z, AC, P, CY from the 8-bit sum." },
  ADC: {
    summary: "A = A + reg + CY",
    detail: "Add with carry. Sets S, Z, AC, P, CY. Carry-in is the current CY flag.",
  },
  ADI: { summary: "A = A + d8", detail: "Immediate add. Sets S, Z, AC, P, CY." },
  ACI: { summary: "A = A + d8 + CY", detail: "Immediate add-with-carry. Sets S, Z, AC, P, CY." },
  SUB: { summary: "A = A - reg or [HL]", detail: "Sets S, Z, AC, P, CY (CY = borrow needed)." },
  SBB: { summary: "A = A - reg - CY", detail: "Subtract with borrow. Sets all flags." },
  SUI: { summary: "A = A - d8", detail: "Immediate subtract. Sets S, Z, AC, P, CY." },
  SBI: { summary: "A = A - d8 - CY", detail: "Immediate subtract-with-borrow. Sets S, Z, AC, P, CY." },
  INR: { summary: "Increment register / [HL]", detail: "Sets S, Z, AC, P. **CY is NOT affected.**" },
  DCR: {
    summary: "Decrement register / [HL]",
    detail: "Sets S, Z, AC, P. CY is NOT affected. Works correctly across 0x80 (DCR(80H)=7F, AC=1).",
  },
  INX: { summary: "Increment a register pair (no flags)", detail: "16-bit increment. Flags unaffected." },
  DCX: { summary: "Decrement a register pair (no flags)", detail: "16-bit decrement. Flags unaffected." },
  DAD: {
    summary: "HL = HL + register pair",
    detail: "16-bit add. **Only CY is affected** — S/Z/AC/P are preserved (fix for sim8085 #45).",
  },
  DAA: {
    summary: "Decimal-adjust A after BCD arithmetic",
    detail: "Adjusts A so it reads as packed BCD. Updates S, Z, AC, P, CY per the Intel data sheet.",
  },

  // Logical
  ANA: { summary: "A = A AND reg or [HL]", detail: "CY cleared. On 8085, AC = (A | reg) & 0x08." },
  ANI: { summary: "A = A AND d8", detail: "Immediate AND. CY cleared." },
  ORA: { summary: "A = A OR reg or [HL]", detail: "CY and AC cleared." },
  ORI: { summary: "A = A OR d8", detail: "Immediate OR. CY and AC cleared." },
  XRA: { summary: "A = A XOR reg or [HL]", detail: "CY and AC cleared." },
  XRI: { summary: "A = A XOR d8", detail: "Immediate XOR. CY and AC cleared." },
  CMP: {
    summary: "Compare A with reg or [HL]",
    detail: "Sets flags as if A - reg, but the result is discarded. Z set if equal, CY set if A < reg.",
  },
  CPI: { summary: "Compare A with d8", detail: "Sets flags as if A - d8. Result discarded." },
  RLC: { summary: "Rotate A left circular", detail: "Bit 7 → CY and bit 0." },
  RRC: { summary: "Rotate A right circular", detail: "Bit 0 → CY and bit 7." },
  RAL: { summary: "Rotate A left through CY", detail: "Bit 7 → CY, old CY → bit 0." },
  RAR: { summary: "Rotate A right through CY", detail: "Bit 0 → CY, old CY → bit 7." },
  CMA: { summary: "Complement A", detail: "A = ~A. Flags unaffected." },
  CMC: { summary: "Complement CY", detail: "Toggles the carry flag." },
  STC: { summary: "Set CY", detail: "Forces the carry flag to 1." },

  // Branch
  JMP: { summary: "Unconditional jump", detail: "`JMP addr` sets PC = addr." },
  JNZ: { summary: "Jump if not zero", detail: "Taken when Z = 0." },
  JZ: { summary: "Jump if zero", detail: "Taken when Z = 1." },
  JNC: { summary: "Jump if no carry", detail: "Taken when CY = 0." },
  JC: { summary: "Jump if carry", detail: "Taken when CY = 1." },
  JPO: { summary: "Jump if parity odd", detail: "Taken when P = 0." },
  JPE: { summary: "Jump if parity even", detail: "Taken when P = 1." },
  JP: { summary: "Jump if positive (sign clear)", detail: "Taken when S = 0." },
  JM: { summary: "Jump if minus (sign set)", detail: "Taken when S = 1." },
  CALL: { summary: "Subroutine call", detail: "Pushes return address (PC after CALL) and jumps." },
  RET: { summary: "Return from subroutine", detail: "Pops PC off the stack." },
  PCHL: { summary: "PC = HL", detail: "Indirect jump through HL. Flags unaffected." },
  RST: {
    summary: "Restart at vector N×8",
    detail: "`RST n` (n in 0..7) pushes PC and jumps to 0x0000 + n*8.",
  },

  // Stack / IO
  PUSH: { summary: "Push register pair onto stack", detail: "Operand: B, D, H, or PSW. SP -= 2." },
  POP: { summary: "Pop register pair from stack", detail: "Operand: B, D, H, or PSW. SP += 2." },
  XTHL: { summary: "Exchange HL with [SP]", detail: "16-bit swap of HL and the top of stack." },
  SPHL: { summary: "SP = HL", detail: "Copies HL into SP. Flags unaffected." },
  IN: { summary: "Read a byte from port", detail: "`IN port` → A = port byte. In the browser this surfaces as an IO trap." },
  OUT: { summary: "Write A to port", detail: "`OUT port` writes A. In the browser this surfaces as an IO trap." },

  // Control
  HLT: { summary: "Halt CPU", detail: "Stops execution. PC points past HLT." },
  NOP: { summary: "No operation", detail: "1 byte, 4 cycles, no side-effects." },
  EI: { summary: "Enable interrupts", detail: "Sets the interrupt-enable flip-flop." },
  DI: { summary: "Disable interrupts", detail: "Clears the interrupt-enable flip-flop." },
  RIM: { summary: "Read interrupt mask", detail: "Reads the SIM mask byte into A. Stubbed in modern8085." },
  SIM: { summary: "Set interrupt mask", detail: "Writes A into the SIM mask byte. Stubbed in modern8085." },

  // Directives (also surfaced by the hover provider so students see them)
  ORG: { summary: "Set load address", detail: "`ORG addr` — subsequent bytes assemble at addr. Default when omitted: 2000H." },
  EQU: { summary: "Define a symbolic constant", detail: "`NAME EQU value` — resolves wherever NAME is referenced." },
  DB: { summary: "Define byte(s)", detail: "`DB v1, v2, 'AB'` — emits raw bytes inline." },
  DW: { summary: "Define word(s)", detail: "`DW v` — emits two bytes little-endian." },
  DS: { summary: "Reserve byte block", detail: "`DS n` — emits n zero bytes." },
  END: { summary: "End of source", detail: "Optional terminator. The assembler accepts a missing END with a warning." },
};
