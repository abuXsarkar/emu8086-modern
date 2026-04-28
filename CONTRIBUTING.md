# Contributing

Thank you for considering a contribution to `emu8086-modern`. This project exists because legacy emu8086 stopped serving students well; that mission belongs to a community, not one person.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [How you can help](#how-you-can-help)
- [Development setup](#development-setup)
- [Branching and commits](#branching-and-commits)
- [Pull request checklist](#pull-request-checklist)
- [Coding standards](#coding-standards)
- [Testing](#testing)
- [Documentation contributions](#documentation-contributions)
- [Reporting bugs](#reporting-bugs)
- [Security disclosures](#security-disclosures)

---

## Code of conduct

This project adopts the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## How you can help

Especially welcome at this stage of the project:

- **Educators**: share lab manuals or sample programs you actually use with students. We need a corpus, not just the manual, to make the assembler's `emu8086` dialect honest.
- **Students**: report friction points; document what confused you about emu8086 the first time you used it.
- **Engineers**:
  - Rust: opcode implementations, flag-arithmetic tests, assembler diagnostics, Tauri shell.
  - TypeScript / React: editor features, debugger panels, device components.
  - Designers: panel layouts, icon set, dark/light themes, accessibility.
- **Translators**: UI strings (M6 onward, but you can pre-register interest).

Issues tagged [`good-first-issue`](https://github.com/abuXsarkar/emu8086-modern/labels/good-first-issue) are scoped for first-time contributors.

## Development setup

Currently a placeholder; this section becomes runnable as M0 lands.

```bash
# 1. Toolchain
rustup install stable
rustup target add wasm32-unknown-unknown
corepack enable && corepack prepare pnpm@latest --activate

# 2. Clone
git clone https://github.com/abuXsarkar/emu8086-modern.git
cd emu8086-modern

# 3. Install
pnpm install
cargo fetch

# 4. Run the dev IDE
pnpm --filter @emu8086/web dev
# → http://localhost:5173

# 5. Run all tests
cargo test --workspace
pnpm test
```

If anything in the above fails on a clean machine, please open an issue — the developer experience is itself a feature.

## Branching and commits

- `main` is the integration branch. Releases are tagged `vX.Y.Z`.
- Feature branches: `mX/short-description` (e.g. `m1/decode-shifts`).
- Bug-fix branches: `fix/short-description`.
- Docs-only branches: `docs/short-description`.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short imperative summary

Optional longer body explaining the why, if it isn't obvious from the diff.
```

`type` is one of: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`.

`scope` is usually the package name (`core`, `assembler`, `web`, `cli`, `devices`) or a doc area (`docs`, `roadmap`).

Examples:

```
feat(core): implement IMUL r/m16 with full flag semantics
fix(assembler): treat OFFSET of forward-declared label as resolved in pass 2
docs(roadmap): tighten M2 exit criteria
```

Avoid messages like `update`, `wip`, `more changes`. They will be asked to be rewritten.

## Pull request checklist

Before requesting review:

- [ ] Branch is rebased on the latest `main`.
- [ ] CI is green.
- [ ] PR description fills the template (problem, change, manual test).
- [ ] Public-API changes have a `CHANGELOG.md` entry.
- [ ] New tests cover the change.
- [ ] Lint/format clean: `cargo fmt`, `cargo clippy -- -D warnings`, `pnpm lint`.
- [ ] If UI changes: a screenshot or short clip is attached.

PRs are merged with squash-and-merge by the reviewer. The squashed commit message is the PR title; please make it useful.

## Coding standards

### Rust

- Edition 2021, MSRV pinned in `rust-toolchain.toml`.
- `#![warn(clippy::all, clippy::pedantic)]` at crate root; opt out per item with a comment explaining why.
- No `unwrap()` / `expect()` outside tests, build scripts, and `main`.
- Public items have rustdoc; doctests where they would teach a reader.
- Errors: `thiserror` for libraries, `anyhow` for binaries.

### TypeScript

- TS strict mode on (`"strict": true`).
- No `any`; use `unknown` and narrow.
- React: function components only; no class components.
- Avoid prop drilling beyond 2 levels — use Zustand or context.
- ESLint config is shared from `packages/web/.eslintrc.cjs`.

### Style

- 100-column soft limit.
- Format on save: `rustfmt`, `dprint`. CI rejects unformatted code.

### Comments

Default to no comments. Write a comment only when the *why* is non-obvious. Comments that paraphrase the code are not welcome and will be removed.

## Testing

Every feature ships with tests:

- `core` opcodes: positive test + at least one flag-edge-case test. `proptest` for arithmetic flags.
- `assembler`: at least one source program in `tests/dialects/` exercising the new feature.
- `web`: vitest unit tests for utilities; Playwright e2e for user-visible flows.

CI runs:

- `cargo test --workspace` on Linux/macOS/Windows.
- `cargo clippy -- -D warnings`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Playwright e2e on Chromium, Firefox, WebKit.

A nightly job runs `proptest` for one hour and reports any new counterexamples.

## Documentation contributions

Documentation is treated as code:

- Lives in the same repo, reviewed in the same PR pipeline.
- ADRs go in `docs/adr/`. Number them sequentially; do not delete superseded ADRs — mark them `Superseded by ADR-XXXX`.
- User-facing manual lives in `docs/manual/` (added in M7). MkDocs Material builds it.

If you spot a doc inconsistency, fixing it is welcome even without an issue.

## Reporting bugs

Use the bug-report issue template. Include:

- Browser / OS / build of `emu8086-modern`.
- The shortest program that reproduces the bug.
- Expected vs actual behavior.
- Whether the bug also reproduces in legacy emu8086 (helps us classify dialect bugs vs core bugs).

We aim to triage within 5 working days.

## Security disclosures

Please do **not** open a public issue for a security vulnerability. Follow the process in [`SECURITY.md`](SECURITY.md).
