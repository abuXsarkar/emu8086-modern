/// Stepper motor — shows a rotor pointing at one of 8 positions based
/// on the low 4 bits of a port. Bits represent the four coil
/// energisations (A, B, A̅, B̅) in the classic unipolar 4-coil scheme.
/// Walking patterns 06H, 0CH, 09H, 03H (1-2-3-4) rotates clockwise;
/// students typically OUT a delay loop of those patterns.

import { useMemo } from "react";

export interface StepperProps {
  value: number;
  port: number;
}

/// Map the four low bits to a rotor angle (0..7 octant). Empty
/// (0) and all-on (F) sit at angle 0 — undefined motion in those
/// states.
function angleOctant(bits: number): number {
  switch (bits & 0x0F) {
    case 0x01: return 0; // A only
    case 0x03: return 1; // A + B
    case 0x02: return 2; // B only
    case 0x06: return 3; // B + Ā
    case 0x04: return 4; // Ā only
    case 0x0C: return 5; // Ā + B̄
    case 0x08: return 6; // B̄ only
    case 0x09: return 7; // B̄ + A
    default:   return 0;
  }
}

export function Stepper({ value, port }: StepperProps) {
  const lit = useMemo(() => ({
    a: (value & 0x01) !== 0,
    b: (value & 0x02) !== 0,
    abar: (value & 0x04) !== 0,
    bbar: (value & 0x08) !== 0,
  }), [value]);
  const angle = (angleOctant(value) * 45 - 90) * (Math.PI / 180);
  const cx = 50;
  const cy = 50;
  const rx = cx + Math.cos(angle) * 28;
  const ry = cy + Math.sin(angle) * 28;
  const lit_c = "#dc2626";
  const off_c = "rgba(0,0,0,0.18)";

  return (
    <div className="device-wrap">
      <div className="device-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H · stepper (low 4 bits)
      </div>
      <svg viewBox="0 0 100 100" width="84" height="84" className="stepper-svg" role="img">
        {/* Four coil markers around the rotor */}
        <circle cx="50" cy="14" r="6" fill={lit.a ? lit_c : off_c} />
        <circle cx="86" cy="50" r="6" fill={lit.b ? lit_c : off_c} />
        <circle cx="50" cy="86" r="6" fill={lit.abar ? lit_c : off_c} />
        <circle cx="14" cy="50" r="6" fill={lit.bbar ? lit_c : off_c} />
        {/* Rotor frame */}
        <circle cx="50" cy="50" r="32" fill="none" stroke="#9ca3af" strokeWidth="0.7" />
        {/* Rotor arrow */}
        <line x1="50" y1="50" x2={rx} y2={ry} stroke="#1E3A8A" strokeWidth="3" strokeLinecap="round" />
        <circle cx="50" cy="50" r="4" fill="#1E3A8A" />
      </svg>
    </div>
  );
}
