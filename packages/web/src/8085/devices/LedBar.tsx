/// 8-LED bar. Drives 8 LEDs from the 8 bits of a port. Bit 0 = left.
/// The classic "shift a pattern across an array of LEDs" lab — RLC
/// + OUT in a loop.

export interface LedBarProps {
  value: number;
  port: number;
}

export function LedBar({ value, port }: LedBarProps) {
  const bits = Array.from({ length: 8 }, (_, i) => (value & (1 << i)) !== 0);
  const off = "rgba(0,0,0,0.12)";
  const on = "#22c55e";
  return (
    <div className="device-wrap">
      <div className="device-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H · LED bar (bit 0 = left)
      </div>
      <div className="ledbar-row">
        {bits.map((lit, i) => (
          <span
            key={i}
            className="ledbar-led"
            style={{
              background: lit ? on : off,
              boxShadow: lit ? "0 0 6px #22c55e" : "none",
            }}
            aria-label={`bit ${i} ${lit ? "on" : "off"}`}
          />
        ))}
      </div>
    </div>
  );
}
