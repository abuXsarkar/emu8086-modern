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
