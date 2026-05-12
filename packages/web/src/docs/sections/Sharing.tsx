import { Section } from "../Section";

export function Sharing() {
  return (
    <Section
      id="sharing"
      title="Sharing & autograding"
      lede="Send a single URL. The receiver gets the source, the device wiring, and any saved breakpoints."
    >
      <h3>The Share button</h3>
      <p>
        Hit <em>Share</em> in the toolbar. The IDE serialises your current
        source, editor settings, and any active devices into the URL fragment
        (compressed). Anyone who opens the link sees exactly what you see.
      </p>
      <p>
        Because the program rides in the URL, the link is self-contained — no
        server is involved. Pin it in a course wiki, paste it in a chat, or
        keep it as a bookmark.
      </p>

      <h3>Autograding</h3>
      <p>
        Each example file can ship with an <code>;; @expect</code> directive in
        a top comment block: a small list of register, flag, and memory
        expectations the program must satisfy when execution halts.
      </p>
      <pre>
        <code>{`;; @expect AX == 0042h
;; @expect ZF == 1
;; @expect [DS:0100] == 0x5A`}</code>
      </pre>
      <p>
        The CLI can run a folder of submissions against an expectation file
        and produce a CSV report:
      </p>
      <pre>
        <code>m86 grade ./submissions --rubric lab3.expect &gt; results.csv</code>
      </pre>
      <p>
        The same machinery runs in-browser for instant feedback while a
        student is solving the exercise.
      </p>
    </Section>
  );
}
