/// In-app tutorials for the /8051/ IDE. Same shape as the 8085
/// lessons file — adding a new lesson is one entry; the panel
/// renders them generically.

export interface TutorialStep {
  title: string;
  body: string;
  /** When set, a "Load this code" button drops the snippet into the
   *  editor and clears the run state. */
  starterCode?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  blurb: string;
  estMinutes: number;
  steps: TutorialStep[];
}

export const TUTORIALS_8051: Tutorial[] = [
  {
    id: "hello",
    title: "Hello — your first 8051 instruction",
    blurb: "Move a byte into A, halt with SJMP $. Watch A change in the side pane.",
    estMinutes: 3,
    steps: [
      {
        title: "What you're going to do",
        body:
          "The smallest 8051 program does exactly two things: put a byte into the accumulator and stop. That's `MOV A, #42H` followed by `SJMP $`. The 8051 has no HLT — `SJMP $` (jump to self) is the canonical halt-equivalent. After running, the **A** register should read **42** in the side panel.",
      },
      {
        title: "Load the program",
        body:
          "Click *Load this code* below. The editor will fill with the source. Then hit ▶ Run.",
        starterCode: `; Your first 8051 program — load A with 42H and halt.
ORG 0
        MOV   A, #42H
        SJMP  $
`,
      },
      {
        title: "Check the registers",
        body:
          "Look at the CPU panel. **A** should be **42**. The **PC** is parked at the SJMP — the run loop sees the self-jump and stops. Everything else is zero.",
      },
      {
        title: "Try a different value",
        body:
          "Edit `42H` to anything else (e.g. `0FFH` — remember the leading `0` for hex starting with A–F). Run again. The IDE auto-fixes common dialect mistakes, so even `FFH` works — watch the *Tolerance hints* panel.",
      },
    ],
  },

  {
    id: "add-two",
    title: "Add two numbers",
    blurb: "Move bytes between registers, do arithmetic, see the PSW flags update.",
    estMinutes: 4,
    steps: [
      {
        title: "What we're computing",
        body:
          "Take two values, add them, store the result. Along the way you'll see the CY (carry), AC (auxiliary-carry), OV (overflow), and P (parity) flags react to the math.",
      },
      {
        title: "The program",
        body:
          "We load 12H into A, 34H into R0, then `ADD A, R0`. The 8051 reads R0, adds it to A, and writes the sum back to A. Sum should be 46H.",
        starterCode: `; A = 12H + 34H = 46H
ORG 0
        MOV   A, #12H
        MOV   R0, #34H
        ADD   A, R0
        SJMP  $
`,
      },
      {
        title: "Step through it",
        body:
          "Instead of Run, click **Step** four times. Each step advances one instruction. Watch the changed cells **flash** — that's the IDE telling you exactly what the last instruction touched.",
      },
      {
        title: "Look at the flags",
        body:
          "After `ADD`, the **P** (parity) flag tracks A — `46H = 0100 0110` has an even number of 1s, so P is 0. **CY** is clear (no carry out of bit 7). Change operands to **80H + 80H** and watch CY light up — that's an unsigned overflow.",
      },
    ],
  },

  {
    id: "djnz-loop",
    title: "Loops with DJNZ",
    blurb: "Decrement-and-jump-if-not-zero — the canonical 8051 loop.",
    estMinutes: 5,
    steps: [
      {
        title: "The pattern",
        body:
          "Almost every 8051 lab uses the same loop shape: put a count in `R7` (or any Rn / direct), do work, `DJNZ R7, label`. The single instruction decrements and branches if the counter hasn't reached zero. When `R7` hits zero, fall through.",
      },
      {
        title: "Sum 1+2+...+10",
        body:
          "We sum 1..10 into A using R7 as the counter. Each pass adds R7 to A, then `DJNZ R7` falls through when R7 reaches zero. Expected A = 55 = 37H.",
        starterCode: `; A = 1+2+...+10 = 55 = 37H
ORG 0
        MOV   A, #0         ; running sum
        MOV   R7, #10       ; counter
NEXT:   ADD   A, R7
        DJNZ  R7, NEXT
        SJMP  $
`,
      },
      {
        title: "Watch R7 count down",
        body:
          "Single-step or set the runner to a slow tick and watch the **R7** cell in the register pane flash on each decrement. The active source line in the editor highlights to show where the PC is — pedagogically priceless when teaching loops.",
      },
      {
        title: "Try a nested DJNZ",
        body:
          "Replace the body with another `MOV R6, #5 ; DJNZ R6, INNER` to wrap a 5-iteration inner loop around the outer 10 — classic 8051 delay primitive. Watch both R6 and R7 dance in the pane.",
      },
    ],
  },

  {
    id: "ports",
    title: "Drive a port — first I/O",
    blurb: "Write to P1, light the LED bar in the Devices panel.",
    estMinutes: 6,
    steps: [
      {
        title: "Memory-mapped ports",
        body:
          "Unlike the 8085, the 8051 has no `IN` / `OUT` instructions — the four parallel ports **P0..P3** are SFRs at fixed addresses (80H, 90H, A0H, B0H). You drive them with a plain `MOV`. The Devices panel listens to writes on these ports and lights up the matching peripheral.",
      },
      {
        title: "Light all 8 LEDs",
        body:
          "Write FFH to P1 — every LED in the bar lights. The LED bar device defaults to listening on P1 (90H), so this works out of the box.",
        starterCode: `; All 8 LEDs on (P1 = FFH).
ORG 0
        MOV   P1, #0FFH
        SJMP  $
`,
      },
      {
        title: "Chase pattern",
        body:
          "Rotate a single bit through P1. Watch the LED bar play a Knight Rider-style chase. The delay loop slows it down enough for the human eye to track.",
        starterCode: `; Chase one LED across P1.
ORG 0
        MOV   A, #01H       ; start with bit 0
LOOP:   MOV   P1, A
        ACALL DELAY
        RL    A             ; rotate left, no carry-through
        SJMP  LOOP

DELAY:  MOV   R7, #80H
D1:     MOV   R6, #80H
D2:     DJNZ  R6, D2
        DJNZ  R7, D1
        RET
`,
      },
      {
        title: "Drive the seven-segment",
        body:
          "The 7-seg device defaults to listening on **P0**. Write a segment pattern: `3FH = 0011_1111` lights segments a..f → digit **0**. Bind a different device to a different port via the dropdown in the Devices panel to experiment.",
      },
    ],
  },
];
