import { Slide } from "../Slide";
import { Mark } from "../Landing";

export function Hero() {
  return (
    <Slide slug="hero" title="modern8086" hideFromIndex>
      <div className="hero-stack">
        <div className="hero-mark">
          <Mark size={120} />
        </div>
        <h1 className="hero-title">
          The <span className="hero-italic">8086</span>,<br />
          for the way you teach today.
        </h1>
        <p className="hero-lede">
          A modern, open-source 8086 microprocessor emulator and
          assembly IDE. No DOSBox. No paid licence. Runs in any
          browser; pops out as a desktop app; comes to class with a
          live, hand-raise-and-submit classroom session.
        </p>
        <div className="hero-actions">
          <a className="hero-cta primary" href="/">
            Open the IDE
          </a>
          <a
            className="hero-cta ghost"
            href="https://github.com/abuXsarkar/modern8086"
            target="_blank"
            rel="noopener"
          >
            View on GitHub
          </a>
        </div>
        <p className="hero-meta mono">
          Free forever · MIT-licensed · No telemetry by default
        </p>
      </div>
    </Slide>
  );
}
