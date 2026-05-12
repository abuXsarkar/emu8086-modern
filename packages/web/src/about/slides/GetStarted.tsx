import { Slide } from "../Slide";

export function GetStarted() {
  return (
    <Slide
      slug="get-started"
      kicker="Ready in 30 seconds."
      title="Three ways in."
    >
      <div className="get-started-grid">
        <a className="get-started-card primary" href="/">
          <span className="get-started-num mono">01</span>
          <h3>In your browser</h3>
          <p>
            Open the IDE. No install, no sign-up. Bookmark it; it
            works offline after the first load.
          </p>
          <span className="get-started-cta">Open the IDE →</span>
        </a>
        <a
          className="get-started-card"
          href="https://github.com/abuXsarkar/modern8086/releases/latest"
          target="_blank"
          rel="noopener"
        >
          <span className="get-started-num mono">02</span>
          <h3>As a desktop app</h3>
          <p>
            Native Tauri shell for Linux, macOS, and Windows.
            Installs from the latest GitHub Release. Same IDE,
            same data, no browser tab to lose.
          </p>
          <span className="get-started-cta">Download →</span>
        </a>
        <div className="get-started-card">
          <span className="get-started-num mono">03</span>
          <h3>On the command line</h3>
          <p>
            For autograding and CI. One install:
            <br />
            <code className="mono">npm install -g @modern8086/cli</code>
          </p>
          <span className="get-started-cta">
            <code className="mono">m86 --help</code>
          </span>
        </div>
      </div>
    </Slide>
  );
}
