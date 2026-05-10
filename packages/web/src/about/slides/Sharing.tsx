import { Slide } from "../Slide";

export function Sharing() {
  return (
    <Slide
      slug="sharing"
      kicker="Sharing &amp; autograding"
      title="A working program in a single link."
      forTheCurious={
        <>
          <p>
            Share-links encode the buffer as base64url into the URL
            fragment (<code className="mono">#code=...</code>) so the
            payload never crosses the network. The recipient's IDE
            decodes locally on page load. Long programs land at
            roughly 1.3× the source byte count after base64; well
            under typical URL-length limits for the lab programs
            that drive this feature.
          </p>
          <p>
            The CLI grader takes a YAML test spec and a submission
            and emits human output by default or JUnit XML for CI.
            A bundled GitHub Action drops the whole flow into
            GitHub Classroom assignments with a single workflow
            file — no Docker images to maintain.
          </p>
        </>
      }
    >
      <ul className="prose-list">
        <li>
          <strong>Click Share.</strong> The link's in your
          clipboard. Paste it anywhere — chat, email, a forum —
          and the recipient opens the IDE with your exact program
          loaded. Nothing went through a server. There's no expiry.
        </li>
        <li>
          <strong>Autograde from the CLI.</strong>
          <code className="mono"> emu8086 grade spec.yml student.asm</code>{" "}
          runs the program against a test spec and emits a
          pass/fail report — or JUnit XML for your CI.
        </li>
        <li>
          <strong>GitHub Classroom-ready.</strong> A composite
          action ships with the project; drop it into a workflow
          and student PRs are graded automatically.
        </li>
      </ul>
    </Slide>
  );
}
