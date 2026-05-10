import { Section } from "../Section";

export function Devices() {
  return (
    <Section
      id="devices"
      title="Devices"
      lede="The peripherals that lab exercises ask about, attached to ports the textbooks specify."
    >
      <h3>What is wired up</h3>
      <ul>
        <li>
          <strong>LED matrix</strong> — 8x8 grid on port <code>10h</code>. Each
          byte you <code>OUT</code> updates one row. The classic smiley-face
          exercise works out of the box.
        </li>
        <li>
          <strong>Seven-segment display</strong> — port <code>11h</code>.
          Treats the value as a hex nibble pattern.
        </li>
        <li>
          <strong>Traffic-light cluster</strong> — port <code>12h</code>.
          Three lamps per signal, two intersections. Useful for state-machine
          exercises.
        </li>
        <li>
          <strong>Stepper motor</strong> — port <code>13h</code>. Each pulse
          rotates the rotor visualisation by 7.5°.
        </li>
        <li>
          <strong>BIOS INT 10h</strong> subset — set cursor, write character,
          set video mode, clear screen. Programs that print to “the screen”
          via INT 10h work as written.
        </li>
        <li>
          <strong>BIOS INT 21h</strong> subset — character I/O, string output,
          program terminate, get/set date and time.
        </li>
      </ul>

      <h3>Floating windows</h3>
      <p>
        Devices live in the right rail by default. Drag a device’s title to
        pop it out into a floating window — useful when you want the LED
        matrix sitting next to your code while you tweak inner-loop timings.
        Position is remembered between sessions.
      </p>

      <h3>Custom devices via plugins</h3>
      <p>
        If your textbook describes a peripheral we don’t ship, write a small
        plugin (see <a href="#plugins">Plugin SDK</a>) — it’s ~30 lines of
        JavaScript per device.
      </p>
    </Section>
  );
}
