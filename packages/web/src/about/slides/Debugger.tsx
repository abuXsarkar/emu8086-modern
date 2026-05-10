import { Slide } from "../Slide";

export function Debugger() {
  return (
    <Slide
      slug="debugger"
      kicker="The killer feature"
      title="Run it. Step it. Un-run it."
      forTheCurious={
        <>
          <p>
            Reverse execution is achieved with per-instruction diff
            snapshots kept inside the wasm core. The snapshot stores
            only what changed (typically one register write + a flag
            update) so a million-instruction run rewinds in a few
            megabytes of memory rather than a few hundred. When you
            click ◀ Back, the most recent snapshot is replayed
            inverted: register restored, memory cell restored, stdout
            buffer truncated to its pre-step length.
          </p>
          <p>
            Watch expressions and breakpoint predicates share a
            small expression language: register references, memory
            loads (
            <code className="mono">[BX+SI+4]</code>), flag references
            (<code className="mono">ZF</code>), arithmetic, and
            comparisons. Both persist in <code className="mono">localStorage</code>{" "}
            so they survive a refresh.
          </p>
        </>
      }
    >
      <ul className="prose-list">
        <li>
          <strong>Step ▶</strong> executes one instruction at a
          time. The source line highlights; every panel on the right
          refreshes in lockstep.
        </li>
        <li>
          <strong>◀ Back</strong> rewinds. The full register file,
          the flag word, the memory hex panel, the stdout buffer —
          everything reverts to where it was a step earlier. Yes,
          even the printed characters.
        </li>
        <li>
          <strong>Watch expressions</strong> evaluate after every
          step.{" "}
          <code className="mono">AX + BX</code>,{" "}
          <code className="mono">[100h]</code>,{" "}
          <code className="mono">ZF == 1</code> — keep an eye on the
          thing you care about without scrolling.
        </li>
        <li>
          <strong>Breakpoint predicates</strong> stop a long run at
          the first instruction where a condition is true.
          <code className="mono"> CF == 1 &amp;&amp; AX &gt; 100</code>{" "}
          finds the corner case faster than print statements.
        </li>
      </ul>
    </Slide>
  );
}
