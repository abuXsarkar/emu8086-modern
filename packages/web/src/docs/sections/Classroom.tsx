import { Section } from "../Section";

export function Classroom() {
  return (
    <Section
      id="classroom"
      title="Classroom mode"
      lede="One teacher, many students, no third-party service required."
    >
      <h3>What it does</h3>
      <ul>
        <li>
          Teacher creates a room and gets a short, friendly code (e.g.{" "}
          <code>blue-fox-42</code>).
        </li>
        <li>
          Students paste the code on the IDE&apos;s join screen. They land in
          a shared editor where the teacher&apos;s cursor and current
          instruction are visible.
        </li>
        <li>
          Teacher can grab the cursor unilaterally (handy when explaining).
          Either side can lower the wall for free editing.
        </li>
        <li>
          Submissions: students can submit their current source to the
          teacher; the teacher exports the whole class as a zip.
        </li>
      </ul>

      <h3>How it works</h3>
      <p>
        A small WebSocket server runs somewhere — your laptop, a Raspberry
        Pi, a Cloudflare Worker. The IDE in every connected browser talks
        to it. The server doesn&apos;t store anything beyond the active
        rooms; everything is in-memory and reaped 30 minutes after the
        teacher disconnects.
      </p>

      <h3>Setup</h3>
      <p>
        For a single class on your own laptop:
      </p>
      <pre>
        <code>{`# in one terminal
pnpm --filter @emu8086/classroom-server start

# in the IDE, open Settings -> Classroom
# point it at ws://your-laptop-ip:8787`}</code>
      </pre>
      <p>
        For something more permanent, the room hub also runs as a
        Cloudflare Worker (Durable Object backed). The same code; just
        different deploy target.
      </p>
      <p>
        Both modes are free to use. The Workers deployment is the easiest
        if you don&apos;t already have a server.
      </p>

      <h3>Privacy</h3>
      <p>
        Nothing is logged, nothing is persisted past the room&apos;s
        lifetime. Source code never leaves the room. The classroom server
        is open source — read it, audit it, run your own.
      </p>
    </Section>
  );
}
