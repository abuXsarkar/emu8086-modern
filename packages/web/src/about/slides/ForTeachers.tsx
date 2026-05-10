import { Slide } from "../Slide";

export function ForTeachers() {
  return (
    <Slide
      slug="for-teachers"
      kicker="For teachers"
      title="Run a 50-minute lab without losing track."
      forTheCurious={
        <>
          <p>
            The classroom service is a single WebSocket relay. The
            Room state machine is runtime-agnostic Rust- — sorry,
            TypeScript — code that ships in two flavours: a Node +
            <code className="mono"> ws</code> service for institutes
            that self-host, and a Cloudflare Workers + Durable
            Objects build for everyone else. Identical protocol,
            identical wire format, identical behaviour.
          </p>
          <p>
            Host tokens are HMAC-SHA256 signatures over (room id,
            creation time) with primary + previous-secret rotation
            in the standard JWT pattern. Room codes are friendly
            triplets like <code className="mono">blue-fox-42</code>{" "}
            — 36 × 60 × 90 ≈ 194,000 codes, easy to dictate over
            voice. Roll numbers are first-class identifiers and
            land in the downloaded submission filenames.
          </p>
        </>
      }
    >
      <ul className="prose-list">
        <li>
          <strong>One click to start.</strong> A room code like{" "}
          <code className="mono">blue-fox-42</code>. Students join with
          their roll number and a name. No accounts, no logins.
        </li>
        <li>
          <strong>See everyone, live.</strong> Every editor in the
          room shows up in your roster. Click a row to read it.
          Click again to leave a note. Need to demonstrate? Take
          control of their editor and type into it directly.
        </li>
        <li>
          <strong>Hand-raise + submit.</strong> Students press a
          button when they're stuck or done. The teacher's drawer
          floats hands-up rows to the top; submissions accumulate
          and download as a zip with proper{" "}
          <span className="mono">CSE-22-001_Aisha_Khan_...asm</span>{" "}
          filenames.
        </li>
        <li>
          <strong>Print the attendance sheet.</strong> One button
          renders an A4 lab session summary: course header, every
          student listed with their roll, joined-at time,
          hand-raise count, submission count. CSV export beside it
          for your grade-system imports.
        </li>
      </ul>
    </Slide>
  );
}
