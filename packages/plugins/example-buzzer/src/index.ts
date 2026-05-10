// Example device plugin: a buzzer wired to port 200 (0xC8).
// Programs that `OUT 200, AL` light up the speaker icon for a beat
// and (if the user has enabled sound in the plugin's UI) play a
// short tone via Web Audio.
//
// This file is the entire plugin's *registration*. The visual
// lives in Buzzer.tsx so the SDK shape stays clear at a glance.

import { registerDevicePlugin } from "@emu8086/plugin-sdk";
import { Buzzer } from "./Buzzer.js";

registerDevicePlugin({
  id: "example-buzzer",
  title: "BUZZER · port 200",
  defaultPos: { x: 720, y: 460 },
  ports: [200],
  Component: Buzzer,
});
