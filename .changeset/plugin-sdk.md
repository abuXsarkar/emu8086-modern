- **Plugin SDK 1.0**. New `@emu8086/plugin-sdk` package exposes a
  minimal authoring surface for **OUT-driven device plugins** —
  TypeScript-only, no Rust changes, no wasm rebuilds. A plugin is
  a React component plus a one-line `registerDevicePlugin({...})`
  call; the IDE picks it up at build time and renders it in the
  device gallery alongside the built-in peripherals (including
  the pop-out-into-floater affordance for free).
  `@emu8086/plugin-example-buzzer` ships as the canonical
  reference: observes port 200 (0xC8), pulses a speaker icon on
  every write, and optionally plays a Web Audio tone proportional
  to the byte value. `docs/plugin-sdk.md` walks through the
  authoring loop end to end. v1 deliberately skips IN-driven
  devices (need a Rust callback surface), assembler / language
  extensions, and runtime URL loading — all flagged as v2
  follow-ups.
