import { Section } from "../Section";

export function CLI() {
  return (
    <Section
      id="cli"
      title="Command-line tool"
      lede="The same emulator core, scriptable. Useful for autograding, CI, and SSH-only lab machines."
    >
      <h3>Install</h3>
      <pre>
        <code>{`npm install -g @emu8086/cli
# or
brew install emu8086         # macOS
scoop install emu8086         # Windows
sudo apt install ./emu8086_*.deb   # Debian/Ubuntu`}</code>
      </pre>

      <h3>Commands</h3>
      <table>
        <thead>
          <tr><th>Command</th><th>What it does</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>emu8086 run FILE</code></td>
            <td>Assemble and run; print final state to stdout.</td>
          </tr>
          <tr>
            <td><code>emu8086 debug FILE</code></td>
            <td>Interactive terminal stepper. Same key bindings as the IDE.</td>
          </tr>
          <tr>
            <td><code>emu8086 assemble FILE -o OUT.bin</code></td>
            <td>Emit a raw binary, no execution.</td>
          </tr>
          <tr>
            <td><code>emu8086 disassemble OUT.bin</code></td>
            <td>Roundtrip — print the listing for a binary.</td>
          </tr>
          <tr>
            <td><code>emu8086 grade DIR --rubric R</code></td>
            <td>Run every <code>.asm</code> in <code>DIR</code> against <code>R</code>; emit a CSV.</td>
          </tr>
          <tr>
            <td><code>emu8086 lint FILE</code></td>
            <td>Static checks only — no execution; exit code reflects diagnostics.</td>
          </tr>
        </tbody>
      </table>

      <h3>Exit codes</h3>
      <ul>
        <li><code>0</code> — clean run, all expectations met.</li>
        <li><code>1</code> — assembly error.</li>
        <li><code>2</code> — runtime trap (e.g. divide by zero, bad address).</li>
        <li><code>3</code> — expectations unmet (autograde).</li>
      </ul>

      <h3>JSON output</h3>
      <p>
        Pass <code>--json</code> to any command. The output is machine
        readable — useful when you&apos;re wiring it into a grading
        pipeline or a CI job.
      </p>
    </Section>
  );
}
