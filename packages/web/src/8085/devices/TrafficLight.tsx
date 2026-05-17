/// Traffic-light output device. Drives three LEDs from the low
/// three bits of a port:
///   bit 0 → red
///   bit 1 → yellow
///   bit 2 → green
///
/// Classic 8085 lab exercise: state machine cycles R → R+Y → G →
/// Y → R with delays driven by DCX loops. Comes for free now that
/// IN/OUT are real port-IO.

export interface TrafficLightProps {
  value: number;
  port: number;
}

export function TrafficLight({ value, port }: TrafficLightProps) {
  const red = (value & 0x01) !== 0;
  const yellow = (value & 0x02) !== 0;
  const green = (value & 0x04) !== 0;
  const off = "rgba(0,0,0,0.18)";
  return (
    <div className="device-wrap">
      <div className="device-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H · traffic
      </div>
      <div className="traffic-stack">
        <span
          className="traffic-bulb"
          style={{ background: red ? "#dc2626" : off, boxShadow: red ? "0 0 8px #dc2626" : "none" }}
          aria-label={red ? "red on" : "red off"}
        />
        <span
          className="traffic-bulb"
          style={{ background: yellow ? "#f59e0b" : off, boxShadow: yellow ? "0 0 8px #f59e0b" : "none" }}
          aria-label={yellow ? "yellow on" : "yellow off"}
        />
        <span
          className="traffic-bulb"
          style={{ background: green ? "#16a34a" : off, boxShadow: green ? "0 0 8px #16a34a" : "none" }}
          aria-label={green ? "green on" : "green off"}
        />
      </div>
    </div>
  );
}
