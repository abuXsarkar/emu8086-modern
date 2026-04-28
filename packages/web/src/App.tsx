// M0 placeholder shell.
// The real layout (editor + register/flag/memory/stack/output panels) lands in M3.
// See ROADMAP.md.

export function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>emu8086-modern</h1>
      <p>
        A modern, open-source 8086 emulator and assembly IDE for students.
        This page is the M0 placeholder; the editor and debugger land in M3.
      </p>
      <p>
        See the <a href="https://github.com/abuXsarkar/emu8086-modern">repository</a> for the
        roadmap and build plan.
      </p>
    </main>
  );
}
