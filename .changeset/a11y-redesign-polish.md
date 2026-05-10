- **A11y polish for the paper-aesthetic redesign**. Each `.pane` and
  `.aside-section` now carries `aria-labelledby` pointing at its
  smallcaps heading, so screen readers announce the visible region
  name instead of "region". The `Floater` pulls focus to its close
  button on open and dismisses on `Escape`; `DeviceSlot` restores
  focus to the popout / dock button after the floater closes so a
  keyboard user doesn't fall back to the body. Pop-out / dock buttons
  carry `aria-expanded` reflecting state. The 3-column shell's two
  `<aside>` landmarks finally have `aria-label`s.
