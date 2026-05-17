/// In-app tutorials for the 8085 IDE. Plain data — adding a new
/// lesson is one entry; the panel renders them generically. Step
/// bodies render through a tiny markdown subset (**bold**, *italic*,
/// `code` spans) — see renderInline in the panel.

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

export const TUTORIALS_8085: Tutorial[] = [
  {
    id: "hello",
    title: "Hello — your first instruction",
    blurb: "Move a byte into a register and halt. Watch A change in the side pane.",
    estMinutes: 3,
    steps: [
      {
        title: "What you're going to do",
        body:
          "The smallest 8085 program does exactly two things: put a byte into the accumulator and stop. That's `MVI A, 42H` followed by `HLT`. After running, the **A** register should read **42H** in the side panel.",
      },
      {
        title: "Load the program",
        body:
          "Click *Load this code* below. The editor will fill with the source. Then hit ▶ Run (or `Ctrl+Enter`).",
        starterCode: `; Your first 8085 program — load A with 42H and halt.
        ORG  2000H
        MVI  A, 42H
        HLT
`,
      },
      {
        title: "Check the registers",
        body:
          "Look at the CPU panel. **A** should be **42**. The **PC** advanced past the HLT (so it shows **2003H**, one byte past). Everything else is zero.",
      },
      {
        title: "Try a different value",
        body:
          "Edit `42H` to anything else (e.g. `0FFH` — remember the leading `0` for hex starting with A–F). Run again. The IDE auto-fixes common dialect mistakes, so even `FFH` works — watch the *Auto-fixes applied* panel.",
      },
    ],
  },

  {
    id: "add-two",
    title: "Add two numbers",
    blurb: "Move bytes between registers, do arithmetic, see the flags update.",
    estMinutes: 4,
    steps: [
      {
        title: "What we're computing",
        body:
          "Take two values, add them, store the result. Along the way you'll see the Z (zero), CY (carry), and AC (auxiliary-carry) flags react to the math.",
      },
      {
        title: "The program",
        body:
          "We load 12H into A, 34H into B, then `ADD B`. The 8085 reads B, adds it to A, and writes the sum back to A.",
        starterCode: `; A = 12H + 34H = 46H
        ORG  2000H
        MVI  A, 12H
        MVI  B, 34H
        ADD  B
        HLT
`,
      },
      {
        title: "Step through it",
        body:
          "Instead of Run, click ⤵ **Step** four times. Each step advances one instruction. Watch the changed cells **flash** — that's the IDE telling you exactly what the last instruction touched.",
      },
      {
        title: "Look at the flags",
        body:
          "After ADD, the **P** (parity) flag is set because **46H = 0100 0110** has an even number of 1s. **Z** is clear (result not zero). **CY** is clear (no carry out). Change the operands to **80H + 80H** and watch CY light up.",
      },
    ],
  },

  {
    id: "loop",
    title: "Loops with DCR + JNZ",
    blurb: "Count down a register, jump if non-zero — the canonical 8085 loop pattern.",
    estMinutes: 5,
    steps: [
      {
        title: "The pattern",
        body:
          "Almost every 8085 lab uses the same loop shape: put a count in a register, do work, `DCR` the counter, `JNZ` back to the top. When the counter reaches zero, fall through.",
      },
      {
        title: "Loop 10 times",
        body:
          "We sum 1+2+…+10. The loop body adds `B` to `A` then decrements `B`. When `B` hits zero, we stop. Expected A = 55 = 37H.",
        starterCode: `; A = 1+2+3+...+10 = 55 = 37H
        ORG  2000H
        MVI  A, 00H        ; A is the running sum
        MVI  B, 0AH        ; B counts down from 10
NEXT:   ADD  B
        DCR  B
        JNZ  NEXT
        HLT
`,
      },
      {
        title: "Use ↶ Back",
        body:
          "Step through five iterations, then click ↶ **Back** twice. The IDE replays from the start and stops two steps earlier — A and B match what they were back then. Time-travel is great for *why did this go wrong?* moments.",
      },
      {
        title: "Slow it down",
        body:
          "Set the Run speed selector to **Crawl (800ms)** and hit Run. Each iteration plays out at watching speed — pair with the changed-register flash and you can see exactly how A grows.",
      },
    ],
  },

  {
    id: "seven-seg",
    title: "Drive the seven-segment display",
    blurb: "Your first I/O. Walk a digit-pattern table, write each to the port — watch the LEDs.",
    estMinutes: 6,
    steps: [
      {
        title: "Port-mapped I/O",
        body:
          "8085 has 256 I/O ports separate from memory. `OUT 00H` writes A to port 0; the seven-segment device in the Devices panel listens there and lights the matching segments.",
      },
      {
        title: "Pick a digit",
        body:
          "The bit→segment mapping is bit 0 = top, then clockwise. The pattern `3FH = 0011_1111` lights segments a/b/c/d/e/f → digit **0**. Try it:",
        starterCode: `; Drive segment pattern 3FH (= digit "0") on port 00H.
        ORG  2000H
        MVI  A, 3FH        ; segments a,b,c,d,e,f
        OUT  00H
        HLT
`,
      },
      {
        title: "Cycle through 0–9",
        body:
          "A lookup table of 10 patterns + a delay loop = the count-up demo. Load the bundled *Device: count 0–9 on seven-segment* example from the Examples menu, or rewrite it from scratch.",
      },
      {
        title: "Watch it in slow motion",
        body:
          "Set speed to **Slow (180ms)**, hit Run. The seven-seg ticks through 0…9 visibly. Crawl makes it slower; Fast finishes before you can see anything (correctness only).",
      },
    ],
  },
];
