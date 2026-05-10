import { Section } from "../Section";

export function Editor() {
  return (
    <Section
      id="editor"
      title="The editor"
      lede="Monaco — the editor that powers VS Code — wired to an 8086 assembler that knows your textbook’s idioms."
    >
      <h3>What it does</h3>
      <ul>
        <li>
          Syntax highlighting for instructions, registers, directives, comments,
          and string literals.
        </li>
        <li>
          Live diagnostics: bad operands, missing labels, off-bounds immediates
          underline as you type.
        </li>
        <li>
          Single-quoted multi-byte literals (<code>'AB'</code>) the way the
          lab manuals write them.
        </li>
        <li>
          A handful of MASM idioms that the original emu8086 quietly accepted:
          implicit memory dereferences, <code>db ?</code>, name-as-address
          patterns.
        </li>
      </ul>

      <h3>Examples</h3>
      <p>
        The <em>Examples</em> menu in the toolbar opens ~30 ready-made programs
        sorted by topic: arithmetic, control flow, addressing modes, devices
        (LED matrix, port I/O), and a handful of full lab exercises.
      </p>

      <h3>Themes</h3>
      <p>
        Two editor themes — <em>paper</em> (light, the default) and{" "}
        <em>dark</em>. Toggle from the gear menu. Whatever you pick is
        remembered between sessions.
      </p>

      <h3>Keyboard</h3>
      <table>
        <tbody>
          <tr><td><kbd>F9</kbd></td><td>Run</td></tr>
          <tr><td><kbd>F10</kbd></td><td>Step over</td></tr>
          <tr><td><kbd>Shift</kbd>+<kbd>F10</kbd></td><td>Step back</td></tr>
          <tr><td><kbd>F8</kbd></td><td>Reset</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save to local file</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Command palette</td></tr>
        </tbody>
      </table>
    </Section>
  );
}
