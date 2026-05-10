import { Section } from "../Section";

export function GettingStarted() {
  return (
    <Section
      id="getting-started"
      title="Quick start"
      lede="Three ways in. Pick whichever fits the lab."
    >
      <h3>1. Use it in the browser</h3>
      <p>
        Open <a href="../">the IDE</a> and you are already there — no install,
        no account. The first time you arrive, the page caches itself so the
        next visit works offline.
      </p>
      <p>
        Try one of the bundled examples (top toolbar &rarr; <em>Examples</em>)
        and press <kbd>F9</kbd> to run, <kbd>F10</kbd> to step. The right rail
        shows registers, flags, and the bytes of memory you just touched.
      </p>

      <h3>2. Install on your machine</h3>
      <p>
        Download the desktop build for your OS from the{" "}
        <a
          href="https://github.com/abuXsarkar/emu8086-modern/releases/latest"
          target="_blank"
          rel="noopener"
        >
          latest release page
        </a>
        . Linux (DEB &amp; AppImage), macOS (DMG, Intel + Apple Silicon), and
        Windows (MSI + NSIS). Source is identical to the web build; the
        desktop shell adds native menus and a clipboard hook for screen-capture
        export.
      </p>

      <h3>3. From the command line</h3>
      <pre>
        <code>{`# global install
npm install -g @emu8086/cli

# assemble + run
emu8086 run hello.asm

# step debugger in a terminal
emu8086 debug hello.asm`}</code>
      </pre>
      <p>
        The CLI is a thin wrapper around the same emulator core that drives the
        web build. Useful for autograding pipelines, CI, or when you only have
        SSH to a lab machine.
      </p>

      <h3>What you need</h3>
      <ul>
        <li>A reasonably modern browser (Chrome 111+, Safari 16.4+, Firefox 113+).</li>
        <li>No backend. Your code runs locally; the page never sends it anywhere.</li>
        <li>For classroom mode, one host needs a network address others can reach.</li>
      </ul>
    </Section>
  );
}
