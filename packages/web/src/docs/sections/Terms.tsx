import { Section } from "../Section";

export function Terms() {
  return (
    <Section
      id="terms"
      title="Terms of use"
      lede="What you can and can’t do with the software and the hosted service."
    >
      <p className="docs-meta">Last updated: 2026-05-10</p>

      <h3>The software</h3>
      <p>
        The software is offered under the MIT License (see{" "}
        <a href="#license">License</a>). Read it — it’s short and it
        governs everything below.
      </p>

      <h3>The hosted IDE</h3>
      <p>
        We offer the IDE at a public URL as a convenience. By using the
        hosted instance you agree to:
      </p>
      <ul>
        <li>
          Not abuse it (no automated bulk traffic, no penetration testing
          without prior permission, no resource exhaustion).
        </li>
        <li>
          Not use the hosted classroom server for purposes other than
          teaching or studying 8086 assembly (or related coursework). It’s
          a community resource, please be kind.
        </li>
        <li>
          Accept that the service is provided “as is”. We don’t guarantee
          uptime, durability, or correctness for any specific use.
        </li>
      </ul>

      <h3>The classroom server</h3>
      <p>
        Rooms are best-effort. They’re reaped 30 minutes after the host
        disconnects. We don’t guarantee message delivery, room persistence,
        or any specific concurrency limit. If you need guarantees, self-host.
      </p>

      <h3>Your content</h3>
      <p>
        You retain all rights to the programs you write. We don’t claim any
        license to them. Source code typed into the IDE stays on your
        device unless you explicitly share or submit it.
      </p>

      <h3>Acceptable use</h3>
      <p>
        Don’t use the project to:
      </p>
      <ul>
        <li>Harm, defraud, or harass another person.</li>
        <li>Violate the law in your jurisdiction.</li>
        <li>Distribute malware. (Yes, 8086 viruses are still viruses.)</li>
        <li>
          Misrepresent yourself or the project (passing this off as the
          original closed-source emu8086 misleads people; please don’t).
        </li>
      </ul>

      <h3>Trademarks</h3>
      <p>
        “emu8086” is a name used historically by other projects. We use
        “modern8086” specifically to disambiguate from the original.
        Don’t pass forks of this project off as the upstream — rename the
        binary if you ship something materially different.
      </p>

      <h3>Liability</h3>
      <p>
        The MIT License says it clearly: no warranty, no liability.
        Inherent to anything free.
      </p>

      <h3>Termination</h3>
      <p>
        We may suspend access to the hosted instance for any account or IP
        engaged in abuse. The software itself is yours forever under MIT.
      </p>

      <h3>Changes</h3>
      <p>
        Material changes to these terms will land in the CHANGELOG and the
        “Last updated” date above will move.
      </p>
    </Section>
  );
}
