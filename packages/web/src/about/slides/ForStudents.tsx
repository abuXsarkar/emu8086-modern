import { Slide } from "../Slide";

export function ForStudents() {
  return (
    <Slide
      slug="for-students"
      kicker="For students"
      title="Run your first program in 30 seconds."
      forTheCurious={
        <>
          <p>
            The 8086 core, the assembler, and every virtual peripheral
            are written in Rust and compiled to WebAssembly. The
            browser never sends your code to a server — assembly,
            execution, register snapshots, and device state all run
            in the same tab. Open the network panel: nothing's
            phoning home.
          </p>
          <p>
            <span className="mono">org 100h</span> · two-pass
            assembler with span-rich diagnostics ·
            <span className="mono"> 1 MiB</span> segmented memory ·
            full flag math · all the
            <span className="mono"> INT 21h</span> /
            <span className="mono"> INT 10h</span> /
            <span className="mono"> INT 16h</span> /
            <span className="mono"> INT 33h</span> subfunctions the
            major South Asian 8086 lab manuals reach for.
          </p>
        </>
      }
    >
      <ul className="prose-list">
        <li>
          <strong>No install, no setup.</strong> Open the link, click
          Run. The whole machine is in your browser.
        </li>
        <li>
          <strong>See what your code actually did.</strong> Every
          register, every flag, every byte of memory updates as you
          step. The output panel and the device gallery refresh live.
        </li>
        <li>
          <strong>Made wrong? Hit ◀ Back.</strong> The debugger walks
          backwards through your run. One step. Ten steps. All the
          way to the start. No state lost.
        </li>
        <li>
          <strong>Your lab manual probably works as-is.</strong> The
          assembler accepts MASM idioms — <code className="mono">db ?</code>,
          <code className="mono"> SEGMENT</code> / <code className="mono">ENDS</code>,
          <code className="mono"> PROC</code> / <code className="mono">ENDP</code>,
          implicit memory deref, the
          <code className="mono"> emu8086.inc</code>-style stdlib —
          out of the box.
        </li>
      </ul>
    </Slide>
  );
}
