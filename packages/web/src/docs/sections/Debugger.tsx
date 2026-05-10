import { Section } from "../Section";

export function Debugger() {
  return (
    <Section
      id="debugger"
      title="The time-travel debugger"
      lede="Step forward. Step back. Watch any expression. Set breakpoints with conditions."
    >
      <h3>Step back, not restart</h3>
      <p>
        Every executed instruction is saved as a delta. <kbd>Shift</kbd>+
        <kbd>F10</kbd> rewinds one instruction; the register, flag, and memory
        panels rewind with it. No re-running from the top to find the moment
        a value went wrong.
      </p>
      <p>
        History is kept for the last 4096 steps by default — enough for any
        textbook program. The number is configurable in the gear menu if you
        are running something larger.
      </p>

      <h3>Breakpoints</h3>
      <p>
        Click the gutter next to a line to add a breakpoint. Right-click the
        marker to add a <em>condition</em>: a small expression in register and
        flag names (<code>AX &gt; 100</code>, <code>ZF == 1</code>,{" "}
        <code>CL != 0</code>). The program stops only when the condition is
        true.
      </p>

      <h3>Watch expressions</h3>
      <p>
        The watch panel takes the same expression syntax. Add{" "}
        <code>AX * 2</code> or <code>[DS:SI]</code> and the value re-evaluates
        every step. Changed values flash; the bytes the last instruction
        touched in memory highlight in the memory panel.
      </p>

      <h3>Run-status banner</h3>
      <p>
        While stepping, a banner near the top of the editor tells you why
        execution stopped: <em>halted</em> (HLT was reached), <em>ran out of
        steps</em> (the step budget guard kicked in to prevent a runaway
        loop from hanging the page), or <em>breakpoint hit</em>.
      </p>
    </Section>
  );
}
