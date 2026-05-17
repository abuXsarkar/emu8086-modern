/// Starter 8051 lab programs. A larger canonical library — block
/// move, ascending sort, ones-count, BCD↔hex, etc. — follows in
/// the next PR (see docs/plans/8051-port-research.md §3). These five
/// cover the basic teaching arc: a hello-world, an ALU op with
/// flags, a loop, an XDATA round-trip, and a look-up table.

export type Example = {
  name: string;
  description: string;
  source: string;
  /// IDATA bytes to pre-load (input bytes for the program).
  idata?: Array<{ addr: number; value: number; comment?: string }>;
  /// XDATA bytes to pre-load.
  xdata?: Array<{ addr: number; value: number; comment?: string }>;
  /// Where the result lands so the IDE can scroll the inspector.
  outputSpace?: "idata" | "xdata";
  outputAddr?: number;
  sourceUrl?: string;
};

export const EXAMPLES: Example[] = [
  {
    name: "MOV A, #42H",
    description:
      "Smallest possible program. Loads the literal 42H into A, then halts via `SJMP $`. Use Step to watch A change.",
    source: `; 8051 hello-world: load A, halt.
ORG 0
        MOV   A, #42H
        SJMP  $
`,
  },

  {
    name: "Add two 8-bit numbers",
    description:
      "Reads two operands from IDATA 30H/31H, sums them into A, stores result at 32H and carry-out at 33H.",
    source: `; Add two 8-bit numbers; result + carry stored in IDATA.
ORG 0
        MOV   R0, #30H      ; pointer to first operand
        MOV   A, @R0        ; A <- IDATA[30H]
        INC   R0
        ADD   A, @R0        ; A <- A + IDATA[31H], sets CY
        MOV   32H, A        ; result low byte
        CLR   A
        ADDC  A, #0         ; A <- 0 + CY
        MOV   33H, A        ; carry-out
        SJMP  $
`,
    idata: [
      { addr: 0x30, value: 0xA5, comment: "first operand" },
      { addr: 0x31, value: 0x5B, comment: "second operand (sum = 0x100)" },
    ],
    outputSpace: "idata",
    outputAddr: 0x32,
  },

  {
    name: "Count down with DJNZ",
    description:
      "Canonical 8051 loop: DJNZ R7. Decrements R7 from 10 to 0 and stores each value at IDATA 40H+.",
    source: `; DJNZ loop — fills IDATA 40H..49H with 0AH..01H.
ORG 0
        MOV   R7, #10       ; loop count
        MOV   R0, #40H      ; output pointer
LOOP:   MOV   @R0, R7       ; store current counter
        INC   R0
        DJNZ  R7, LOOP      ; R7-- ; if R7 != 0 -> LOOP
        SJMP  $
`,
    outputSpace: "idata",
    outputAddr: 0x40,
  },

  {
    name: "Copy IDATA → XDATA",
    description:
      "Copies 16 bytes from IDATA 30H..3FH to XDATA 1000H+. Demonstrates `MOVX @DPTR, A`.",
    source: `; Copy IDATA 30H..3FH to XDATA 1000H..100FH.
ORG 0
        MOV   R0, #30H      ; source pointer (IDATA)
        MOV   DPTR, #1000H  ; destination (XDATA)
        MOV   R7, #16       ; byte count
COPY:   MOV   A, @R0
        MOVX  @DPTR, A
        INC   R0
        INC   DPTR
        DJNZ  R7, COPY
        SJMP  $
`,
    idata: [
      { addr: 0x30, value: 0xAA },
      { addr: 0x31, value: 0xBB },
      { addr: 0x32, value: 0xCC },
      { addr: 0x33, value: 0xDD },
    ],
    outputSpace: "xdata",
    outputAddr: 0x1000,
  },

  {
    name: "Square via look-up table (MOVC)",
    description:
      "Reads index from IDATA 30H, returns its square (0-9) via MOVC A,@A+DPTR. Stores result at 31H.",
    source: `; Square 0..9 via a code-memory look-up table.
ORG 0
        MOV   DPTR, #TABLE
        MOV   A, 30H        ; index
        MOVC  A, @A+DPTR    ; A <- CODE[DPTR + A]
        MOV   31H, A
        SJMP  $

TABLE:  DB    0, 1, 4, 9, 16, 25, 36, 49, 64, 81
`,
    idata: [{ addr: 0x30, value: 7, comment: "look up 7^2" }],
    outputSpace: "idata",
    outputAddr: 0x31,
  },
];

export const DEFAULT_SOURCE = EXAMPLES[0]!.source;
