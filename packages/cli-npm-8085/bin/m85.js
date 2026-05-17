#!/usr/bin/env node
// Tiny shim that spawns the platform-native binary downloaded
// during `npm install` by `scripts/install.js`. Any argv is
// forwarded verbatim; exit code propagates.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const exe = process.platform === "win32" ? "m85.exe" : "m85";
const binary = path.join(here, exe);

if (!existsSync(binary)) {
  console.error(
    "[m85] binary not found at " +
      binary +
      "\nThis usually means `npm install` couldn't reach github.com to download\n" +
      "the per-platform release artifact (or no release is published yet). Try:\n" +
      "  • npm rebuild @modern8085/cli\n" +
      "  • install manually from https://github.com/abuXsarkar/modern8086/releases\n" +
      "  • or build from source: cargo install --path packages/cli-8085",
  );
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), {
  stdio: "inherit",
});

if (result.error) {
  console.error("[m85] failed to launch:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
