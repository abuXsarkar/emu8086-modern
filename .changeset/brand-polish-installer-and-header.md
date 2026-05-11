- **Brand polish across IDE header, desktop installer, and Help menu**.
  The IDE header now leads with the hairline-square brand mark next
  to the product name instead of name-only. The Windows installer
  config now points at the brand `icon.ico` explicitly (no more
  reliance on Tauri's implicit default) and pins `installMode` to
  `currentUser` so a non-admin student can install without an UAC
  prompt. The desktop Help → Documentation menu used to open the
  GitHub README; it now opens the published docs hub at
  `https://abuxsarkar.github.io/emu8086-modern/docs/` — the README
  is for repo visitors, the docs hub is what end users should see.
  The capabilities allowlist gains the Pages origin so the opener
  plugin accepts the new URL.
