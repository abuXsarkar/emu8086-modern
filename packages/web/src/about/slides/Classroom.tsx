import { Slide } from "../Slide";

export function Classroom() {
  return (
    <Slide
      slug="classroom"
      kicker="Classroom mode"
      title="A formal lab. Not a chatroom."
      forTheCurious={
        <>
          <p>
            Course metadata is first-class — the room banner shows
            course code, section, semester, institute, teacher
            title + name, and the lab's session title at the top of
            every participant's screen. Templates persist in
            <code className="mono"> localStorage</code> so the
            teacher fills it once per course and dropdown-picks it
            every subsequent class.
          </p>
          <p>
            Submission zips are named after the metadata
            (<span className="mono">EEE304_2026-05-10_Lab3/</span>
            ), files inside are{" "}
            <span className="mono">
              &lt;rollNo&gt;__&lt;name&gt;__&lt;epoch&gt;.asm
            </span>{" "}
            — drops into a grading folder structure without
            renaming. The Plugin SDK plus the classroom protocol
            are versioned (PROTOCOL_VERSION); old clients connecting
            to a newer server get a clean "please refresh" error
            instead of silent failure.
          </p>
        </>
      }
    >
      <p className="prose-lede">
        Every classroom session opens with the course's full
        identity at the top of the screen. Course code · section ·
        lab title · teacher · date · room code. The kind of thing
        you'd put on a lab report. Looks at home next to MATLAB,
        Cisco Packet Tracer, Logisim — the tools institutes
        already trust.
      </p>
      <div className="banner-mock" aria-label="example classroom banner">
        <div className="banner-mock-line">
          <strong>EEE304</strong> · Section A · Lab 3 — Interrupts
          · <em>Dr. R. K. Sharma</em> · 2026-05-10 · room{" "}
          <span className="mono">blue-fox-42</span>
        </div>
        <div className="banner-mock-sub">
          IIT Bombay · Electrical &amp; Electronics Engineering
        </div>
      </div>
    </Slide>
  );
}
