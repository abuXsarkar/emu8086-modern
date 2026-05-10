// Renders every plugin registered via @emu8086/plugin-sdk inside
// a DeviceSlot, so they pop out / dock just like the built-in
// devices. The host (App.tsx) provides the port reader + a step
// counter that drives plugin re-renders.

import { getRegisteredDevicePlugins } from "@emu8086/plugin-sdk";
import { DeviceSlot } from "./DeviceSlot";

interface PluginGalleryProps {
  port: (n: number) => number;
  stepCount: number;
}

export function PluginGallery({ port, stepCount }: PluginGalleryProps) {
  const plugins = getRegisteredDevicePlugins();
  if (plugins.length === 0) return null;
  return (
    <>
      {plugins.map((p) => (
        <DeviceSlot
          key={p.id}
          id={p.id}
          title={p.title}
          defaultPos={p.defaultPos ?? { x: 720, y: 460 }}
        >
          <p.Component port={port} stepCount={stepCount} outLog={[]} />
        </DeviceSlot>
      ))}
    </>
  );
}
