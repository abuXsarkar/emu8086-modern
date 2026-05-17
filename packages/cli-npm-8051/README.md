# @modern8086/cli-8051

Node-shim distribution of `m51`, the Intel 8051 headless runner. Installs the prebuilt native binary for your platform on `npm install` (no `cargo`, no toolchain).

```bash
npm install -g @modern8086/cli-8051
m51 run my-program.a85 --poke 2050=12H --poke 2051=34H --mem-dump 3050,1
```

For full CLI docs, see [`packages/cli-8051/README.md`](https://github.com/abuXsarkar/modern8086/tree/main/packages/cli-8051) in the source tree.

## Why the `@modern8086/` scope?

`@modern8086` is the published npm org. The 8051 CLI sits under the same scope as `@modern8086/cli` (the 8086 binary) with the `-8051` suffix on the package name to keep the two distinct. They install independently — `npm install -g @modern8086/cli` gets you `m86`, `npm install -g @modern8086/cli-8051` gets you `m51`.

## Status

**0.1.0**, fetches from the GitHub Release at the matching `m51-v0.1.0` tag.

- **Working from a clone:** the postinstall detects the in-tree workspace and skips the download. Use `cargo run -p modern8051-cli -- <args>` or `cargo install --path packages/cli-8051`.
- **`M51_SKIP_DOWNLOAD=1`:** suppresses the download.

## License

MIT. Same as the rest of the modern8086 family.
