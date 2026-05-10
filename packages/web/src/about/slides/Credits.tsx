import { Slide } from "../Slide";

export function Credits() {
  return (
    <Slide
      slug="credits"
      kicker="Made by"
      title="Built in the open. For students. Free forever."
    >
      <div className="credits-grid">
        <div className="credits-block">
          <h3>Author</h3>
          <p className="credits-name">Abu Sufian Sarkar</p>
          <p className="credits-meta">
            <a
              href="https://github.com/abuXsarkar"
              target="_blank"
              rel="noopener"
            >
              github.com/abuXsarkar
            </a>
          </p>
        </div>
        <div className="credits-block">
          <h3>Built with</h3>
          <ul className="credits-list mono">
            <li>Rust + WebAssembly (emulator core, assembler)</li>
            <li>React + Vite + Monaco editor (web IDE)</li>
            <li>Tauri 2 (desktop shell)</li>
            <li>Cloudflare Workers + Durable Objects (classroom)</li>
            <li>Geist + Geist Mono + Instrument Serif (type)</li>
          </ul>
        </div>
        <div className="credits-block">
          <h3>Inspired by</h3>
          <p>
            <em>emu8086</em>, the long-running shareware tool that
            sat on the curriculum at South Asian engineering
            institutes for two decades. <em>emu8086-modern</em> is a
            clean-room reimplementation — not a fork, not a port — of
            the experience it pioneered, rebuilt without the paywalls,
            the nag screens, or the closed-source constraints.
          </p>
        </div>
        <div className="credits-block">
          <h3>License</h3>
          <p>
            MIT. Free to use, fork, run, embed, whitelabel, sell
            services around. The only thing you can't do is take
            the name. The whole project lives at{" "}
            <a
              href="https://github.com/abuXsarkar/emu8086-modern"
              target="_blank"
              rel="noopener"
              className="mono"
            >
              github.com/abuXsarkar/emu8086-modern
            </a>
            .
          </p>
        </div>
      </div>
      <p className="credits-tagline">
        Made in India for students everywhere. Made open so it
        stays that way.
      </p>
    </Slide>
  );
}
