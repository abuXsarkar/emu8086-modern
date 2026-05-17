// Per-mnemonic hover docs for the Monaco editor. Each entry is a
// short summary line + a longer "detail" body + an optional T-state
// cost. Mirrors the inline docs sim8085 paywalls — we ship them free.
//
// `cycles` strings match what the executor actually accumulates (see
// packages/core-8085/src/exec.rs) so the hover and the metrics chip
// agree. Where an instruction has two costs (e.g. conditional jumps
// taken vs not, or register vs [HL] operand), both are listed.

export type OpcodeDoc = { summary: string; detail: string; cycles?: string };

export const OPCODE_DOCS: Record<string, OpcodeDoc> = {
  // Data transfer
  MOV: {
    summary: "Move data between registers / [HL]",
    detail: "`MOV dst, src` copies an 8-bit register or [HL] to another. Flags unaffected.",
    cycles: "4 (reg→reg), 7 (with M)",
  },
  MVI: {
    summary: "Move immediate byte to register / [HL]",
    detail: "`MVI dst, d8` loads the literal `d8` into a register or [HL]. Flags unaffected.",
    cycles: "7 (reg), 10 (M)",
  },
  LXI: {
    summary: "Load 16-bit immediate into a register pair",
    detail: "`LXI rp, d16` sets BC, DE, HL, or SP to the literal d16. Flags unaffected.",
    cycles: "10",
  },
  LDA: { summary: "Load A from a 16-bit address", detail: "`LDA addr` → A = mem[addr].", cycles: "13" },
  STA: { summary: "Store A to a 16-bit address", detail: "`STA addr` → mem[addr] = A.", cycles: "13" },
  LHLD: {
    summary: "Load HL from a 16-bit address (little-endian)",
    detail: "`LHLD addr` → L = mem[addr], H = mem[addr+1].",
    cycles: "16",
  },
  SHLD: {
    summary: "Store HL to a 16-bit address (little-endian)",
    detail: "`SHLD addr` → mem[addr] = L, mem[addr+1] = H.",
    cycles: "16",
  },
  LDAX: { summary: "Load A indirect via BC or DE", detail: "`LDAX B` → A = mem[BC]; `LDAX D` → A = mem[DE].", cycles: "7" },
  STAX: { summary: "Store A indirect via BC or DE", detail: "`STAX B` → mem[BC] = A; `STAX D` → mem[DE] = A.", cycles: "7" },
  XCHG: { summary: "Exchange HL and DE", detail: "Swap the contents of HL and DE. Flags unaffected.", cycles: "4" },

  // Arithmetic
  ADD: { summary: "A = A + reg or [HL]", detail: "Sets S, Z, AC, P, CY from the 8-bit sum.", cycles: "4 (reg), 7 (M)" },
  ADC: {
    summary: "A = A + reg + CY",
    detail: "Add with carry. Sets S, Z, AC, P, CY. Carry-in is the current CY flag.",
    cycles: "4 (reg), 7 (M)",
  },
  ADI: { summary: "A = A + d8", detail: "Immediate add. Sets S, Z, AC, P, CY.", cycles: "7" },
  ACI: { summary: "A = A + d8 + CY", detail: "Immediate add-with-carry. Sets S, Z, AC, P, CY.", cycles: "7" },
  SUB: { summary: "A = A - reg or [HL]", detail: "Sets S, Z, AC, P, CY (CY = borrow needed).", cycles: "4 (reg), 7 (M)" },
  SBB: { summary: "A = A - reg - CY", detail: "Subtract with borrow. Sets all flags.", cycles: "4 (reg), 7 (M)" },
  SUI: { summary: "A = A - d8", detail: "Immediate subtract. Sets S, Z, AC, P, CY.", cycles: "7" },
  SBI: { summary: "A = A - d8 - CY", detail: "Immediate subtract-with-borrow. Sets S, Z, AC, P, CY.", cycles: "7" },
  INR: { summary: "Increment register / [HL]", detail: "Sets S, Z, AC, P. **CY is NOT affected.**", cycles: "4 (reg), 10 (M)" },
  DCR: {
    summary: "Decrement register / [HL]",
    detail: "Sets S, Z, AC, P. CY is NOT affected. Works correctly across 0x80 (DCR(80H)=7F, AC=1).",
    cycles: "4 (reg), 10 (M)",
  },
  INX: { summary: "Increment a register pair (no flags)", detail: "16-bit increment. Flags unaffected.", cycles: "6" },
  DCX: { summary: "Decrement a register pair (no flags)", detail: "16-bit decrement. Flags unaffected.", cycles: "6" },
  DAD: {
    summary: "HL = HL + register pair",
    detail: "16-bit add. **Only CY is affected** — S/Z/AC/P are preserved (fix for sim8085 #45).",
    cycles: "10",
  },
  DAA: {
    summary: "Decimal-adjust A after BCD arithmetic",
    detail: "Adjusts A so it reads as packed BCD. Updates S, Z, AC, P, CY per the Intel data sheet.",
    cycles: "4",
  },

  // Logical
  ANA: { summary: "A = A AND reg or [HL]", detail: "CY cleared. On 8085, AC = (A | reg) & 0x08.", cycles: "4 (reg), 7 (M)" },
  ANI: { summary: "A = A AND d8", detail: "Immediate AND. CY cleared.", cycles: "7" },
  ORA: { summary: "A = A OR reg or [HL]", detail: "CY and AC cleared.", cycles: "4 (reg), 7 (M)" },
  ORI: { summary: "A = A OR d8", detail: "Immediate OR. CY and AC cleared.", cycles: "7" },
  XRA: { summary: "A = A XOR reg or [HL]", detail: "CY and AC cleared.", cycles: "4 (reg), 7 (M)" },
  XRI: { summary: "A = A XOR d8", detail: "Immediate XOR. CY and AC cleared.", cycles: "7" },
  CMP: {
    summary: "Compare A with reg or [HL]",
    detail: "Sets flags as if A - reg, but the result is discarded. Z set if equal, CY set if A < reg.",
    cycles: "4 (reg), 7 (M)",
  },
  CPI: { summary: "Compare A with d8", detail: "Sets flags as if A - d8. Result discarded.", cycles: "7" },
  RLC: { summary: "Rotate A left circular", detail: "Bit 7 → CY and bit 0.", cycles: "4" },
  RRC: { summary: "Rotate A right circular", detail: "Bit 0 → CY and bit 7.", cycles: "4" },
  RAL: { summary: "Rotate A left through CY", detail: "Bit 7 → CY, old CY → bit 0.", cycles: "4" },
  RAR: { summary: "Rotate A right through CY", detail: "Bit 0 → CY, old CY → bit 7.", cycles: "4" },
  CMA: { summary: "Complement A", detail: "A = ~A. Flags unaffected.", cycles: "4" },
  CMC: { summary: "Complement CY", detail: "Toggles the carry flag.", cycles: "4" },
  STC: { summary: "Set CY", detail: "Forces the carry flag to 1.", cycles: "4" },

  // Branch
  JMP: { summary: "Unconditional jump", detail: "`JMP addr` sets PC = addr.", cycles: "10" },
  JNZ: { summary: "Jump if not zero", detail: "Taken when Z = 0.", cycles: "10 (always)" },
  JZ: { summary: "Jump if zero", detail: "Taken when Z = 1.", cycles: "10 (always)" },
  JNC: { summary: "Jump if no carry", detail: "Taken when CY = 0.", cycles: "10 (always)" },
  JC: { summary: "Jump if carry", detail: "Taken when CY = 1.", cycles: "10 (always)" },
  JPO: { summary: "Jump if parity odd", detail: "Taken when P = 0.", cycles: "10 (always)" },
  JPE: { summary: "Jump if parity even", detail: "Taken when P = 1.", cycles: "10 (always)" },
  JP: { summary: "Jump if positive (sign clear)", detail: "Taken when S = 0.", cycles: "10 (always)" },
  JM: { summary: "Jump if minus (sign set)", detail: "Taken when S = 1.", cycles: "10 (always)" },
  CALL: { summary: "Subroutine call", detail: "Pushes return address (PC after CALL) and jumps.", cycles: "18" },
  RET: { summary: "Return from subroutine", detail: "Pops PC off the stack.", cycles: "10" },
  PCHL: { summary: "PC = HL", detail: "Indirect jump through HL. Flags unaffected.", cycles: "6" },
  RST: {
    summary: "Restart at vector N×8",
    detail: "`RST n` (n in 0..7) pushes PC and jumps to 0x0000 + n*8.",
    cycles: "12",
  },

  // Stack / IO
  PUSH: { summary: "Push register pair onto stack", detail: "Operand: B, D, H, or PSW. SP -= 2.", cycles: "12" },
  POP: { summary: "Pop register pair from stack", detail: "Operand: B, D, H, or PSW. SP += 2.", cycles: "10" },
  XTHL: { summary: "Exchange HL with [SP]", detail: "16-bit swap of HL and the top of stack.", cycles: "16" },
  SPHL: { summary: "SP = HL", detail: "Copies HL into SP. Flags unaffected.", cycles: "6" },
  IN: { summary: "Read a byte from port", detail: "`IN port` → A = port byte. In the browser this surfaces as an IO trap.", cycles: "10" },
  OUT: { summary: "Write A to port", detail: "`OUT port` writes A. In the browser this surfaces as an IO trap.", cycles: "10" },

  // Control
  HLT: { summary: "Halt CPU", detail: "Stops execution. PC points past HLT.", cycles: "5" },
  NOP: { summary: "No operation", detail: "1 byte, 4 cycles, no side-effects.", cycles: "4" },
  EI: { summary: "Enable interrupts", detail: "Sets the interrupt-enable flip-flop.", cycles: "4" },
  DI: { summary: "Disable interrupts", detail: "Clears the interrupt-enable flip-flop.", cycles: "4" },
  RIM: { summary: "Read interrupt mask", detail: "Reads the SIM mask byte into A. Stubbed in modern8085.", cycles: "4" },
  SIM: { summary: "Set interrupt mask", detail: "Writes A into the SIM mask byte. Stubbed in modern8085.", cycles: "4" },

  // Directives (also surfaced by the hover provider so students see them)
  ORG: { summary: "Set load address", detail: "`ORG addr` — subsequent bytes assemble at addr. Default when omitted: 2000H." },
  EQU: { summary: "Define a symbolic constant", detail: "`NAME EQU value` — resolves wherever NAME is referenced." },
  DB: { summary: "Define byte(s)", detail: "`DB v1, v2, 'AB'` — emits raw bytes inline." },
  DW: { summary: "Define word(s)", detail: "`DW v` — emits two bytes little-endian." },
  DS: { summary: "Reserve byte block", detail: "`DS n` — emits n zero bytes." },
  END: { summary: "End of source", detail: "Optional terminator. The assembler accepts a missing END with a warning." },
};
