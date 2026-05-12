# Student experience principles

This document captures the experience we are trying to deliver to a student opening `modern8086` for the first time. It is the rubric we hold every UX decision against.

## North star

> A first-year student, who has never seen assembly before, opens `modern8086.app` on a school Chromebook, types `mov ax, 5`, and within sixty seconds understands what just happened — without needing a teacher, a textbook, or a tutorial.

If a feature, a panel, or an error message helps that scenario, it stays. If it doesn't, it has to justify itself.

## Five principles

### 1. The machine is visible by default

Registers, flags, memory, stack, and devices are visible on the main screen — not behind menus, not in modal windows, not in tabs the student has to discover. The student should *see* the machine react to every line of code they write.

Legacy emu8086 hides flags in a corner, the stack in a memory window, and devices behind buttons. We do not.

### 2. Errors teach, not punish

Every diagnostic message is graded by the question: *"Could a first-year student act on this without help?"* If not, it is rewritten until it can.

Concretely, every error includes:

- A source span with a caret pointing at the offending token.
- A plain-language explanation of what the assembler/emulator was trying to do.
- One or more concrete suggestions ("did you mean `mov ax, [bx]`?").
- A link to the relevant in-app reference page.

We treat unhelpful errors as bugs. They get a `diagnostic-quality` label and are fixed like any other bug.

### 3. Explore without fear

Students should feel free to step, change, undo, redo, and experiment without losing work. The platform never punishes curiosity.

- Time-travel debugging means stepping past the bug is recoverable.
- Local autosave means closing the tab is recoverable.
- Share-links mean asking for help is one click, not "email me your file".
- The reset button is impossible to mis-click into; it always confirms.

### 4. The same tool works for the first program and the hardest

A student writes their first `mov ax, 5` in the same UI they will use a year later for an interrupt-driven keyboard handler. We do not gate features behind "advanced mode" toggles that students forget to flip.

What scales:
- Editor goes from autocomplete-helps-you to multi-cursor-and-snippets-help-you.
- Debugger goes from "step" to "conditional breakpoint on a watch expression at a label".
- Devices go from "drive a traffic light" to "wire a custom plugin device".

### 5. Honors the student's time

- Cold start under 1.5 seconds on broadband.
- Step latency under 100 µs (perceived as instant).
- No nag screens, no telemetry prompts, no "you have unsaved changes?" surprises (autosave handles it).
- No login required to use the IDE. Login is optional and only adds cloud sync.

## Onboarding

The very first screen, for a user who has never been here:

1. A welcome panel with three buttons: **"Try a hello-world"**, **"Open a tutorial"**, **"Empty editor"**.
2. The IDE itself, already populated with a hello-world program if the user picked button 1.
3. A subtle "Tour the panels" pulse over the registers panel that fades after one second.

A returning user does not see the welcome panel; they see their last buffer.

## Tutorials

Ten interactive tutorials, in this order:

1. Registers and `mov`.
2. Arithmetic and flags.
3. Memory and addressing modes.
4. Conditionals: `cmp` and `Jcc`.
5. Loops: `LOOP`, `JCXZ`.
6. The stack: `push`, `pop`, `call`, `ret`.
7. Procedures and calling conventions.
8. Interrupts and DOS services (`INT 21h`).
9. Devices: traffic light, 7-seg, keyboard.
10. Debugging: breakpoints, watches, time-travel.

Each tutorial is a 5–10 minute lesson with embedded exercises that run in the IDE's emulator.

## Accessibility commitments

- WCAG 2.1 AA contrast and keyboard reachability across the IDE.
- Full keyboard control: every action is reachable without a mouse; the shortcut palette (`Ctrl/Cmd+K`) is the canonical entry point.
- Screen-reader labels for every panel; readable representations of register and flag state.
- Adjustable font size separate from browser zoom, so the layout doesn't break.
- Reduced-motion mode disables device animations and timeline sliding.

## Anti-patterns we refuse

- Pop-ups that interrupt typing.
- Modal "Did you mean to save?" dialogs (autosave covers this).
- Tooltips longer than one line.
- Hidden menus reachable only via right-click.
- Errors that say "syntax error" without a span.
- Telemetry that fires before consent.

## How we measure the experience

- Optional, anonymous, opt-in metrics on:
  - Time to first successful assemble after first keystroke.
  - Distinct error messages a user sees per session.
  - Frequency of step-back use.
- Quarterly surveys to participating courses — short, two-question form: "What was confusing?" and "What worked?"
- A public bug board for student-reported friction (with the `pain-point` label).

We close the loop: every quarterly survey result yields a documented set of changes in the next milestone.
