# @modern8086/cli

The native `m86` CLI from
[`modern8086`](https://github.com/abuXsarkar/modern8086),
shipped as an npm package for `npm install -g @modern8086/cli`. The
package itself is a tiny Node shim; on install it downloads the
prebuilt binary for your platform from the matching GitHub
Release, verifies its SHA-256, and drops it next to the shim.

## Install

```bash
npm install -g @modern8086/cli
```

That's it. The `m86` executable is now on your `PATH`.

```bash
m86 --help
m86 run-asm examples/hello.asm
m86 grade spec.yml submission.asm
```

## Supported platforms

| Platform | Binary |
|---|---|
| Linux x86_64 | `m86-linux-x86_64.tar.gz` |
| macOS Intel | `m86-macos-x86_64.tar.gz` |
| macOS Apple Silicon | `m86-macos-aarch64.tar.gz` |
| Windows x86_64 | `m86-windows-x86_64.zip` |

For other platforms — including Linux ARM — clone the repo and
`cargo build --release -p modern8086-cli`; drop the resulting binary
into `node_modules/@modern8086/cli/bin/`.

## Offline / air-gapped installs

Set `M86_SKIP_DOWNLOAD=1` before `npm install` to skip the
download step. Then place the binary at
`node_modules/@modern8086/cli/bin/m86` (or `m86.exe` on
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
[`github.com/abuXsarkar/modern8086`](https://github.com/abuXsarkar/modern8086).

MIT licensed.
