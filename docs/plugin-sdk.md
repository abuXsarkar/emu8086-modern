# Plugin SDK

Write a custom device that appears in the IDE's device gallery
alongside the built-in peripherals. The SDK is TypeScript-only —
no Rust changes, no wasm rebuilds. A plugin observes port writes
emitted by the user's assembly program and renders a React
component.

> **Scope notice.** v1 covers **OUT-driven devices** — things the
> program writes to. Input devices (where the program does `IN
> AL, port` and expects to read your plugin's data) need a Rust
> callback surface and will land in v2 once there's a real use
> case driving the design. If you have one, open an issue.

## 1. The shape of a plugin

A plugin is one object you pass to `registerDevicePlugin`:

```ts
import { registerDevicePlugin } from "@modern8086/plugin-sdk";
import { MyDevice } from "./MyDevice";

registerDevicePlugin({
  id: "my-device",                   // stable, lowercase, ASCII
  title: "MY DEVICE · port 0xA0",    // shown in the device gallery
  defaultPos: { x: 720, y: 460 },    // initial floater position
  ports: [0xA0],                     // informational (not enforced)
  Component: MyDevice,
});
```

`MyDevice` is a React component receiving three props:

```ts
interface DevicePluginProps {
  /** Read the latest byte written to a port. Returns 0 before any
   *  write has been recorded since the last reset. */
  port: (n: number) => number;

  /** Cumulative number of instructions executed since the last
   *  reset. Use as a useEffect dep to react to writes without
   *  polling. */
  stepCount: number;

  /** Full OUT log since the last reset (v1: empty — populated in a
   *  follow-up). */
  outLog: ReadonlyArray<{ port: number; value: number }>;
}
```

That's the entire API surface. Your component can keep its own
state, use any React features it likes, and import other React
component libraries. The IDE wraps the component in a `DeviceSlot`
that handles the pop-out-to-floater affordance for you.

## 2. The smallest possible plugin

```tsx
import { useEffect, useState } from "react";
import { registerDevicePlugin } from "@modern8086/plugin-sdk";
import type { DevicePluginProps } from "@modern8086/plugin-sdk";

function Counter({ port, stepCount }: DevicePluginProps) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (port(0xA0) !== 0) setCount((n) => n + 1);
  }, [stepCount, port]);
  return <div>{count} writes to port A0</div>;
}

registerDevicePlugin({
  id: "counter",
  title: "COUNTER · port 0xA0",
  Component: Counter,
});
```

Drop that into `packages/web/src/plugins.ts`, refresh the IDE,
write `OUT 0xA0, AL` in some assembly, and the counter ticks.

## 3. Packaging a plugin

Two ways to ship a plugin:

### a. As a workspace package (recommended)

Mirror the example at `packages/plugins/example-buzzer/`:

```
packages/plugins/my-device/
  src/
    index.ts          // registerDevicePlugin(...)
    MyDevice.tsx      // the React component
  package.json
  tsconfig.json
```

`packages/web/package.json` declares the dependency
(`@my/plugin-my-device: "workspace:*"`), `packages/web/src/plugins.ts`
imports it for its side effect:

```ts
import "@my/plugin-my-device";
```

That's it. The IDE picks the plugin up at build time; the device
gallery shows it automatically.

### b. Inline inside a fork's web source

For a quick experiment, drop a `.tsx` file directly into
`packages/web/src/`, register inside it, and import from
`plugins.ts`. No new workspace package required.

## 4. Conventions

- **`id`** is a stable lowercase ASCII string. It's used as the
  React key, the `DeviceSlot` localStorage prefix
  (`emu8086.dev-popped:<id>`), and the React `Floater` position
  key (`emu8086.floaters[<id>]`). Don't change it after release —
  doing so will lose users' pop-out preferences.
- **`title`** is short (under 30 chars) so it fits in the floater
  title bar without truncation. Convention: uppercase name +
  `·` + port hint.
- **`defaultPos`** picks a screen position that doesn't overlap
  the built-in devices on a 1280×800 viewport. The user can drag
  it elsewhere; the position persists per id.
- **Styling**: components inherit the IDE's `--paper`, `--ink`,
  `--rule`, `--accent` CSS custom properties. Use those for
  consistency with the paper aesthetic. Inline `<style>` blocks
  scoped by a unique class name are fine for small plugins; for
  bigger ones, add a sibling `.css` file and import it.
- **No network calls.** A plugin runs inside the same origin as
  the IDE; making a fetch from one looks (to the user) like the
  IDE phoning home. Keep plugins local-only.

## 5. The example plugin

`packages/plugins/example-buzzer/` is the canonical reference.
It observes port `200` (0xC8), shows a pulsing speaker icon on
every write, and (when "Sound" is toggled on) plays a short
oscillator tone via Web Audio. Copy that directory as the
starting point for your own plugin — the build wiring is already
in place.

Try it:

```asm
; beep with rising pitch
org 100h
mov cx, 8
mov al, 32
beep:
  out 200, al
  add al, 32
  loop beep
mov ah, 4Ch
int 21h
```

Run that in the IDE with sound enabled on the buzzer; you'll hear
eight ascending tones.

## 6. Limitations and follow-ups

- **No IN support yet.** Plugins are pure observers of OUT
  writes; a program can't read from a plugin-provided port. v2.
- **No assembler / language extensions.** The assembler vocabulary
  is fixed by the Rust crate. If you need new directives or
  mnemonics, open an issue describing the use case.
- **Static at build time.** Loading plugins from a URL at runtime
  would need CSP / sandbox decisions; not on the v1 roadmap.
- **No per-plugin storage helper.** Use `localStorage` directly
  if you need persistence; namespace your keys with your plugin's
  `id`.
