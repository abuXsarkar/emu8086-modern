# @emu8086/cli

The native `emu8086` CLI from
[`emu8086-modern`](https://github.com/abuXsarkar/emu8086-modern),
shipped as an npm package for `npm install -g @emu8086/cli`. The
package itself is a tiny Node shim; on install it downloads the
prebuilt binary for your platform from the matching GitHub
Release, verifies its SHA-256, and drops it next to the shim.

## Install

```bash
npm install -g @emu8086/cli
```

That's it. The `emu8086` executable is now on your `PATH`.

```bash
emu8086 --help
emu8086 run-asm examples/hello.asm
emu8086 grade spec.yml submission.asm
```

## Supported platforms

| Platform | Binary |
|---|---|
| Linux x86_64 | `emu8086-linux-x86_64.tar.gz` |
| macOS Intel | `emu8086-macos-x86_64.tar.gz` |
| macOS Apple Silicon | `emu8086-macos-aarch64.tar.gz` |
| Windows x86_64 | `emu8086-windows-x86_64.zip` |

For other platforms — including Linux ARM — clone the repo and
`cargo build --release -p emu8086-cli`; drop the resulting binary
into `node_modules/@emu8086/cli/bin/`.

## Offline / air-gapped installs

Set `EMU8086_SKIP_DOWNLOAD=1` before `npm install` to skip the
download step. Then place the binary at
`node_modules/@emu8086/cli/bin/emu8086` (or `emu8086.exe` on
Windows) manually.

## Why a Node shim?

The same CLI ships standalone for users who already have
`cargo install` workflows. The npm wrapper exists for users whose
build environment is Node-centric (most JavaScript shops; CI runners
that already have Node installed) — `npm install -g` is one
command and works on three OSes.

## Full project

The CLI, web IDE, classroom service, plugin SDK, and desktop shell
all live in the same monorepo:
[`github.com/abuXsarkar/emu8086-modern`](https://github.com/abuXsarkar/emu8086-modern).

MIT licensed.
