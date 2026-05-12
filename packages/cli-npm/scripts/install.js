#!/usr/bin/env node
// `postinstall` hook: fetches the prebuilt m86 binary for the
// current platform from the GitHub Release matching this package's
// version, verifies the SHA-256 against the published manifest, and
// drops it next to bin/m86.js.
//
// Skips entirely when:
//   - M86_SKIP_DOWNLOAD=1 is set (offline / curated environment);
//   - the binary is already present and its checksum matches;
//   - we're running in a CI / test scenario where the binary is
//     copied in by some other path.
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
  process.env.M86_SKIP_DOWNLOAD === "1" ||
  process.env.npm_config_m86_skip_download === "true";

if (SKIP) {
  console.log("[m86] M86_SKIP_DOWNLOAD set — leaving binary slot empty.");
  process.exit(0);
}

// In-tree workspace install (running from the monorepo, not from
// a published tarball): the developer has the Rust source and can
// `cargo build` directly. Skip the download — the alternative is
// noisy 404s in `pnpm install` on a fresh clone.
function isInTreeWorkspace() {
  try {
    const wsCargo = readFileSync(join(root, "..", "..", "Cargo.toml"), "utf8");
    return wsCargo.includes('"packages/cli"') || wsCargo.includes("modern8086");
  } catch {
    return false;
  }
}
if (isInTreeWorkspace()) {
  // Quiet: developers running `pnpm install` for the first time
  // don't need to see a postinstall download attempt.
  process.exit(0);
}

// Map (platform, arch) → release asset name. The shape mirrors what
// the release workflow uploads. Two platforms have two arches.
const ASSET_FOR = {
  "linux-x64": "m86-linux-x86_64.tar.gz",
  "darwin-x64": "m86-macos-x86_64.tar.gz",
  "darwin-arm64": "m86-macos-aarch64.tar.gz",
  "win32-x64": "m86-windows-x86_64.zip",
};

const key = `${process.platform}-${process.arch}`;
const asset = ASSET_FOR[key];
if (!asset) {
  console.error(
    `[m86] no prebuilt binary for ${key}. ` +
      "Build from source: cargo build --release -p modern8086-cli, " +
      "then copy target/release/m86 into this package's bin/.",
  );
  // Don't crash the install — let the bin shim print a helpful error
  // if the user actually tries to run `m86`.
  process.exit(0);
}

const url = `https://github.com/abuXsarkar/modern8086/releases/download/v${version}/${asset}`;
const checksumsUrl = `https://github.com/abuXsarkar/modern8086/releases/download/v${version}/checksums.txt`;

const binName = process.platform === "win32" ? "m86.exe" : "m86";
const binPath = join(root, "bin", binName);

async function main() {
  if (existsSync(binPath)) {
    // Already installed; trust it. The CI / dev tarball workflow
    // sometimes copies the binary in before postinstall.
    process.exit(0);
  }
  mkdirSync(join(root, "bin"), { recursive: true });
  console.log(`[m86] downloading ${asset} for ${key}…`);
  const tmpFile = join(tmpdir(), asset);
  await download(url, tmpFile);
  await verifyChecksum(tmpFile, checksumsUrl, asset);
  await extract(tmpFile, binPath);
  chmodSync(binPath, 0o755);
  console.log(`[m86] installed v${version} → ${binPath}`);
}

async function download(from, to) {
  const res = await fetch(from, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`download failed: ${res.status} ${res.statusText} (${from})`);
  }
  if (!res.body) throw new Error("download had no body");
  // Cast the WebStream to a Node-friendly stream via the Buffer pipe.
  const buf = Buffer.from(await res.arrayBuffer());
  await pipeline(
    async function* () {
      yield buf;
    },
    createWriteStream(to),
  );
}

async function verifyChecksum(file, manifestUrl, assetName) {
  const res = await fetch(manifestUrl, { redirect: "follow" });
  if (!res.ok) {
    console.warn(
      `[m86] checksums.txt missing from release (${res.status}); ` +
        "skipping verification — this is OK for development releases.",
    );
    return;
  }
  const text = await res.text();
  const line = text
    .split("\n")
    .find((l) => l.trim().endsWith(`  ${assetName}`));
  if (!line) {
    console.warn(
      `[m86] no checksum line for ${assetName} in checksums.txt; ` +
        "skipping verification.",
    );
    return;
  }
  const expected = line.trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (expected !== actual) {
    throw new Error(
      `checksum mismatch for ${assetName}: expected ${expected}, got ${actual}`,
    );
  }
}

async function extract(archive, outBinPath) {
  // Both archive formats contain a single top-level binary named
  // `m86` / `m86.exe`. Use the platform's bundled tar / zip
  // tools — Node ships no native archiver and pulling one in for one
  // file is wasteful.
  const { spawnSync } = await import("node:child_process");
  const outDir = dirname(outBinPath);
  if (archive.endsWith(".tar.gz")) {
    const r = spawnSync("tar", ["-xzf", archive, "-C", outDir], {
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error("tar extraction failed");
  } else if (archive.endsWith(".zip")) {
    // Windows ships `tar.exe` since 1803; macOS / Linux likewise have
    // bsdtar handling zips. Try `tar` first; fall back to PowerShell
    // Expand-Archive only if it fails.
    let r = spawnSync("tar", ["-xf", archive, "-C", outDir], {
      stdio: "inherit",
    });
    if (r.status !== 0) {
      r = spawnSync(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -Path '${archive}' -DestinationPath '${outDir}' -Force`],
        { stdio: "inherit" },
      );
      if (r.status !== 0) throw new Error("zip extraction failed");
    }
  } else {
    throw new Error(`unknown archive extension: ${archive}`);
  }
}

main().catch((e) => {
  console.error("[m86] install failed:", e.message);
  console.error(
    "You can still run `cargo build --release -p modern8086-cli` and copy the\n" +
      "binary into node_modules/@modern8086/cli/bin/ manually.",
  );
  // Exit 0 — failing the install would break entire `npm install`
  // pipelines just because a binary download flaked.
  process.exit(0);
});
