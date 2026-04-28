// Short docs for 8086 mnemonics. Each entry is the brief Intel-manual
// description plus a flag-effect summary in `[]`. Hover over a token
// in the editor and Monaco shows the corresponding tooltip.
//
// Lower-case keys match what `getWordAtPosition` returns from a
// case-insensitive token grammar. We surface the ones a typical lab
// program uses; the long tail is reachable from the in-app reference
// (M3.4).

export const OPCODE_DOCS: Record<string, string> = {
  // --- data movement ---
  mov: "Move (copy) the source operand to the destination. No flags affected.",
  lea: "Load Effective Address — write the offset (not the dereferenced value) of the memory operand into the destination register.",
  xchg: "Exchange the contents of source and destination.",
  push: "Decrement SP by 2, then write operand to SS:SP (top of stack).",
  pop: "Read top of stack into the destination, then increment SP by 2.",
  pushf: "Push FLAGS register onto the stack.",
  popf: "Pop top of stack into the FLAGS register.",
  xlat: "AL = [DS:BX + AL]. Table-lookup translation.",
  xlatb: "AL = [DS:BX + AL]. Same as XLAT.",

  // --- arithmetic ---
  add: "Destination ← destination + source. [CF, OF, SF, ZF, AF, PF]",
  sub: "Destination ← destination − source. [CF, OF, SF, ZF, AF, PF]",
  adc: "Destination ← destination + source + CF. [CF, OF, SF, ZF, AF, PF]",
  sbb: "Destination ← destination − source − CF. [CF, OF, SF, ZF, AF, PF]",
  cmp: "Compare: subtract source from destination, set flags, **discard** result. [CF, OF, SF, ZF, AF, PF]",
  inc: "Destination ← destination + 1. CF preserved; [OF, SF, ZF, AF, PF]",
  dec: "Destination ← destination − 1. CF preserved; [OF, SF, ZF, AF, PF]",
  neg: "Destination ← 0 − destination (two's-complement negate). CF set unless operand was 0.",
  mul: "Unsigned multiply: AX ← AL · r/m8, or DX:AX ← AX · r/m16. [CF, OF set if high half ≠ 0]",
  imul: "Signed multiply: AX ← AL · r/m8, or DX:AX ← AX · r/m16 (signed). [CF, OF set if result doesn't fit in low half]",
  div: "Unsigned divide AX by r/m8 → AL=quot, AH=rem (or DX:AX/r/m16). Divide-by-0 or quotient overflow traps.",
  idiv: "Signed divide. Same shape as DIV; quotient must fit in i8 or i16.",

  // --- logical ---
  and: "Destination ← destination AND source. [CF=0, OF=0, SF, ZF, PF]",
  or: "Destination ← destination OR source. [CF=0, OF=0, SF, ZF, PF]",
  xor: "Destination ← destination XOR source. [CF=0, OF=0, SF, ZF, PF]",
  not: "Destination ← bitwise NOT. No flags affected.",
  test: "AND destination with source, set flags, **discard** result. [CF=0, OF=0, SF, ZF, PF]",

  // --- shifts and rotates ---
  shl: "Shift left logical. CF ← bit shifted out. Count = 1 or CL.",
  sal: "Same as SHL.",
  shr: "Shift right logical (zero-fill). CF ← bit shifted out.",
  sar: "Shift right arithmetic (sign-extend). CF ← bit shifted out.",
  rol: "Rotate left. CF ← bit that wrapped from MSB to LSB.",
  ror: "Rotate right. CF ← bit that wrapped from LSB to MSB.",
  rcl: "Rotate left through CF. The bit shifted out goes to CF; old CF goes in at LSB.",
  rcr: "Rotate right through CF. Mirror image of RCL.",

  // --- control flow ---
  jmp: "Unconditional jump. Near (rel16) form is what this assembler emits.",
  call: "Push IP-after-instruction, then jump to target.",
  ret: "Pop IP from the stack. Optional `imm16` cleans that many bytes off the stack first.",
  iret: "Return from interrupt: pop IP, CS, FLAGS in that order.",
  int: "Software interrupt. The runtime intercepts INT 21h (DOS subset: 01h, 02h, 06h, 09h, 4Ch).",
  loop: "CX ← CX − 1; if CX ≠ 0 jump to rel8 target.",
  loope: "CX ← CX − 1; if CX ≠ 0 **and** ZF = 1 jump.",
  loopz: "Same as LOOPE.",
  loopne: "CX ← CX − 1; if CX ≠ 0 **and** ZF = 0 jump.",
  loopnz: "Same as LOOPNE.",
  jcxz: "If CX = 0 jump to rel8 target. Does **not** decrement CX.",

  // Conditional jumps — names sorted by their primary common form.
  jz: "Jump if Zero (ZF = 1).",
  je: "Jump if Equal (ZF = 1). Same as JZ.",
  jnz: "Jump if Not Zero (ZF = 0).",
  jne: "Jump if Not Equal (ZF = 0). Same as JNZ.",
  jc: "Jump if Carry (CF = 1).",
  jb: "Jump if Below — unsigned (CF = 1).",
  jnae: "Jump if Not Above or Equal (CF = 1).",
  jnc: "Jump if Not Carry (CF = 0).",
  jae: "Jump if Above or Equal — unsigned (CF = 0).",
  jnb: "Jump if Not Below (CF = 0).",
  ja: "Jump if Above — unsigned (CF = 0 and ZF = 0).",
  jnbe: "Jump if Not Below or Equal (CF = 0 and ZF = 0).",
  jbe: "Jump if Below or Equal — unsigned (CF = 1 or ZF = 1).",
  jna: "Jump if Not Above (CF = 1 or ZF = 1).",
  js: "Jump if Sign (SF = 1).",
  jns: "Jump if Not Sign (SF = 0).",
  jo: "Jump if Overflow (OF = 1).",
  jno: "Jump if Not Overflow (OF = 0).",
  jp: "Jump if Parity even (PF = 1).",
  jpe: "Jump if Parity Even (PF = 1).",
  jnp: "Jump if Not Parity (PF = 0).",
  jpo: "Jump if Parity Odd (PF = 0).",
  jl: "Jump if Less — signed (SF ≠ OF).",
  jnge: "Jump if Not Greater or Equal (SF ≠ OF).",
  jge: "Jump if Greater or Equal — signed (SF = OF).",
  jnl: "Jump if Not Less (SF = OF).",
  jle: "Jump if Less or Equal — signed (ZF = 1 or SF ≠ OF).",
  jng: "Jump if Not Greater (ZF = 1 or SF ≠ OF).",
  jg: "Jump if Greater — signed (ZF = 0 and SF = OF).",
  jnle: "Jump if Not Less or Equal (ZF = 0 and SF = OF).",

  // --- string ops ---
  movsb: "Copy [DS:SI] → [ES:DI], advance SI/DI by 1 (per DF). Often prefixed with REP.",
  movsw: "Copy word [DS:SI] → [ES:DI], advance SI/DI by 2. Often prefixed with REP.",
  cmpsb: "Compare bytes [DS:SI] vs [ES:DI], set flags, advance SI/DI. Often prefixed with REPE/REPNE.",
  cmpsw: "Compare words [DS:SI] vs [ES:DI], set flags, advance SI/DI by 2.",
  lodsb: "AL ← [DS:SI], advance SI by 1.",
  lodsw: "AX ← [DS:SI], advance SI by 2.",
  stosb: "[ES:DI] ← AL, advance DI by 1. With REP, fills a buffer.",
  stosw: "[ES:DI] ← AX, advance DI by 2.",
  scasb: "Compare AL vs [ES:DI], set flags, advance DI by 1. With REPNE, classic strlen.",
  scasw: "Compare AX vs [ES:DI], set flags, advance DI by 2.",
  rep: "Repeat the next string op while CX ≠ 0. Decrements CX before each iteration.",
  repe: "REP + only continue while ZF = 1 (use with CMPS / SCAS).",
  repz: "Same as REPE.",
  repne: "REP + only continue while ZF = 0 (use with CMPS / SCAS).",
  repnz: "Same as REPNE.",

  // --- misc ---
  in: "Read a byte (or word) from an I/O port. AL ← port[DX] / port[imm8].",
  out: "Write AL (or AX) to an I/O port.",
  cbw: "Sign-extend AL into AH (so AX is a sign-extended AL).",
  cwd: "Sign-extend AX into DX (so DX:AX is a sign-extended AX).",
  lahf: "AH ← low byte of FLAGS.",
  sahf: "Low byte of FLAGS ← AH (only the documented bits).",

  // --- flag manipulators ---
  clc: "Clear Carry Flag (CF ← 0).",
  stc: "Set Carry Flag (CF ← 1).",
  cmc: "Complement Carry Flag (CF ← !CF).",
  cld: "Clear Direction Flag (DF ← 0; string ops increment SI/DI).",
  std: "Set Direction Flag (DF ← 1; string ops decrement SI/DI).",
  cli: "Clear Interrupt Enable (IF ← 0).",
  sti: "Set Interrupt Enable (IF ← 1).",

  // --- halt / no-op ---
  hlt: "Halt: stop fetching instructions until an interrupt arrives.",
  nop: "No operation. Encoded as XCHG AX, AX.",

  // --- directives ---
  org: "Set the origin offset for label addresses. `org 100h` is the .com convention.",
  db: "Define byte(s). Accepts numbers, char literals, strings, and DUP groups.",
  dw: "Define word(s). Same data-item shapes as db, but each item is 2 bytes.",
  equ: "Define a named constant: `name EQU value`.",
  dup: "Repeat: `count DUP(items…)` emits the inner items `count` times.",
  ptr: "Memory size override modifier (`BYTE PTR [bx]`, `WORD PTR [bx]`).",
  byte: "Modifier for `BYTE PTR …` — force 8-bit memory operation.",
  word: "Modifier for `WORD PTR …` — force 16-bit memory operation.",
};
