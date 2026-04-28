# Security Policy

## Supported versions

`emu8086-modern` is pre-1.0. During this period, only the `main` branch receives security fixes. Once 1.0 ships, this table will be updated to list the supported minor versions.

| Version | Supported          |
|---------|--------------------|
| `main`  | yes                |
| < 1.0   | n/a (pre-release)  |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a suspected vulnerability. Instead:

1. Email **abu@cyberdude.com** with subject line `SECURITY: <short title>`.
2. Include:
   - A description of the issue and its impact.
   - Steps to reproduce, ideally a minimal program or URL.
   - Affected commit hash (or `main` if applicable).
   - Your name and any handle you would like credited (or that you wish to remain anonymous).
3. We acknowledge within 5 working days and provide a triage status within 10 working days.
4. We agree on a coordinated disclosure date with the reporter. The default is 90 days from acknowledgement, shorter if the issue is being actively exploited.

## Scope

In scope:

- The emulator core (`packages/core`).
- The assembler (`packages/assembler`).
- The web IDE (`packages/web`) and any first-party hosted instance.
- The CLI / autograder (`packages/cli`).
- Any first-party device implementation (`packages/devices`).
- Build and release tooling that ships artifacts to users (e.g. signing pipeline once introduced).

Out of scope:

- Third-party plugins. Report to the plugin author.
- Bugs that are not security-relevant. Use the regular bug-report template.
- Denial-of-service through clearly excessive program size or step counts beyond documented limits.

## Threat model (summary)

- The emulator is a sandbox. A hostile guest program must not be able to escape the wasm boundary, exfiltrate host data, or persist outside the IDE's virtual filesystem.
- The autograder runs untrusted student submissions. It must:
  - Bound execution time and memory.
  - Refuse host file-system access from emulated code.
  - Not interpret submission contents as host shell, JS, or SQL.
- The web IDE must not execute student-supplied JavaScript. Programs are bytes interpreted by the wasm core.
- Share-links must not enable XSS. Anything decoded from a URL fragment is treated as data, never as code.

A more detailed threat model lives in `docs/security/threat-model.md` (added in M5).

## Hardening practices

- Dependencies pinned; `cargo deny check` and `pnpm audit` run in CI.
- Wasm runtime executes guest code with strict resource limits (timeout, memory cap).
- Content Security Policy on the hosted IDE forbids inline scripts and remote script sources.
- All releases will be signed once 1.0 ships (Sigstore for binaries; npm provenance for JS packages).

## Credit

We are happy to credit reporters in release notes and on a `SECURITY.md` "Hall of fame" section once we have our first verified report. If you would prefer to remain anonymous, let us know.
