import { Section } from "../Section";

export function Privacy() {
  return (
    <Section
      id="privacy"
      title="Privacy"
      lede="The short version: we don’t collect anything. The long version follows."
    >
      <p className="docs-meta">Last updated: 2026-05-10</p>

      <h3>The web IDE</h3>
      <ul>
        <li>
          Your code never leaves your browser unless you click <em>Share</em>,
          enter a classroom, or push a submission to your instructor.
        </li>
        <li>
          We use <strong>localStorage</strong> to remember your editor theme,
          which examples you last ran, and your settings. Clearing site data
          clears all of it.
        </li>
        <li>
          The page caches itself for offline use (a service worker, the
          same mechanism Gmail uses). Cached files live on your device.
        </li>
        <li>
          No analytics. No third-party trackers. No advertising network.
          No marketing pixels. No fingerprinting.
        </li>
      </ul>

      <h3>The Share button</h3>
      <p>
        Generates a URL whose fragment (the part after <code>#</code>)
        contains your compressed program. Per HTTP spec, fragments are
        never sent to the server. The destination receives your code only
        when it opens the URL in their own browser.
      </p>

      <h3>Classroom mode</h3>
      <p>
        While you are in a room, your editor state is sent over WebSocket
        to whichever classroom server the room is hosted on. That server is
        either:
      </p>
      <ul>
        <li>Run by your instructor on a machine they control, or</li>
        <li>The public Cloudflare-hosted instance, or</li>
        <li>An institutional self-hosted deployment.</li>
      </ul>
      <p>
        Room state is held in memory only. It is reaped automatically 30
        minutes after the host disconnects. Source code is not written to
        disk on the server side.
      </p>

      <h3>The desktop build</h3>
      <p>
        Same as the web build, plus: settings are persisted in your OS user
        directory (<code>~/.modern8086/</code> on Linux/macOS,{" "}
        <code>%APPDATA%\\modern8086</code> on Windows). The app checks for
        updates from GitHub Releases — that check sends GitHub your IP and
        the running version. Disable it from the <em>Updates</em> setting if
        you’d rather not.
      </p>

      <h3>The CLI</h3>
      <p>
        No network access. Period.
      </p>

      <h3>Cookies</h3>
      <p>
        None used.
      </p>

      <h3>Children</h3>
      <p>
        The product is suitable for students of any age. We don’t collect
        information, so age-gating is moot.
      </p>

      <h3>Contact</h3>
      <p>
        Privacy questions: open an issue at{" "}
        <a
          href="https://github.com/abuXsarkar/modern8086/issues"
          target="_blank"
          rel="noopener"
        >
          the GitHub repo
        </a>
        , or email the maintainer at the address listed there.
      </p>

      <h3>Changes</h3>
      <p>
        We’ll update the “Last updated” date at the top whenever this
        document changes. Material changes will also land in the CHANGELOG.
      </p>
    </Section>
  );
}
