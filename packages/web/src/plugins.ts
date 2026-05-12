// Plugin registration barrel. Each line is a side-effect import
// that calls `registerDevicePlugin(...)` at module load.
//
// To add a third-party plugin to your fork: add the package to
// `packages/web/package.json` dependencies and append a line here.
// The plugin's component renders inside a `DeviceSlot` in the
// device gallery; no other plumbing required.
//
// To author your own plugin: see `docs/plugin-sdk.md`.

import "@modern8086/plugin-example-buzzer";
