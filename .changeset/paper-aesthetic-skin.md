- **Paper-aesthetic IDE skin**. The web IDE now renders in the
  hairline-brutalist "paper" design language adopted from the v2 design
  source: token-driven `theme.css` + `components.css` replace ~700
  lines of inline styles in `App.tsx`; Geist, Geist Mono and Instrument
  Serif are self-hosted via `@fontsource-variable/geist`,
  `@fontsource/geist-mono` and `@fontsource/instrument-serif` (no CDN,
  woff2 fingerprinted into the bundle and PWA-precached); the existing
  `emu8086.editor-theme` localStorage key now also flips `body.dark`,
  with an inline pre-paint script in `index.html` to avoid FOUC; Monaco
  gets two new themes (`emu-paper` / `emu-paper-dark`) so syntax colors
  read from the same accent ramp as the chrome. `oklch()` is used as
  the primary color space with a hex `@supports not (oklch)` fallback
  for older browsers (lab Win10 PCs). The layout was lifted to a
  three-column shell (left rail / center / right rail): the example
  picker and a file-drop hint moved into the new left rail, freeing
  the editor toolbar to focus on Run/Step/Reset/Share. A new
  `Floater.tsx` component implements draggable, position-persistent
  lab-bench windows; every right-rail peripheral (7-seg, traffic, LED
  matrix, stepper, keyboard, printer, robot, screen) is wrapped in a
  `DeviceSlot` so it can be detached into a Floater independently —
  pop-out state and per-floater positions persist through reloads.
  A `TweaksPanel` (gear toggle, bottom-right) exposes density,
  layout-width, accent-color and paper-grain controls; values
  persist under `emu8086.tweaks` and apply live via body classes
  plus a `:root` `--accent` override.
