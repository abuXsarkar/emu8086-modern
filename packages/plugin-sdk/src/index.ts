// Public surface of @emu8086/plugin-sdk.
//
// v1 scope is deliberately small: a plugin is a React component
// that observes port writes from the emulator and renders some
// visualization. The plugin doesn't need any Rust changes — it
// piggybacks on the emulator's existing `port_byte()` accessor
// and the step counter that the IDE already exposes.
//
// Out of scope for v1 (deferred):
//   - IN-driven plugins (devices the program reads from). These
//     need a Rust-side callback registry and a stable ABI; revisit
//     when there's real demand.
//   - Assembler / language extensions.
//   - Editor language additions (highlighter, completions).
//   - Runtime plugin loading from URL. Today, plugins are static
//     workspace packages imported at build time.

import type { ComponentType } from "react";

export { registerDevicePlugin, getRegisteredDevicePlugins } from "./registry.js";

/** Props every device plugin component receives. */
export interface DevicePluginProps {
  /** Read the latest value written to a port (0..65535). Returns 0 if
   *  no write has been recorded since the most recent reset. */
  port: (n: number) => number;
  /** Cumulative number of instructions the stepper has executed
   *  since the last reset. Changes once per step; useful as a
   *  useEffect dependency to react to writes without polling. */
  stepCount: number;
  /** Optional: the entire OUT log since the last reset. Each entry
   *  is `{ port, value }`. Useful for plugins that want to plot
   *  history (oscilloscope, counter, etc.) instead of just the
   *  latest value. */
  outLog: ReadonlyArray<OutLogEntry>;
}

export interface OutLogEntry {
  port: number;
  value: number;
}

/** Plugin descriptor. */
export interface DevicePlugin {
  /** Stable id used as React key + DeviceSlot localStorage prefix
   *  (`emu8086.dev-popped:<id>`). Lowercase ASCII; no spaces. */
  id: string;
  /** Human-readable name shown in the device gallery and floater
   *  title bar. Keep it short — typical room is ~30 chars. */
  title: string;
  /** Optional default position when the user pops the device out
   *  into a draggable floater. Defaults to a sane location if
   *  omitted. */
  defaultPos?: { x: number; y: number };
  /** Optional list of ports this plugin observes. Purely
   *  informational at the moment; the device gallery uses it to
   *  surface a small "port N" caption. */
  ports?: ReadonlyArray<number>;
  /** The React component. Receives DevicePluginProps. */
  Component: ComponentType<DevicePluginProps>;
}
