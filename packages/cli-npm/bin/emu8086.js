#!/usr/bin/env node
// Tiny shim that spawns the platform-native binary downloaded
// during `npm install` by `scripts/install.js`. Any argv is
// forwarded verbatim; exit code propagates.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const exe = process.platform === "win32" ? "emu8086.exe" : "emu8086";
const binary = path.join(here, exe);

if (!existsSync(binary)) {
  console.error(
    "[emu8086] binary not found at " +
      binary +
      "\nThis usually means `npm install` couldn't reach github.com to download\n" +
      "the per-platform release artifact. Re-run `npm rebuild @emu8086/cli`,\n" +
      "or install manually from https://github.com/abuXsarkar/emu8086-modern/releases",
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), {
  stdio: "inherit",
});

if (result.error) {
  console.error("[emu8086]", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
