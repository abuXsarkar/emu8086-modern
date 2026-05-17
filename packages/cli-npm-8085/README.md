# @modern8085/cli

Node-shim distribution of `m85`, the Intel 8085 headless runner. Installs the prebuilt native binary for your platform on `npm install` (no `cargo`, no toolchain).

```bash
npm install -g @modern8085/cli
m85 run my-program.a85 --poke 2050=12H --poke 2051=34H --mem-dump 3050,1
```

For full CLI docs, see [`packages/cli-8085/README.md`](https://github.com/abuXsarkar/modern8086/tree/main/packages/cli-8085) in the source tree.

## Status

**Pre-release (0.1.0).** No GitHub Release artifacts are published yet, so the postinstall download step is currently inert — the package layout is in place so we can flip the switch as soon as a tagged build exists. In the meantime:

- **Working from a clone:** the postinstall detects the in-tree workspace and skips the download. Use `cargo run -p modern8085-cli -- <args>` or `cargo install --path packages/cli-8085`.
- **`M85_SKIP_DOWNLOAD=1`:** suppresses the download even when published.

## License

MIT. Same as the rest of the modern8086 family.
