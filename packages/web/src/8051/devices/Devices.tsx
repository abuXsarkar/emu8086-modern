/// 8-device peripheral panel for the /8051/ IDE. Reuses the visual
/// primitives from the 8085 device library (SevenSegment, TrafficLight,
/// …) — they're pure presentation components, so they take whatever
/// `port` number / byte we feed them. What differs on the 8051 is the
/// port-id space: writes go to the four port SFRs (P0=0x80, P1=0x90,
/// P2=0xA0, P3=0xB0) via direct addressing. The core logs each port
/// write into `io_log` with the SFR address as the "port" id; this
/// component drains that stream and routes bytes to the right device.

import { useCallback, useEffect, useState } from "react";
import { SevenSegment } from "../../8085/devices/SevenSegment";
import { TrafficLight } from "../../8085/devices/TrafficLight";
import { LedBar } from "../../8085/devices/LedBar";
import { HexKeypad } from "../../8085/devices/HexKeypad";
import { Stepper } from "../../8085/devices/Stepper";
import { Printer } from "../../8085/devices/Printer";
import { Screen } from "../../8085/devices/Screen";
import {
  Robot,
  applyRobotCommand,
  initialRobotState,
  type RobotState,
} from "../../8085/devices/Robot";

export type PortEvent = [port: number, byte: number];

/// IDATA / SFR poke callback signature. Used by the keypad to feed
/// the last-pressed byte into the simulated port-SFR so the running
/// program sees it on the next `MOV A, P2` read.
export type Poke = (addr: number, value: number) => void;

interface Devices8051Props {
  /// Stream of port-writes drained from the wasm Emulator's io_log
  /// since the previous render. Pass each event once — Devices keeps
  /// its own derived state (printer tape, screen buffer, robot pos).
  events: PortEvent[];
  /// Latest snapshot of each port SFR's value (P0..P3). Drives the
  /// output devices (7-seg, LED bar, traffic light) so they reflect
  /// the current port state even when no new write happened.
  portValues: { p0: number; p1: number; p2: number; p3: number };
  /// IDE callback to write directly into the port SFR (P0..P3) for
  /// input devices (e.g. keypad). Wired to Emulator.poke_idata.
  poke: Poke;
  /// `clear` resets all derived device state — used on Reset.
  resetKey: number;
}

const P0 = 0x80;
const P1 = 0x90;
const P2 = 0xa0;
const P3 = 0xb0;

const PORT_LABEL: Record<number, string> = {
  [P0]: "P0",
  [P1]: "P1",
  [P2]: "P2",
  [P3]: "P3",
};

const PORT_OPTIONS = [
  { value: P0, label: "P0 (80H)" },
  { value: P1, label: "P1 (90H)" },
  { value: P2, label: "P2 (A0H)" },
  { value: P3, label: "P3 (B0H)" },
];

/// Default port assignments — picked so each device sits on a
/// distinct port out of the box. With only 4 ports vs 8 devices,
/// some defaults overlap; the per-device selector lets students
/// rebind without touching code.
const DEFAULTS = {
  sevenSeg: P0,
  trafficLight: P1,
  ledBar: P1,
  keypad: P2,
  stepper: P2,
  printer: P3,
  screen: P3,
  robot: P3,
} as const;

function PortSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      className="ide-select"
      style={{ fontSize: 11, padding: "1px 4px" }}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
    >
      {PORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Devices8051({ events, portValues, poke, resetKey }: Devices8051Props) {
  const [sevenSegPort, setSevenSegPort] = useState<number>(DEFAULTS.sevenSeg);
  const [trafficPort, setTrafficPort] = useState<number>(DEFAULTS.trafficLight);
  const [ledBarPort, setLedBarPort] = useState<number>(DEFAULTS.ledBar);
  const [keypadPort, setKeypadPort] = useState<number>(DEFAULTS.keypad);
  const [stepperPort, setStepperPort] = useState<number>(DEFAULTS.stepper);
  const [printerPort, setPrinterPort] = useState<number>(DEFAULTS.printer);
  const [screenPort, setScreenPort] = useState<number>(DEFAULTS.screen);
  const [robotPort, setRobotPort] = useState<number>(DEFAULTS.robot);

  const [printerBuffer, setPrinterBuffer] = useState<string>("");
  const [screenBuffer, setScreenBuffer] = useState<string>("");
  const [robot, setRobot] = useState<RobotState>(initialRobotState);

  // Reset derived state on host-driven reset.
  useEffect(() => {
    setPrinterBuffer("");
    setScreenBuffer("");
    setRobot(initialRobotState);
  }, [resetKey]);

  // Process every drained event in order. Same shape as the 8085 wiring.
  useEffect(() => {
    if (events.length === 0) return;
    let printerAppend = "";
    let screenAppend = "";
    let screenClear = false;
    let robotState: RobotState | null = null;
    for (const [port, byte] of events) {
      if (port === printerPort) {
        printerAppend += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : ".";
      }
      if (port === screenPort) {
        if (byte === 0x0a) screenAppend += "\n";
        else if (byte === 0x0d) screenAppend += "\r";
        else if (byte === 0x08) screenAppend += "\b";
        else if (byte === 0x0c) {
          screenAppend = "";
          screenClear = true;
        } else if (byte >= 0x20 && byte < 0x7f) {
          screenAppend += String.fromCharCode(byte);
        }
      }
      if (port === robotPort) {
        robotState = applyRobotCommand(robotState ?? robot, byte);
      }
    }
    if (printerAppend.length > 0) setPrinterBuffer((b) => (b + printerAppend).slice(-4096));
    if (screenClear || screenAppend.length > 0) {
      setScreenBuffer((b) => {
        const base = screenClear ? "" : b;
        let next = base;
        for (const ch of screenAppend) {
          if (ch === "\b") next = next.slice(0, -1);
          else next += ch;
        }
        return next.slice(-4096);
      });
    }
    if (robotState !== null) setRobot(robotState);
    // We intentionally exclude derived setters from deps so a single
    // events batch is processed exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const pressKey = useCallback(
    (key: number) => {
      // Keypad behaviour: the IDE writes the keycode into the chosen
      // port SFR so a running program sees it on the next direct
      // read. Matches the 8085 mental model.
      poke(keypadPort, key & 0xff);
    },
    [keypadPort, poke],
  );

  const portValue = (p: number) => {
    if (p === P0) return portValues.p0;
    if (p === P1) return portValues.p1;
    if (p === P2) return portValues.p2;
    return portValues.p3;
  };

  return (
    <div className="devices-stack">
      <div className="device-wrap">
        <span className="device-label">7-seg · <PortSelect value={sevenSegPort} onChange={setSevenSegPort} /></span>
        <SevenSegment value={portValue(sevenSegPort)} port={sevenSegPort} />
      </div>

      <div className="device-wrap">
        <span className="device-label">traffic · <PortSelect value={trafficPort} onChange={setTrafficPort} /></span>
        <TrafficLight value={portValue(trafficPort)} port={trafficPort} />
      </div>

      <div className="device-wrap">
        <span className="device-label">LED bar · <PortSelect value={ledBarPort} onChange={setLedBarPort} /></span>
        <LedBar value={portValue(ledBarPort)} port={ledBarPort} />
      </div>

      <div className="device-wrap">
        <span className="device-label">keypad · <PortSelect value={keypadPort} onChange={setKeypadPort} /></span>
        <HexKeypad onPress={pressKey} port={keypadPort} />
      </div>

      <div className="device-wrap">
        <span className="device-label">stepper · <PortSelect value={stepperPort} onChange={setStepperPort} /></span>
        <Stepper value={portValue(stepperPort)} port={stepperPort} />
      </div>

      <div className="device-wrap">
        <span className="device-label">printer · <PortSelect value={printerPort} onChange={setPrinterPort} /></span>
        <Printer buffer={printerBuffer} port={printerPort} onClear={() => setPrinterBuffer("")} />
      </div>

      <div className="device-wrap">
        <span className="device-label">screen · <PortSelect value={screenPort} onChange={setScreenPort} /></span>
        <Screen buffer={screenBuffer} port={screenPort} onClear={() => setScreenBuffer("")} />
      </div>

      <div className="device-wrap">
        <span className="device-label">robot · <PortSelect value={robotPort} onChange={setRobotPort} /></span>
        <Robot state={robot} port={robotPort} onClear={() => setRobot(initialRobotState)} />
      </div>

      <details className="devices-config">
        <summary>port mapping cheatsheet</summary>
        <div className="ide-tiny">
          {Object.values(PORT_LABEL).map((p) => (
            <div key={p}>{p}: writes light any device bound to that port</div>
          ))}
        </div>
      </details>
    </div>
  );
}
