/// Canonical 8085 lab programs, sourced from GfG / Tutorialspoint
/// (see docs/plans/8085-port-research.md §3). Standardised on
/// ORG 2000H with inputs at 2050H+ and outputs at 3050H+ so a
/// single memory-inspector preset works for all of them.

export type Example = {
  name: string;
  description: string;
  source: string;
  /// Address(es) the program reads its input(s) from. The IDE will
  /// surface a one-click "load demo inputs" button per example.
  inputs?: Array<{ addr: number; value: number; comment?: string }>;
  /// Where the result lands so the IDE can pre-scroll the memory
  /// inspector after Run halts.
  outputAddr?: number;
  /// Source URL (textbook/blog) the program was taken from.
  sourceUrl: string;
};

export const EXAMPLES: Example[] = [
  {
    name: "Add two 8-bit numbers",
    description:
      "Loads two bytes from 2050H/2051H, sums them, stores the 8-bit result at 3050H and the carry-out at 3051H.",
    source: `; Add two 8-bit numbers, with carry
        ORG  2000H
        LDA  2050H      ; A <- first operand
        MOV  H, A       ; save in H
        LDA  2051H      ; A <- second operand
        ADD  H          ; A <- A + H
        MOV  L, A       ; low byte of result
        MVI  A, 00H
        ADC  A          ; A <- 0 + 0 + carry
        MOV  H, A       ; high byte (carry)
        SHLD 3050H      ; L->3050, H->3051
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 0x12, comment: "first operand" },
      { addr: 0x2051, value: 0x34, comment: "second operand" },
    ],
    outputAddr: 0x3050,
    sourceUrl:
      "https://www.geeksforgeeks.org/computer-organization-architecture/assembly-language-program-8085-microprocessor-add-two-8-bit-numbers/",
  },

  {
    name: "Subtract two 8-bit numbers (with borrow)",
    description: "Computes [2500H] - [2501H]; result at 2502H, borrow flag at 2503H.",
    source: `; Subtract two 8-bit numbers with borrow tracking
        ORG  2000H
        MVI  C, 00H     ; borrow counter = 0
        LHLD 2500H      ; H <- [2500], L <- [2501]
        MOV  A, H
        SUB  L          ; A <- H - L
        JNC  NOBRW
        INR  C          ; borrow occurred
NOBRW:  STA  2502H      ; store difference
        MOV  A, C
        STA  2503H      ; store borrow flag
        HLT
`,
    inputs: [
      { addr: 0x2500, value: 0x42 },
      { addr: 0x2501, value: 0x10 },
    ],
    outputAddr: 0x2502,
    sourceUrl:
      "https://www.geeksforgeeks.org/8085-program-subtract-two-8-bit-numbers-without-borrow/",
  },

  {
    name: "Multiply two 8-bit numbers (repeated addition)",
    description:
      "16-bit product at 3050H/3051H of multiplicand * multiplier loaded from 2050H/2051H.",
    source: `; 8-bit x 8-bit -> 16-bit product, via repeated addition
        ORG  2000H
        LHLD 2050H      ; L <- multiplicand, H <- multiplier
        XCHG            ; DE <- HL
        MOV  C, D       ; C <- multiplier (loop count)
        MVI  D, 00H     ; clear D so DE = 00:multiplicand
        LXI  H, 0000H   ; HL <- 0 (accumulator)
LOOP:   DAD  D          ; HL <- HL + DE
        DCR  C
        JNZ  LOOP
        SHLD 3050H      ; store 16-bit product
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 0x0C, comment: "multiplicand" },
      { addr: 0x2051, value: 0x07, comment: "multiplier" },
    ],
    outputAddr: 0x3050,
    sourceUrl:
      "https://www.geeksforgeeks.org/computer-organization-architecture/assembly-language-program-multiply-two-8-bit-numbers-8085-microprocessor/",
  },

  {
    name: "Find the largest in an array",
    description: "Count at 2050H, array from 2051H. Result at 3050H.",
    source: `; Find largest byte in an array
        ORG  2000H
        LXI  H, 2050H
        MOV  C, M       ; C <- count
        DCR  C          ; n-1 comparisons
        INX  H
        MOV  A, M       ; A <- first element
LOOP:   INX  H
        CMP  M
        JNC  SKIP       ; if A >= M, keep A
        MOV  A, M       ; else A <- M
SKIP:   DCR  C
        JNZ  LOOP
        STA  3050H
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 5 },
      { addr: 0x2051, value: 0x12 },
      { addr: 0x2052, value: 0x77 },
      { addr: 0x2053, value: 0x34 },
      { addr: 0x2054, value: 0xAB },
      { addr: 0x2055, value: 0x09 },
    ],
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/assembly-language-program-find-largest-number-array/",
  },

  {
    name: "Bubble sort ascending",
    description: "Count at 2040H, list from 2041H. Sorts in place.",
    source: `; Bubble sort in ascending order
        ORG  2000H
START:  LXI  H, 2040H
        MVI  D, 00H     ; swap flag
        MOV  C, M       ; C <- count
        DCR  C          ; n-1 passes
        INX  H
CHECK:  MOV  A, M
        INX  H
        CMP  M
        JC   NEXT       ; if A < M, no swap
        JZ   NEXT
        MOV  B, M
        MOV  M, A
        DCX  H
        MOV  M, B       ; swap done
        INX  H
        MVI  D, 01H     ; flag a swap
NEXT:   DCR  C
        JNZ  CHECK
        MOV  A, D
        CPI  01H
        JZ   START      ; another pass needed
        HLT
`,
    inputs: [
      { addr: 0x2040, value: 5 },
      { addr: 0x2041, value: 0x34 },
      { addr: 0x2042, value: 0x11 },
      { addr: 0x2043, value: 0x77 },
      { addr: 0x2044, value: 0x09 },
      { addr: 0x2045, value: 0x22 },
    ],
    outputAddr: 0x2041,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-bubble-sort/",
  },

  {
    name: "16-bit addition (DAD)",
    description: "Inputs at 2050H/2051H + 2052H/2053H (little-endian). Result at 3050H/3051H.",
    source: `; 16-bit add via DAD; carry-out can be captured with ACI 0
        ORG  2000H
        LHLD 2050H
        XCHG            ; DE <- first
        LHLD 2052H
        DAD  D          ; HL <- HL + DE
        SHLD 3050H
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 0x34 },
      { addr: 0x2051, value: 0x12 }, // first = 0x1234
      { addr: 0x2052, value: 0xCD },
      { addr: 0x2053, value: 0xAB }, // second = 0xABCD
    ],
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-add-two-16-bit-numbers/",
  },

  {
    name: "Fibonacci series (first 8 terms after the seeds)",
    description: "Stores 10 bytes from 3050H: 0,1,1,2,3,5,8,13,21,34.",
    source: `; Fibonacci series, first 8 terms after the two seeds
        ORG  2000H
        LXI  H, 3050H
        MVI  C, 08H     ; number of terms after the seeds
        MVI  B, 00H     ; F0
        MVI  D, 01H     ; F1
        MOV  M, B       ; store 00
        INX  H
        MOV  M, D       ; store 01
NEXT:   MOV  A, B
        ADD  D          ; A <- B + D
        MOV  B, D
        MOV  D, A
        INX  H
        MOV  M, A
        DCR  C
        JNZ  NEXT
        HLT
`,
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-generate-fibonacci-series/",
  },

  {
    name: "Divide 8-bit by 8-bit (repeated subtraction)",
    description: "Divisor at 2050H, dividend at 2051H. Remainder at 3050H, quotient at 3051H.",
    source: `; 8-bit / 8-bit -> quotient + remainder via repeated subtract
        ORG  2000H
        LXI  H, 2050H
        MOV  B, M       ; B <- divisor
        MVI  C, 00H     ; C <- quotient
        INX  H
        MOV  A, M       ; A <- dividend
LOOP:   CMP  B
        JC   DONE       ; if A < B, stop
        SUB  B
        INR  C
        JMP  LOOP
DONE:   STA  3050H      ; remainder
        MOV  A, C
        STA  3051H      ; quotient
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 0x07, comment: "divisor" },
      { addr: 0x2051, value: 0x2D, comment: "dividend (45)" },
    ],
    outputAddr: 0x3050,
    sourceUrl:
      "https://www.geeksforgeeks.org/computer-organization-architecture/8085-program-to-divide-two-8-bit-numbers/",
  },

  {
    name: "Find the smallest in an array",
    description: "Count at 2050H, array from 2051H. Result at 3050H.",
    source: `; Find smallest byte in an array
        ORG  2000H
        LXI  H, 2050H
        MOV  C, M       ; C <- size
        INX  H
        MOV  B, M       ; B <- first element (running min)
        DCR  C
LOOP:   INX  H
        MOV  A, M
        CMP  B
        JNC  SKIP       ; if A >= B, skip
        MOV  B, A       ; else update min
SKIP:   DCR  C
        JNZ  LOOP
        MOV  A, B
        STA  3050H
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 5 },
      { addr: 0x2051, value: 0x42 },
      { addr: 0x2052, value: 0x10 },
      { addr: 0x2053, value: 0x77 },
      { addr: 0x2054, value: 0x05 },
      { addr: 0x2055, value: 0x88 },
    ],
    outputAddr: 0x3050,
    sourceUrl:
      "https://www.tutorialspoint.com/program-to-find-the-smallest-number-in-an-array-of-data-in-8085-microprocessor",
  },

  {
    name: "BCD to binary conversion",
    description: "Packed BCD at 2050H → binary at 3050H. e.g. 0x42 → 0x2A (42 decimal).",
    source: `; Convert packed BCD (e.g. 42H representing 42 decimal) to binary
        ORG  2000H
        LDA  2050H      ; A <- packed BCD
        MOV  B, A
        ANI  0FH        ; mask units
        MOV  C, A       ; C <- units digit
        MOV  A, B
        ANI  0F0H       ; mask tens
        JZ   SKIP
        RRC
        RRC
        RRC
        RRC             ; tens digit in low nibble
        MOV  D, A
        XRA  A
        MVI  E, 0AH     ; multiply by 10
SUM:    ADD  D
        DCR  E
        JNZ  SUM
SKIP:   ADD  C
        STA  3050H
        HLT
`,
    inputs: [{ addr: 0x2050, value: 0x42, comment: "BCD 42" }],
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-to-convert-a-bcd-number-to-binary/",
  },

  {
    name: "Binary to BCD conversion",
    description:
      "Binary count N at 2050H → packed BCD at 3050H (units+tens) and hundreds at 3051H.",
    source: `; Convert an N-byte binary count to BCD via DAA increments
        ORG  2000H
        LXI  H, 2050H
        MVI  D, 00H     ; hundreds counter
        XRA  A
        MOV  C, M       ; C <- binary count
LOOP:   ADI  01H
        DAA             ; decimal-adjust
        JNC  SKIP
        INR  D
SKIP:   DCR  C
        JNZ  LOOP
        STA  3050H      ; units+tens
        MOV  A, D
        STA  3051H      ; hundreds
        HLT
`,
    inputs: [{ addr: 0x2050, value: 0x7B, comment: "binary 123" }],
    outputAddr: 0x3050,
    sourceUrl: "https://www.tutorialspoint.com/8085-program-to-convert-an-8-bit-binary-to-bcd",
  },

  {
    name: "16-bit subtraction",
    description: "Minuend at 2050H/2051H, subtrahend at 2052H/2053H. Result at 2054H/2055H.",
    source: `; 16-bit subtract with borrow propagation
        ORG  2000H
        LHLD 2050H
        XCHG            ; DE <- first
        LHLD 2052H
        MOV  A, E
        SUB  L          ; low byte
        STA  2054H
        MOV  A, D
        SBB  H          ; high byte with borrow
        STA  2055H
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 0x00 },
      { addr: 0x2051, value: 0x12 },
      { addr: 0x2052, value: 0xFF },
      { addr: 0x2053, value: 0x10 },
    ],
    outputAddr: 0x2054,
    sourceUrl:
      "https://www.geeksforgeeks.org/8085-program-to-subtract-two-16-bit-numbers-with-or-without-borrow/",
  },

  {
    name: "Square of a small number",
    description: "N at 2050H → N² at 3050H (caveat: N>0FH overflows 8 bits).",
    source: `; Square of N via N additions of N
        ORG  2000H
        LXI  H, 2050H
        MVI  A, 00H
        MOV  B, M       ; B <- N (counter)
ADD_LP: ADD  M          ; add N to A, N times
        DCR  B
        JNZ  ADD_LP
        STA  3050H
        HLT
`,
    inputs: [{ addr: 0x2050, value: 0x0B, comment: "N = 11" }],
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-find-square-8-bit-number/",
  },

  {
    name: "Factorial of an 8-bit number",
    description: "N at 2050H → N! (low byte) at 3050H. Small N only (N>5 overflows).",
    source: `; N! via call/return; main loop multiplies running product by B
        ORG  2000H
        LDA  2050H
        MOV  B, A       ; B <- N
        MVI  D, 01H     ; D <- running product
FACT:   CALL MULT
        DCR  B
        JNZ  FACT
        MOV  A, D
        STA  3050H
        HLT

MULT:   MOV  E, B       ; loop count = B
        MVI  A, 00H
MLOOP:  ADD  D          ; A <- A + D, B times
        DCR  E
        JNZ  MLOOP
        MOV  D, A       ; D <- D * B
        RET
`,
    inputs: [{ addr: 0x2050, value: 0x05, comment: "5! = 120 = 78H" }],
    outputAddr: 0x3050,
    sourceUrl:
      "https://www.geeksforgeeks.org/assembly-language-program-8085-microprocessor-find-factorial-number/",
  },

  {
    name: "Count negative / zero / positive in array",
    description:
      "50 signed bytes from 2100H. Negatives at 3050H, zeros at 3051H, positives at 3052H.",
    source: `; Count -/0/+ across 50 signed bytes (sign-bit test for negatives)
        ORG  2000H
        LXI  H, 2100H
        MVI  C, 00H     ; index counter
        MVI  B, 00H     ; negative count
        MVI  E, 00H     ; zero count
        MVI  D, 00H     ; positive count (note: patch over the GfG bug)
BEGIN:  MOV  A, M
        CPI  00H
        JZ   ZERONUM
        ANI  80H        ; test sign bit
        JNZ  NEGNUM
        INR  D
        JMP  LAST
ZERONUM:INR  E
        JMP  LAST
NEGNUM: INR  B
LAST:   INX  H
        INR  C
        MOV  A, C
        CPI  32H        ; 50 elements?
        JNZ  BEGIN
        LXI  H, 3050H
        MOV  M, B
        INX  H
        MOV  M, E
        INX  H
        MOV  M, D
        HLT
`,
    outputAddr: 0x3050,
    sourceUrl: "http://microprocesser.blogspot.com/2009/09/find-number-of-negative-zero-and.html",
  },

  {
    name: "Separate even and odd numbers",
    description:
      "50 bytes from 2100H → odds collected from 2200H, evens collected from 2300H.",
    source: `; Walk a 50-byte array and split into even/odd output streams
        ORG  2000H
        LXI  H, 2100H   ; source
        LXI  D, 2200H   ; odd destination
        MVI  C, 32H     ; 50 elements
ODDLP:  MOV  A, M
        ANI  01H
        JZ   ODDSKIP
        MOV  A, M
        STAX D
        INX  D
ODDSKIP:INX  H
        DCR  C
        JNZ  ODDLP
        LXI  H, 2100H
        LXI  D, 2300H   ; even destination
        MVI  C, 32H
EVNLP:  MOV  A, M
        ANI  01H
        JNZ  EVNSKIP
        MOV  A, M
        STAX D
        INX  D
EVNSKIP:INX  H
        DCR  C
        JNZ  EVNLP
        HLT
`,
    outputAddr: 0x2200,
    sourceUrl:
      "https://www.geeksforgeeks.org/8085-program-to-separate-odd-and-even-nos-from-a-given-list-of-numbers/",
  },

  {
    name: "Sum of a series of N numbers",
    description: "Count at 2050H, series from 2051H. Sum at 3050H, carry-count at 3051H.",
    source: `; Sum a series with carry propagation
        ORG  2000H
        LDA  2050H
        MOV  B, A       ; B <- count
        LXI  H, 2051H
        MVI  A, 00H
        MVI  C, 00H     ; carry counter
SUMLP:  ADD  M
        INX  H          ; INX H (not INR L) to survive L wraparound
        JNC  NOCY
        INR  C
NOCY:   DCR  B
        JNZ  SUMLP
        STA  3050H
        MOV  A, C
        STA  3051H
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 5 },
      { addr: 0x2051, value: 0x10 },
      { addr: 0x2052, value: 0x20 },
      { addr: 0x2053, value: 0x30 },
      { addr: 0x2054, value: 0x40 },
      { addr: 0x2055, value: 0x50 },
    ],
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-to-add-numbers-in-an-array/",
  },

  {
    name: "Prime number check",
    description:
      "N at 2050H → 01H if prime, 00H if not, written to 3050H. Uses count-divisors-equals-2.",
    source: `; Count divisors of N; if exactly 2, N is prime
        ORG  2000H
        LDA  2050H
        MVI  C, 00H     ; divisor count
        MOV  E, A       ; outer iterator
        MOV  B, A       ; save original
LOOP1:  MOV  D, E       ; trial divisor
        MOV  A, B       ; restore N
LOOP2:  CMP  D
        JC   DONE2
        SUB  D
        JMP  LOOP2
DONE2:  CPI  00H
        JNZ  NEXT
        INR  C          ; exact divisor found
NEXT:   DCR  E
        JNZ  LOOP1
        MOV  A, C
        CPI  02H
        JNZ  NOTPR
        MVI  A, 01H
        JMP  SAVE
NOTPR:  MVI  A, 00H
SAVE:   STA  3050H
        HLT
`,
    inputs: [{ addr: 0x2050, value: 0x07, comment: "7 is prime" }],
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-to-determine-if-the-number-is-prime-or-not/",
  },

  {
    name: "ASCII to HEX",
    description: "ASCII byte at 2050H → 4-bit hex nibble at 3050H. Accepts '0'-'9' and 'A'-'F'.",
    source: `; '0'-'9' / 'A'-'F' to its hex nibble
        ORG  2000H
        LDA  2050H
        SUI  30H        ; subtract '0'
        CPI  0AH
        JC   STORE      ; if < 10, done
        SUI  07H        ; else subtract 7 ('A' - '9' - 1)
STORE:  STA  3050H
        HLT
`,
    inputs: [{ addr: 0x2050, value: 0x42, comment: "ASCII 'B' = 42H → 0BH" }],
    outputAddr: 0x3050,
    sourceUrl: "https://www.geeksforgeeks.org/8085-program-to-convert-ascii-code-into-hex-code/",
  },

  {
    name: "Block data transfer (with overlap)",
    description:
      "Copies a count-prefixed block from 2050H to 2080H using the stack to handle overlap.",
    source: `; Save bytes on stack, then pop into destination — survives overlap
        ORG  2000H
        LXI  H, 2050H
        LXI  SP, 2FFEH
        MOV  B, M       ; B <- length (saved)
        MOV  C, M       ; C <- length (working copy)
        INX  H
SAVE:   MVI  D, 00H
        MOV  E, M
        PUSH D          ; push onto stack
        DCR  C
        INX  H
        JNZ  SAVE
        MOV  C, B       ; restore length
        LXI  D, 2080H   ; dest base
        XCHG            ; HL <- dest base
        DAD  B          ; HL <- dest base + len
        DCX  H
COPY:   POP  D
        MOV  M, E       ; store byte
        DCR  C
        DCX  H
        JNZ  COPY
        HLT
`,
    inputs: [
      { addr: 0x2050, value: 5, comment: "length" },
      { addr: 0x2051, value: 0xAA },
      { addr: 0x2052, value: 0xBB },
      { addr: 0x2053, value: 0xCC },
      { addr: 0x2054, value: 0xDD },
      { addr: 0x2055, value: 0xEE },
    ],
    outputAddr: 0x2080,
    sourceUrl:
      "https://www.geeksforgeeks.org/8085-program-to-copy-a-source-block-to-destination-block-with-overlapping-memory-address/",
  },

  {
    name: "Device: count 0–9 on seven-segment (port 00H)",
    description:
      "Walks a digit pattern table and writes it to port 00H with a delay between each. Watch the Devices panel — the seven-segment cycles 0,1,2,…,9 then halts. Switch the Run speed to Slow to see the digits change one at a time.",
    source: `; Drive the seven-segment display on port 00H with digits 0..9.
; The DIGITS table holds the standard a..g bit patterns; the
; delay loop is short enough to be watchable on the Crawl run
; speed and short enough not to bore on Fast.

        ORG  2000H
        LXI  H, DIGITS
        MVI  B, 0AH         ; ten digits
NEXT:   MOV  A, M
        OUT  00H            ; drive seven-seg on port 00
        CALL DELAY
        INX  H
        DCR  B
        JNZ  NEXT
        HLT

; Small delay subroutine — DCX D until DE wraps to 0
DELAY:  LXI  D, 0FFFFH
DLOOP:  DCX  D
        MOV  A, D
        ORA  E
        JNZ  DLOOP
        RET

; Bit→segment: bit0=a bit1=b bit2=c bit3=d bit4=e bit5=f bit6=g bit7=dp
DIGITS: DB 3FH               ; 0
        DB 06H               ; 1
        DB 5BH               ; 2
        DB 4FH               ; 3
        DB 66H               ; 4
        DB 6DH               ; 5
        DB 7DH               ; 6
        DB 07H               ; 7
        DB 7FH               ; 8
        DB 6FH               ; 9
`,
    sourceUrl: "modern8085 — original example for the IO-port device demo",
  },

  {
    name: "Device: print \"Hello\" on the printer (port 05H)",
    description:
      "Walks a DB string and writes each byte to port 05H. The printer device captures every OUT via the io_log so successive identical bytes (the two 'l's) aren't lost. Try Slow run to watch the tape grow one character at a time.",
    source: `; Print "Hello!" to the printer device on port 05H.
        ORG  2000H
        LXI  H, MSG
LOOP:   MOV  A, M
        CPI  00H            ; null terminator?
        JZ   DONE
        OUT  05H            ; printer port
        INX  H
        JMP  LOOP
DONE:   HLT

MSG:    DB 'Hello!'
        DB 0AH               ; newline
        DB 00H               ; null terminator
`,
    sourceUrl: "modern8085 — original example for the printer device",
  },

  {
    name: "Device: stepper motor full-step CW (port 04H)",
    description:
      "Cycles the standard 1-2 phase pattern 03H, 06H, 0CH, 09H, … on port 04H. The Stepper device shows the rotor pointing through eight angles as it walks. Crawl + auto-run is the best speed to follow.",
    source: `; Stepper motor full-step CW on port 04H.
; Pattern 03, 06, 0C, 09 → repeat. Delay between steps keeps the
; rotor visible on the Slow / Crawl run speeds.

        ORG  2000H
        LXI  H, STEPS
        MVI  C, 14H          ; 20 steps total (5 full revolutions)
LOOP:   MOV  A, M
        OUT  04H             ; stepper port
        CALL DELAY
        INX  H
        DCR  C
        JNZ  CHECK
        JMP  DONE
CHECK:  MOV  A, L
        CPI  STEPS_END
        JNZ  LOOP
        LXI  H, STEPS         ; wrap
        JMP  LOOP
DONE:   HLT

DELAY:  LXI  D, 0FFFFH
DLOOP:  DCX  D
        MOV  A, D
        ORA  E
        JNZ  DLOOP
        RET

STEPS:  DB 03H, 06H, 0CH, 09H
STEPS_END EQU 04H            ; low byte of the next address (rough wrap)
`,
    sourceUrl: "modern8085 — original example for the stepper device",
  },
];

/// Default source the IDE shows when nothing is stored in localStorage.
export const DEFAULT_SOURCE = `; Welcome to modern8085 — a sibling tool to modern8086.
; Open the Examples menu to load a canonical lab program, or
; just type something below. Default ORG is 2000H.

        ORG  2000H
        MVI  A, 42H     ; A <- 42H
        MVI  B, 0AH     ; B <- 0AH
        ADD  B          ; A <- A + B = 4CH
        HLT
`;
