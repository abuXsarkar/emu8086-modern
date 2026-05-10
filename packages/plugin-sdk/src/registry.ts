// Plugin registry. Plugins call `registerDevicePlugin` at
// module-import time (top-level side effect); the IDE imports the
// plugin barrel module before its first React render, so the list
// is stable by then.
//
// The registry rejects duplicates so a hot-reloaded plugin module
// can re-call without piling up entries — the second
// registration with the same id wins.

import type { DevicePlugin } from "./index.js";

const registry: Map<string, DevicePlugin> = new Map();

/** Register (or replace) a plugin. Last writer wins for a given id. */
export function registerDevicePlugin(plugin: DevicePlugin): void {
  if (!plugin || typeof plugin.id !== "string" || plugin.id.length === 0) {
    throw new Error("DevicePlugin.id is required");
  }
  registry.set(plugin.id, plugin);
}

/** Snapshot of currently-registered plugins. Returned in insertion
 *  order — first registered is rendered first. */
export function getRegisteredDevicePlugins(): ReadonlyArray<DevicePlugin> {
  return Array.from(registry.values());
}
