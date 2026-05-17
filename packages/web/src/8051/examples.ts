/// Canonical 8051 lab programs. Sourced from the standard MCU
/// pedagogy arc (Mazidi/Ayala/KIT-style courseware) so any course
/// using the 8051 has at least 80% overlap with this library.
/// Programs are grouped: ALU ops, loops, block ops, sorting, BCD,
/// look-ups, ports. All assemble at ORG 0 with IDATA scratch and
/// XDATA results where the result wouldn't fit in IDATA.

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
LOOP:   MOV   A, R7         ; A <- current counter
        MOV   @R0, A        ; store
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

  {
    name: "Multiply via MUL AB",
    description:
      "Reads operands from IDATA 30H and 31H, multiplies them with `MUL AB`, stores 16-bit product at 32H (low) / 33H (high).",
    source: `; 8-bit unsigned multiply. MUL AB puts low in A, high in B.
ORG 0
        MOV   A, 30H
        MOV   B, 31H
        MUL   AB
        MOV   32H, A        ; product low
        MOV   33H, B        ; product high
        SJMP  $
`,
    idata: [
      { addr: 0x30, value: 0x19, comment: "25 decimal" },
      { addr: 0x31, value: 0x0C, comment: "12 decimal — product 300 = 012CH" },
    ],
    outputSpace: "idata",
    outputAddr: 0x32,
  },

  {
    name: "Divide via DIV AB",
    description:
      "Reads dividend at 30H, divisor at 31H. `DIV AB` writes quotient to A, remainder to B. OV set on divide-by-zero.",
    source: `; 8-bit unsigned divide. Quotient in A, remainder in B.
ORG 0
        MOV   A, 30H
        MOV   B, 31H
        DIV   AB
        MOV   32H, A        ; quotient
        MOV   33H, B        ; remainder
        SJMP  $
`,
    idata: [
      { addr: 0x30, value: 100, comment: "dividend" },
      { addr: 0x31, value: 7, comment: "divisor — 100/7 = 14 rem 2" },
    ],
    outputSpace: "idata",
    outputAddr: 0x32,
  },

  {
    name: "Find largest of N bytes",
    description:
      "Walks IDATA 40H..(40H + count − 1) tracking the running max. Count at 30H, result at 31H. Classic lab exercise.",
    source: `; Linear max over IDATA[40H..40H+count-1].
ORG 0
        MOV   R7, 30H       ; count
        MOV   R0, #40H      ; pointer
        MOV   A, @R0        ; seed max = first byte
        INC   R0
        DEC   R7            ; one already consumed
LOOP:   MOV   B, A          ; save current max in B (temp)
        MOV   A, @R0        ; A <- next candidate
        CJNE  A, B, NEQ
        SJMP  KEEP          ; equal — keep current max
NEQ:    JNC   KEEP          ; candidate > max ? CY=0 means A >= B
        MOV   A, B          ; smaller — restore max
KEEP:   INC   R0
        DJNZ  R7, LOOP
        MOV   31H, A
        SJMP  $
`,
    idata: [
      { addr: 0x30, value: 5, comment: "count" },
      { addr: 0x40, value: 0x12 },
      { addr: 0x41, value: 0x7F },
      { addr: 0x42, value: 0x34 },
      { addr: 0x43, value: 0x05 },
      { addr: 0x44, value: 0x6E, comment: "max = 7F" },
    ],
    outputSpace: "idata",
    outputAddr: 0x31,
  },

  {
    name: "Ascending bubble sort",
    description:
      "Sorts the IDATA buffer at 40H+ in place. Count at 30H. Demonstrates nested DJNZ + XCH for the swap.",
    source: `; Bubble sort IDATA[40H..40H+N-1] ascending.
ORG 0
        MOV   R7, 30H       ; outer count
        DEC   R7            ; N-1 passes
OUTER:  MOV   R6, 30H
        DEC   R6            ; inner = N-1
        MOV   R0, #40H
INNER:  MOV   A, @R0        ; A <- a[i]
        INC   R0
        MOV   B, @R0        ; B <- a[i+1]
        CJNE  A, B, NEQ
        SJMP  NEXT          ; equal, no swap
NEQ:    JC    NEXT          ; A < B already ordered (CY set means A<B)
        MOV   @R0, A        ; swap: a[i+1] <- old a[i]
        DEC   R0
        MOV   @R0, B
        INC   R0
NEXT:   DJNZ  R6, INNER
        DJNZ  R7, OUTER
        SJMP  $
`,
    idata: [
      { addr: 0x30, value: 6, comment: "count" },
      { addr: 0x40, value: 0x44 },
      { addr: 0x41, value: 0x11 },
      { addr: 0x42, value: 0x66 },
      { addr: 0x43, value: 0x22 },
      { addr: 0x44, value: 0x55 },
      { addr: 0x45, value: 0x33 },
    ],
    outputSpace: "idata",
    outputAddr: 0x40,
  },

  {
    name: "Count set bits in a byte",
    description:
      "Population count of IDATA 30H using `RRC A` + counting CY. Result at 31H. Demonstrates bit-shift + carry-aware control flow.",
    source: `; Hamming weight of IDATA[30H], result at 31H.
ORG 0
        MOV   A, 30H
        MOV   R7, #8        ; 8 bits to inspect
        MOV   R6, #0        ; counter
LOOP:   RRC   A             ; LSB -> CY
        JNC   SKIP
        INC   R6
SKIP:   DJNZ  R7, LOOP
        MOV   A, R6
        MOV   31H, A
        SJMP  $
`,
    idata: [{ addr: 0x30, value: 0xB7, comment: "10110111 → 6 bits set" }],
    outputSpace: "idata",
    outputAddr: 0x31,
  },

  {
    name: "Unpacked BCD → packed BCD",
    description:
      "Reads two unpacked-BCD digits at 30H (high nibble) and 31H (low nibble) and packs them into one byte at 32H. Uses SWAP + ORL.",
    source: `; Pack two unpacked BCD digits into one byte.
ORG 0
        MOV   A, 30H        ; high digit (0..9 in low nibble)
        SWAP  A             ; nibbles swapped: digit -> high nibble
        ORL   A, 31H        ; OR in low digit
        MOV   32H, A
        SJMP  $
`,
    idata: [
      { addr: 0x30, value: 0x07 },
      { addr: 0x31, value: 0x03, comment: "result = 73H" },
    ],
    outputSpace: "idata",
    outputAddr: 0x32,
  },

  {
    name: "ASCII digit → binary",
    description:
      "Subtracts 30H from the ASCII digit at IDATA 30H, writing the 0..9 value to 31H. Standard input-parse primitive.",
    source: `; ASCII '0'..'9' -> 0..9
ORG 0
        MOV   A, 30H
        CLR   C
        SUBB  A, #30H       ; A <- A - '0'
        MOV   31H, A
        SJMP  $
`,
    idata: [{ addr: 0x30, value: 0x37, comment: "'7' = 37H" }],
    outputSpace: "idata",
    outputAddr: 0x31,
  },

  {
    name: "Block fill XDATA",
    description:
      "Fills XDATA 2000H..200FH with the byte at IDATA 30H. Useful primitive for buffer init demos.",
    source: `; memset XDATA 2000H..200FH with IDATA[30H].
ORG 0
        MOV   A, 30H
        MOV   DPTR, #2000H
        MOV   R7, #16
FILL:   MOVX  @DPTR, A
        INC   DPTR
        DJNZ  R7, FILL
        SJMP  $
`,
    idata: [{ addr: 0x30, value: 0xAA, comment: "fill pattern" }],
    outputSpace: "xdata",
    outputAddr: 0x2000,
  },

  {
    name: "Block reverse",
    description:
      "Reverses 8 bytes from IDATA 40H..47H in place using two pointers and XCH. Classic two-finger algorithm.",
    source: `; Reverse IDATA[40H..47H] in place.
ORG 0
        MOV   R0, #40H      ; left
        MOV   R1, #47H      ; right
        MOV   R7, #4        ; swap 4 pairs
LOOP:   MOV   A, @R0
        XCH   A, @R1
        MOV   @R0, A
        INC   R0
        DEC   R1
        DJNZ  R7, LOOP
        SJMP  $
`,
    idata: [
      { addr: 0x40, value: 0x11 },
      { addr: 0x41, value: 0x22 },
      { addr: 0x42, value: 0x33 },
      { addr: 0x43, value: 0x44 },
      { addr: 0x44, value: 0x55 },
      { addr: 0x45, value: 0x66 },
      { addr: 0x46, value: 0x77 },
      { addr: 0x47, value: 0x88 },
    ],
    outputSpace: "idata",
    outputAddr: 0x40,
  },

  {
    name: "Fibonacci series (first 10)",
    description:
      "Computes the first 10 Fibonacci numbers into IDATA 40H+. Demonstrates running-state via two registers + memory.",
    source: `; Fib(0..9) into IDATA[40H..49H].
ORG 0
        MOV   R0, #40H
        MOV   A, #0
        MOV   @R0, A        ; Fib(0) = 0
        INC   R0
        MOV   A, #1
        MOV   @R0, A        ; Fib(1) = 1
        INC   R0
        MOV   R7, #8        ; 8 more
        MOV   B, #1         ; B = Fib(n-1)
        MOV   R2, #0        ; R2 = Fib(n-2)
LOOP:   MOV   A, B
        ADD   A, R2         ; Fib(n) = Fib(n-1) + Fib(n-2)
        MOV   @R0, A
        INC   R0
        MOV   R2, B         ; shift window
        MOV   B, A
        DJNZ  R7, LOOP
        SJMP  $
`,
    outputSpace: "idata",
    outputAddr: 0x40,
  },

  {
    name: "Delay loop (~ N machine cycles)",
    description:
      "Three nested DJNZ loops — the textbook 8051 delay primitive. Doesn't write anywhere; watch the cycle counter climb.",
    source: `; Triple-nested DJNZ ≈ 100 * 200 * 2 = 40 000 cycles.
ORG 0
        MOV   R7, #100
OUT:    MOV   R6, #200
MID:    MOV   R5, #2
INN:    DJNZ  R5, INN
        DJNZ  R6, MID
        DJNZ  R7, OUT
        SJMP  $
`,
  },
];

export const DEFAULT_SOURCE = EXAMPLES[0]!.source;
