# @modern8086/cli-8085

Node-shim distribution of `m85`, the Intel 8085 headless runner. Installs the prebuilt native binary for your platform on `npm install` (no `cargo`, no toolchain).

```bash
npm install -g @modern8086/cli-8085
m85 run my-program.a85 --poke 2050=12H --poke 2051=34H --mem-dump 3050,1
```

For full CLI docs, see [`packages/cli-8085/README.md`](https://github.com/abuXsarkar/modern8086/tree/main/packages/cli-8085) in the source tree.

## Why the `@modern8086/` scope?

`@modern8086` is the published npm org. The 8085 CLI sits under the same scope as `@modern8086/cli` (the 8086 binary) with the `-8085` suffix on the package name to keep the two distinct. They install independently — `npm install -g @modern8086/cli` gets you `m86`, `npm install -g @modern8086/cli-8085` gets you `m85`.

## Status

**0.1.0**, fetches from the GitHub Release at the matching `m85-v0.1.0` tag.

- **Working from a clone:** the postinstall detects the in-tree workspace and skips the download. Use `cargo run -p modern8085-cli -- <args>` or `cargo install --path packages/cli-8085`.
- **`M85_SKIP_DOWNLOAD=1`:** suppresses the download.

## License

MIT. Same as the rest of the modern8086 family.
