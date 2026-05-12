import { Section } from "../Section";

export function Credits() {
  return (
    <Section
      id="credits"
      title="Credits"
      lede="Built by, with, and for the students who keep asking better questions."
    >
      <h3>Maintainer</h3>
      <p>
        <strong>Abu Sufian Sarkar</strong> — design, architecture,
        most of the code. Reachable on GitHub as{" "}
        <a
          href="https://github.com/abuXsarkar"
          target="_blank"
          rel="noopener"
        >
          @abuXsarkar
        </a>
        .
      </p>

      <h3>Contributors</h3>
      <p>
        The full list lives at{" "}
        <a
          href="https://github.com/abuXsarkar/modern8086/graphs/contributors"
          target="_blank"
          rel="noopener"
        >
          github.com/abuXsarkar/modern8086/graphs/contributors
        </a>
        . Special thanks to the early testers across South-Asian engineering
        colleges who wore out the build and filed the issues that shaped it.
      </p>

      <h3>Owed</h3>
      <ul>
        <li>
          The original <em>emu8086</em>, for setting the bar on a teaching
          emulator that students actually enjoyed using.
        </li>
        <li>
          The lab manual authors at universities across the region whose
          worked examples form the regression corpus.
        </li>
        <li>
          The Monaco, Rust, WebAssembly, React, Vite, and Tauri teams whose
          work this project stands on.
        </li>
      </ul>

      <h3>Brand</h3>
      <p>
        The hairline-square mark, the paper aesthetic, and the ink-blue
        accent are by the project’s design lead — they’re the difference
        between “works” and “feels good to open in the morning”.
      </p>

      <h3>If you use this in your course</h3>
      <p>
        We’d love to hear about it. Open a Discussion on GitHub, or email
        the maintainer. There is no “please cite” line — but a quiet word
        helps us understand who the project is serving.
      </p>
    </Section>
  );
}
