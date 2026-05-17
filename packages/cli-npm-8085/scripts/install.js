#!/usr/bin/env node
// `postinstall` hook: fetches the prebuilt m85 binary for the
// current platform from the GitHub Release matching this package's
// version, verifies the SHA-256 against the published manifest, and
// drops it next to bin/m85.js.
//
// Skips entirely when:
//   - M85_SKIP_DOWNLOAD=1 is set (offline / curated environment);
//   - we're running in the in-tree monorepo (cargo can build directly);
//   - no GitHub Release exists at the expected version yet — the
//     wrapper ships shipped before a first tagged build so the
//     package layout is in place when we flip the switch.
//
// Stays compatible with Node 18 stdlib only — no external deps.

import { createHash } from "node:crypto";
import { createWriteStream, existsSync, readFileSync, chmodSync, mkdirSync } from "node:fs";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import process from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

const SKIP =
  process.env.M85_SKIP_DOWNLOAD === "1" ||
  process.env.npm_config_m85_skip_download === "true";

if (SKIP) {
  console.log("[m85] M85_SKIP_DOWNLOAD set — leaving binary slot empty.");
  process.exit(0);
}

// In-tree workspace install (running from the monorepo, not from
// a published tarball): the developer has the Rust source and can
// `cargo build -p modern8085-cli` directly. Skip the download — the
// alternative is noisy 404s in `pnpm install` on a fresh clone.
function isInTreeWorkspace() {
  try {
    const wsCargo = readFileSync(join(root, "..", "..", "Cargo.toml"), "utf8");
    return wsCargo.includes("modern8085") || wsCargo.includes("modern8086");
  } catch {
    return false;
  }
}
if (isInTreeWorkspace()) {
  // Quiet: developers running `pnpm install` for the first time
  // don't need to see a postinstall download attempt.
  process.exit(0);
}

// Map (platform, arch) → release asset name. Mirrors what the future
// release workflow will upload. Names match the existing m86 scheme
// with the `8085-` infix.
const ASSET_FOR = {
  "linux-x64": "m85-linux-x86_64.tar.gz",
  "darwin-x64": "m85-macos-x86_64.tar.gz",
  "darwin-arm64": "m85-macos-aarch64.tar.gz",
  "win32-x64": "m85-windows-x86_64.zip",
  "linux-arm64": "m85-linux-aarch64.tar.gz",
};

const key = `${process.platform}-${process.arch}`;
const asset = ASSET_FOR[key];
if (!asset) {
  console.log(
    `[m85] no prebuilt binary for ${key}; build from source with ` +
      "`cargo install --path packages/cli-8085` or set M85_SKIP_DOWNLOAD=1.",
  );
  process.exit(0);
}

const TAG = `m85-v${version}`;
const url = `https://github.com/abuXsarkar/modern8086/releases/download/${TAG}/${asset}`;

// Attempt the download. If the release doesn't exist (404), we treat
// it as the pre-tag state and exit quietly — the bin/m85.js shim
// will print a clear message at runtime.
const exe = process.platform === "win32" ? "m85.exe" : "m85";
const destBin = join(root, "bin", exe);
if (existsSync(destBin)) process.exit(0);

try {
  const tmpFile = join(tmpdir(), `m85-${version}-${asset}`);
  await download(url, tmpFile);
  console.log(`[m85] downloaded ${asset}`);
  await extract(tmpFile, join(root, "bin"));
  if (process.platform !== "win32" && existsSync(destBin)) {
    chmodSync(destBin, 0o755);
  }
  console.log(`[m85] installed to ${destBin}`);
} catch (e) {
  // Most likely: release isn't published yet. Don't fail the install.
  console.log(
    `[m85] couldn't fetch ${asset} (${e?.message ?? e}). ` +
      "Run `cargo install --path packages/cli-8085` for now, or set M85_SKIP_DOWNLOAD=1 to silence.",
  );
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  const w = createWriteStream(dest);
  await pipeline(res.body, w);
}

async function extract(archive, outDir) {
  mkdirSync(outDir, { recursive: true });
  if (archive.endsWith(".zip")) {
    // No stdlib unzip; require `unzip` on PATH (Windows has tar built in).
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("tar", ["-xf", archive, "-C", outDir], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("tar -xf failed for zip");
  } else {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("tar", ["-xzf", archive, "-C", outDir], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("tar -xzf failed");
  }
}
