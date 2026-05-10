// The ten in-app tutorials. Edit by hand — each lesson is plain
// data, no React. Adding a new lesson is one append to the
// exported array. Step bodies use a small markdown subset:
//   **bold**, *italic*, `code`, line breaks.
// Other markdown is rendered as-is.

import type { Tutorial } from "./types";

export const TUTORIALS: Tutorial[] = [
  // ------------------------------------------------------------------
  // 1. Hello, 8086
  // ------------------------------------------------------------------
  {
    id: "hello",
    title: "Hello, 8086",
    blurb: "Run your first assembly program. Five minutes; no prior 8086 experience needed.",
    estMinutes: 5,
    steps: [
      {
        id: "hello.intro",
        title: "What you're looking at",
        body:
          "Welcome. This is a complete 8086 simulator running entirely in your browser — no install, no DOSBox.\n\n" +
          "On the left you have the **editor**. In the middle, the **output** panel. On the right, live **registers**, **flags**, **devices**, and a **memory** view that update on every instruction.\n\n" +
          "The **Run** button at the top executes your program to completion (or hits a HLT). **Step** runs one instruction at a time, and **◀ Back** rewinds it — yes, the debugger goes backwards.",
      },
      {
        id: "hello.load",
        title: "Load the hello example",
        body:
          "Open the **Load example…** dropdown and pick *hello*. The editor fills with a tiny program that prints the word `hello`.\n\n" +
          "Press **Run**. You'll see the word appear in the output panel below the editor. That's a full 8086 program: assembled, executed, and rendered, in a few milliseconds.",
        starterCode:
          "; print the word \"hello\" via DOS INT 21h fn 09h\norg 100h\n\nmov ah, 09h     ; fn 09h = print $-terminated string\nmov dx, msg     ; pointer to the string\nint 21h         ; invoke DOS\n\nmov ah, 4Ch     ; fn 4Ch = exit\nint 21h\n\nmsg db 'hello$'\n",
      },
      {
        id: "hello.step",
        title: "Step through one instruction at a time",
        body:
          "Press **Reset**, then **Step ▶**. The first instruction executes; `AH` flips to `09h`. Step again — `DX` now points at `msg`. Step a third time — the `int 21h` call runs and `hello` lands in the output.\n\n" +
          "The current source line is highlighted as you step. The register and flag panels on the right update live.",
      },
      {
        id: "hello.modify",
        title: "Change the message",
        body:
          "Replace `'hello$'` with `'your name$'` and press **Run** again. You've just edited a real 8086 program.\n\n" +
          "Don't forget the `$` — that's what tells DOS function `09h` where the string ends.",
      },
      {
        id: "hello.recap",
        title: "What you just learned",
        body:
          "You loaded a program, ran it, stepped through it, and edited it. The rest of these lessons go deeper into specific topics — pick whichever interests you next. *Registers* is a good next stop if you want to learn the building blocks.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 2. Registers
  // ------------------------------------------------------------------
  {
    id: "registers",
    title: "Registers",
    blurb: "The CPU's scratch space — eight 16-bit registers and their halves.",
    estMinutes: 8,
    steps: [
      {
        id: "registers.eight",
        title: "The eight general-purpose registers",
        body:
          "The 8086 has eight 16-bit general-purpose registers:\n\n" +
          "- `AX` accumulator\n" +
          "- `BX` base\n" +
          "- `CX` counter\n" +
          "- `DX` data\n" +
          "- `SI`, `DI` source / destination index\n" +
          "- `BP`, `SP` base pointer / stack pointer\n\n" +
          "The first four — `AX`, `BX`, `CX`, `DX` — each split into a high and low byte you can address separately: `AH`/`AL`, `BH`/`BL`, etc.",
      },
      {
        id: "registers.mov",
        title: "MOV — the workhorse",
        body:
          "`MOV destination, source` copies a value. Load the snippet below and step through it once. Watch the right-hand register panel update on each step.",
        starterCode:
          "org 100h\n\nmov ax, 1234h       ; AX = 0x1234\nmov bx, ax          ; BX = AX\nmov al, 0FFh        ; only the low byte of AX changes\nmov ah, 00h         ; clear the high byte\n\nmov ah, 4Ch\nint 21h\n",
      },
      {
        id: "registers.halves",
        title: "High and low halves",
        body:
          "`AX` is 16 bits. `AL` is its low 8 bits. `AH` is the high 8 bits. They are not separate registers — writing `AL` also changes `AX`.\n\n" +
          "Step through the example above: after `mov al, 0FFh`, watch `AX` become `0x12FF`. After `mov ah, 00h`, `AX` becomes `0x00FF`.",
      },
      {
        id: "registers.constants",
        title: "Number literals",
        body:
          "The assembler accepts decimal (`42`), hex two ways (`0FFh` or `0xFF`), binary (`1011b`), and octal (`077o`). Character literals like `'A'` evaluate to the byte value.\n\n" +
          "Tip: leading-digit hex requires the `h` suffix (`0FFh`) — bare `FFh` is read as a label.",
      },
      {
        id: "registers.ip",
        title: "IP is special",
        body:
          "The **instruction pointer** `IP` holds the address of the next instruction to execute. You can't `MOV IP, …` directly — you change it with jumps (`JMP`, `Jcc`), calls, returns, and the implicit `+= size` after each instruction.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 3. Memory and addressing modes
  // ------------------------------------------------------------------
  {
    id: "memory",
    title: "Memory + addressing modes",
    blurb: "How to read and write RAM. Segments, displacement, and the addressing menu.",
    estMinutes: 10,
    steps: [
      {
        id: "memory.model",
        title: "1 MiB through a 20-bit window",
        body:
          "The 8086 sees up to **1 MiB** of memory, but its registers are only 16 bits wide. The trick: every address is `segment:offset`, and the hardware computes `segment × 16 + offset`. That packs a 20-bit address into two 16-bit pieces.\n\n" +
          "Segment registers: `CS` (code), `DS` (data), `SS` (stack), `ES` (extra). For these lessons we mostly stay inside one segment — easier to reason about.",
      },
      {
        id: "memory.direct",
        title: "Direct addressing",
        body:
          "`MOV AX, [0100h]` reads the 16-bit word at offset `0100h` inside `DS`. The square brackets mean *the contents of this address*, not the address itself.\n\n" +
          "Without the brackets — `MOV AX, 0100h` — you get the literal value `0x0100` instead.",
      },
      {
        id: "memory.indirect",
        title: "Indirect through a register",
        body:
          "`MOV AX, [BX]` reads from whatever address `BX` currently holds. This is how you walk arrays, parse strings, and generally do anything dynamic.\n\n" +
          "The allowed base registers for square-bracket addressing are `BX`, `BP`, `SI`, `DI`. (`AX`, `CX`, `DX` can't be used as bases on the 8086.)",
        starterCode:
          "org 100h\n\n; sum the four bytes at `data`\nmov bx, data\nmov ax, 0\nmov cx, 4\nsum_loop:\n  add al, [bx]    ; read byte at [BX]\n  inc bx          ; advance\n  loop sum_loop   ; CX-- ; if CX != 0, jump\n\nmov ah, 4Ch\nint 21h\n\ndata db 10, 20, 30, 40\n",
      },
      {
        id: "memory.base_index",
        title: "Base + index",
        body:
          "You can combine one base register with one index register: `[BX+SI]`, `[BX+DI]`, `[BP+SI]`, `[BP+DI]`. This is the natural shape for *array of structs*: `BX` points at the struct, `SI` advances within it.\n\n" +
          "Add a constant displacement: `[BX+SI+4]` is `BX + SI + 4`. Useful for accessing a specific field inside a struct or local on the stack frame.",
      },
      {
        id: "memory.hex",
        title: "The memory hex panel",
        body:
          "On the right, the **Memory** panel shows the bytes from `DS:0x100` to `DS:0x1FF`. Cells that changed since the last step are highlighted, so you can watch your program write.\n\n" +
          "Run the sum-loop above with **Step ▶** a few times — the four data bytes (`0A 14 1E 28`) are visible in the panel, and the accumulator advances.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 4. Arithmetic + flags
  // ------------------------------------------------------------------
  {
    id: "arithmetic",
    title: "Arithmetic and flags",
    blurb: "ADD, SUB, MUL, DIV — and the four flags every conditional jump reads.",
    estMinutes: 10,
    steps: [
      {
        id: "arithmetic.add_sub",
        title: "ADD, SUB, INC, DEC",
        body:
          "`ADD AX, BX` does `AX = AX + BX`. `SUB AX, BX` does `AX = AX - BX`. `INC AX` and `DEC AX` are size-optimized `+1` / `-1`.\n\n" +
          "All four update the **flags**: the small badges in the panel labeled `CF`, `PF`, `AF`, `ZF`, `SF`, `OF`. Light = the flag is set after the most recent flag-affecting instruction.",
      },
      {
        id: "arithmetic.mul_div",
        title: "MUL and DIV are implicit",
        body:
          "Unlike `ADD`, multiply and divide use `AX` implicitly.\n\n" +
          "`MUL BX` computes `DX:AX = AX × BX` (32-bit result split into two 16-bit halves). `DIV BX` does `AX = DX:AX / BX, DX = remainder`. Same shape for byte forms but using `AX = AH:AL`.\n\n" +
          "Forget to clear `DX` before a 16-bit divide and you'll get the wrong result — `DX` is the top half of the dividend.",
      },
      {
        id: "arithmetic.flags",
        title: "The four flags you'll use most",
        body:
          "- `ZF` (zero): set when the result is zero.\n" +
          "- `SF` (sign): set when the top bit of the result is 1.\n" +
          "- `CF` (carry): set when an unsigned operation wrapped past the top.\n" +
          "- `OF` (overflow): set when a signed operation crossed the sign boundary.\n\n" +
          "Conditional jumps `JE / JZ`, `JNE / JNZ`, `JL`, `JG`, `JC`, `JNC`… all read these flags. `CMP AX, BX` is `SUB` that **only sets flags** without storing the result — the canonical way to set up a conditional jump.",
      },
      {
        id: "arithmetic.example",
        title: "Walk a comparison",
        body:
          "Load the snippet below and step through it. Watch `ZF` flip on and off as the comparison evolves.",
        starterCode:
          "org 100h\n\nmov ax, 5\nmov bx, 5\ncmp ax, bx      ; AX - BX = 0; ZF=1, SF=0\nje  equal       ; jumps because ZF is set\n\nmov dx, msg_no\njmp print\n\nequal:\n  mov dx, msg_yes\n\nprint:\n  mov ah, 09h\n  int 21h\n  mov ah, 4Ch\n  int 21h\n\nmsg_yes db 'equal$'\nmsg_no  db 'not equal$'\n",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 5. The stack
  // ------------------------------------------------------------------
  {
    id: "stack",
    title: "The stack",
    blurb: "PUSH and POP. Why the stack pointer matters, and how procedures use it.",
    estMinutes: 8,
    steps: [
      {
        id: "stack.what",
        title: "What the stack is",
        body:
          "Memory grows from low addresses up. The **stack** grows the other way: from high addresses down. `SP` (stack pointer) holds the address of the most recently pushed item.\n\n" +
          "On the 8086 the stack is 16-bit words. `PUSH AX` decrements `SP` by 2 and stores `AX`. `POP AX` reads from `[SP]` and increments `SP` by 2.",
      },
      {
        id: "stack.push_pop",
        title: "PUSH and POP",
        body:
          "Load the example. Step through it and watch `SP` move down (PUSH) and back up (POP). Notice the panel highlights memory cells as they change.",
        starterCode:
          "org 100h\n\nmov ax, 1111h\nmov bx, 2222h\nmov cx, 3333h\n\npush ax         ; SP -= 2; mem[SP] = 1111h\npush bx         ; SP -= 2; mem[SP] = 2222h\npush cx         ; SP -= 2; mem[SP] = 3333h\n\npop dx          ; DX = 3333h; SP += 2\npop dx          ; DX = 2222h; SP += 2\npop dx          ; DX = 1111h; SP += 2\n\nmov ah, 4Ch\nint 21h\n",
      },
      {
        id: "stack.saving",
        title: "Saving registers around a call",
        body:
          "Before a procedure calls something that might clobber `BX`, the polite pattern is `PUSH BX` at entry and `POP BX` before `RET`. Same shape for any register you want to preserve.\n\n" +
          "`PUSHA` (push-all) and `POPA` save / restore all general-purpose registers in one instruction. Convenient but more expensive than pushing only what you need.",
      },
      {
        id: "stack.flags",
        title: "PUSHF / POPF",
        body:
          "Sometimes you need to preserve the **flags** across a routine that would clobber them: `PUSHF` pushes the flags word, `POPF` restores it. Common in interrupt handlers and atomic-feeling sequences.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 6. Procedures
  // ------------------------------------------------------------------
  {
    id: "procedures",
    title: "Procedures",
    blurb: "CALL, RET, and how to share code between programs.",
    estMinutes: 8,
    steps: [
      {
        id: "procedures.why",
        title: "Why factor code",
        body:
          "Once you have a useful chunk — print a number, swap two memory cells, compute a checksum — give it a name and let the rest of the program call it.\n\n" +
          "Most 8086 code uses `name PROC` / `name ENDP` blocks. The block body ends with `RET`. Callers do `CALL name`.",
      },
      {
        id: "procedures.call_ret",
        title: "CALL pushes IP; RET pops it",
        body:
          "Mechanically: `CALL` pushes the address of the next instruction onto the stack, then jumps to the target. `RET` pops the address back into `IP` and continues from there.\n\n" +
          "So a procedure that pushes things onto the stack must pop them off before `RET`, or `RET` will read the wrong return address and crash.",
      },
      {
        id: "procedures.example",
        title: "A worked example",
        body:
          "This program defines a procedure that prints AX as a single ASCII digit. The caller uses it twice. Step through both calls and watch `IP` jump in and out of the procedure block.",
        starterCode:
          "org 100h\n\nmov al, '7'\ncall print_char\n\nmov al, '!'\ncall print_char\n\nmov ah, 4Ch\nint 21h\n\nprint_char proc\n  mov ah, 02h     ; INT 21h fn 02h = print char in DL\n  mov dl, al\n  int 21h\n  ret\nprint_char endp\n",
      },
      {
        id: "procedures.params",
        title: "Passing arguments via registers",
        body:
          "The 8086 has no ABI convention forced by the hardware. By tradition, small arguments go in registers (`AX`, `BX`, …) and the caller saves whatever it cares to preserve.\n\n" +
          "Bigger or variadic data goes through a pointer in `SI` or `DI`. For routines that need many arguments, push them on the stack before `CALL` and read them via `[BP+…]` inside the procedure (set `BP = SP` on entry to get a stable frame).",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 7. Interrupts
  // ------------------------------------------------------------------
  {
    id: "interrupts",
    title: "Interrupts (INT 21h)",
    blurb: "DOS services. Print a character, print a string, read input, exit cleanly.",
    estMinutes: 8,
    steps: [
      {
        id: "interrupts.what",
        title: "What an interrupt is",
        body:
          "`INT n` jumps to the OS-supplied handler for vector `n`, which does some service for you and returns. On real DOS, vector `21h` was the catch-all OS API: print, read, file I/O, exit. This emulator implements the subset you'll meet in textbooks.",
      },
      {
        id: "interrupts.print",
        title: "Print a single character — AH=02h",
        body:
          "Put `02h` in `AH`, the character in `DL`, and run `INT 21h`.",
        starterCode:
          "org 100h\n\nmov ah, 02h\nmov dl, 'X'\nint 21h\n\nmov ah, 4Ch\nint 21h\n",
      },
      {
        id: "interrupts.print_str",
        title: "Print a string — AH=09h",
        body:
          "`DX` points to a `$`-terminated string. Yes, the terminator is a literal dollar sign — that's how DOS does it.",
        starterCode:
          "org 100h\n\nmov ah, 09h\nmov dx, greeting\nint 21h\n\nmov ah, 4Ch\nint 21h\n\ngreeting db 'good morning$'\n",
      },
      {
        id: "interrupts.exit",
        title: "Exit cleanly — AH=4Ch",
        body:
          "Every program should end with `mov ah, 4Ch` + `int 21h`. Without it, the emulator runs off the end of your code into whatever bytes happen to follow, which usually means \"stopped at step limit\".\n\n" +
          "`AL` carries the exit code; `0` is success.",
      },
      {
        id: "interrupts.read",
        title: "Read a character — AH=01h",
        body:
          "`AH=01h, INT 21h` blocks until the user types a key, then returns the character in `AL`. With the on-screen **Keyboard** device opened, click the focused box and type to feed the program.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 8. Devices
  // ------------------------------------------------------------------
  {
    id: "devices",
    title: "Devices",
    blurb: "Drive the LED matrix, traffic light, 7-segment display, stepper motor, and more.",
    estMinutes: 12,
    steps: [
      {
        id: "devices.io",
        title: "IN and OUT",
        body:
          "Devices live on **ports**, separate from memory. `OUT port, AL` writes a byte to the port; `IN AL, port` reads. Each peripheral has a fixed port number documented in the device panel.",
      },
      {
        id: "devices.seg",
        title: "7-segment display — port 199",
        body:
          "Write a byte to port `199` (`0xC7`). Each bit lights one of the segments: bit 0 = top, bit 1 = top-right, bit 2 = bottom-right, bit 3 = bottom, bit 4 = bottom-left, bit 5 = top-left, bit 6 = middle, bit 7 = decimal point.\n\n" +
          "The example below shows the digit `7`.",
        starterCode:
          "org 100h\n\nmov al, 00000111b   ; top + top-right + bottom-right = 7\nout 199, al\n\nmov ah, 4Ch\nint 21h\n",
      },
      {
        id: "devices.traffic",
        title: "Traffic light — port 4",
        body:
          "Port `4` controls a three-bulb traffic signal. Bit 0 = red, bit 1 = yellow, bit 2 = green. Multiple bits on means multiple bulbs lit (cars are confused).",
        starterCode:
          "org 100h\n\nmov al, 001b    ; red on\nout 4, al\nmov al, 011b    ; red + yellow\nout 4, al\nmov al, 100b    ; green only\nout 4, al\n\nmov ah, 4Ch\nint 21h\n",
      },
      {
        id: "devices.led_matrix",
        title: "8×8 LED matrix — ports 8–15",
        body:
          "Each of ports `8` through `15` controls one row of an 8×8 matrix. Writing to port `8 + n` sets row `n`. Bit 0 of the byte lights the leftmost LED in that row.\n\n" +
          "The example draws a smiley face. Step through it and watch the matrix fill.",
        starterCode:
          "org 100h\n\nmov al, 00111100b\nout 8, al\nmov al, 01000010b\nout 9, al\nmov al, 10100101b\nout 10, al\nmov al, 10000001b\nout 11, al\nmov al, 10100101b\nout 12, al\nmov al, 10011001b\nout 13, al\nmov al, 01000010b\nout 14, al\nmov al, 00111100b\nout 15, al\n\nmov ah, 4Ch\nint 21h\n",
      },
      {
        id: "devices.popout",
        title: "Pop devices out",
        body:
          "Each device panel has an **↗ pop out** button in its top-right. That detaches the device into a draggable floating window so you can keep an eye on it while editing without re-scrolling the right rail. Drag the bar to move; arrow-key nudges work for keyboard a11y.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 9. Debugger
  // ------------------------------------------------------------------
  {
    id: "debugger",
    title: "The time-travel debugger",
    blurb: "Step, ◀ Back, watches, breakpoints. The killer feature.",
    estMinutes: 9,
    steps: [
      {
        id: "debugger.step",
        title: "Step ▶",
        body:
          "`Step ▶` runs exactly one instruction and pauses. The source line highlights; all the side panels (registers, flags, memory hex, devices) refresh.\n\n" +
          "If the stepper hasn't been initialized yet (you've just edited code), the first **Step** assembles and lands at the program's entry point. Subsequent steps walk forward.",
      },
      {
        id: "debugger.back",
        title: "◀ Back is time-travel",
        body:
          "`◀ Back` un-runs the previous instruction. The register values, flags, memory contents — all of them — reset to where they were one step earlier. Stdout characters that the rolled-back instruction printed disappear from the output panel.\n\n" +
          "This is hard to do in a real CPU. In an emulator it costs us a small per-step snapshot, which we keep in memory so a 1000-instruction program can be rewound to the start at any time.",
      },
      {
        id: "debugger.reset",
        title: "Reset",
        body:
          "`Reset` re-assembles the source and points the stepper at instruction 0, with all registers cleared. Different from `◀ Back` — it discards the entire run history.",
      },
      {
        id: "debugger.watches",
        title: "Watches",
        body:
          "The right-side debugger panel lets you add **watch expressions** like `AX`, `BX + 4`, `[100h]`, or `ZF == 1`. They re-evaluate after every step so you can keep an eye on something complex without scrolling.\n\n" +
          "Watches persist in localStorage — they're still there after a refresh.",
      },
      {
        id: "debugger.breakpoints",
        title: "Breakpoints",
        body:
          "**Breakpoint expressions** are predicates evaluated after every instruction during a `Run`. The run pauses at the first instruction where the predicate is true.\n\n" +
          "Examples: `AX == 0`, `IP >= 0x150`, `CF == 1 && SF == 0`. The toast at the top of the editor tells you which breakpoint hit and the corresponding source line is highlighted.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // 10. Sharing + autograde
  // ------------------------------------------------------------------
  {
    id: "share",
    title: "Sharing + the autograder",
    blurb: "Share-links, classroom mode, and the CLI grader that drops into GitHub Classroom.",
    estMinutes: 6,
    steps: [
      {
        id: "share.link",
        title: "The Share button",
        body:
          "Click `↗ Share` in the toolbar. The IDE base64url-encodes your current editor buffer into the URL fragment and copies the link to your clipboard. Paste it anywhere — chat, email, a forum — and the recipient opens it in their own IDE with the exact same program.\n\n" +
          "Nothing leaves your browser: the share-link is the encoded buffer, not a server upload. There's no tracking pixel and no expiry.",
      },
      {
        id: "share.classroom",
        title: "Classroom mode",
        body:
          "Click the **Classroom** pill in the header to start a live session. As a teacher you get a friendly room code (`blue-fox-42`) to share with students; they enter the code plus their roll number to join.\n\n" +
          "Inside, you can broadcast your screen, take control of a struggling student's editor, leave per-student notes, and download every submission as a zip at the end. See `docs/classroom-mode.md` for the full feature set.",
      },
      {
        id: "share.cli",
        title: "The CLI grader",
        body:
          "Outside the IDE, the `emu8086` CLI takes a YAML spec and a student submission and emits a pass/fail report (plus JUnit XML for CI).\n\n" +
          "Example: `emu8086 grade spec.yml submission.asm`. The spec lists test cases — stdin to feed, expected stdout, expected register values at exit, optional timeouts. Drop it into a GitHub Classroom workflow via the bundled `.github/actions/grade/` composite action.",
      },
      {
        id: "share.further",
        title: "Where to go next",
        body:
          "You've finished the on-rails tour. From here:\n\n" +
          "- The `examples/` folder has more programs to read.\n" +
          "- `docs/user-manual.md` is the single-page reference.\n" +
          "- `docs/educator-guide.md` covers the GitHub Classroom integration in depth.\n\n" +
          "If anything's surprising or broken, the repo's issues tab is the right place — every report helps.",
      },
    ],
  },
];
