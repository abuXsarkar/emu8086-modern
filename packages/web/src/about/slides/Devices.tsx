import { Slide } from "../Slide";

const devices = [
  { label: "7-segment display", port: "199 (0xC7)" },
  { label: "Traffic light", port: "4" },
  { label: "LED matrix 8×8", port: "8–15" },
  { label: "Stepper motor", port: "7" },
  { label: "Text screen 80×25", port: "B800:0000" },
  { label: "Keyboard", port: "0x60 / 0x64" },
  { label: "LPT1 printer", port: "0x378" },
  { label: "9×9 robot grid", port: "0x12" },
];

export function Devices() {
  return (
    <Slide
      slug="devices"
      kicker="Eight live peripherals"
      title="The machine, as you ask it to be."
      forTheCurious={
        <>
          <p>
            Every device is a small Rust state machine that watches
            the CPU's port writes (and, for the keyboard, feeds
            reads back). They live in the same wasm module as the
            core; the IDE reads each device's exposed accessor
            after every step and renders it through a React
            component.
          </p>
          <p>
            <strong>Adding your own?</strong> The Plugin SDK 1.0
            ships a one-call API: write a React component that
            takes a port-reader callback, register it with{" "}
            <code className="mono">registerDevicePlugin(...)</code>,
            and it shows up in the device gallery alongside the
            built-ins — pop-out floater and all. The example
            buzzer plugin (port 200) is ~80 lines.
          </p>
        </>
      }
    >
      <p className="prose-lede">
        Write a byte to a port. Watch the device light up. That's
        the whole story. Each device pops out into a draggable
        window so you can keep an eye on it while editing.
      </p>
      <ul className="device-grid">
        {devices.map((d) => (
          <li key={d.label} className="device-chip">
            <span className="device-chip-label">{d.label}</span>
            <span className="device-chip-port mono">{d.port}</span>
          </li>
        ))}
      </ul>
    </Slide>
  );
}
