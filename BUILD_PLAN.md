# Build Plan

A practical, week-by-week plan for executing the [Roadmap](ROADMAP.md). Where the roadmap defines *what* and *when*, this document defines *how*.

This is not a marketing artifact. It is the document an incoming maintainer reads on day one to know what to do on Monday.

---

## 1. Stack decisions (locked at M0)

| Layer | Choice | Why this, not the alternative |
|---|---|---|
| CPU core | **Rust → wasm + native** | Deterministic integer math, easy ports between hosts, zero-cost abstractions. JS/TS would force us to fight `Number` to model `u8`/`u16` flag math. C/C++ would slow contributions. |
| Assembler | **Rust** (same workspace as core) | Same source-span types as core; share AST with diagnostics layer. |
| Web IDE | **React 18 + TypeScript + Vite** | Largest contributor pool among educators-who-also-code. Vite for fast iteration. |
| Editor component | **Monaco** | Same engine as VS Code; students recognize the UX. We need its rich language-services API. |
| Styling | **Tailwind + shadcn/ui** | Fast to build, easy to theme, no opinionated framework lock-in. |
| State | **Zustand** | Small surface, no boilerplate, good with React 18. Redux is overkill here. |
| Native shell | **Tauri** | One web codebase → small native binaries; Rust-aligned with our core. Electron rejected on bundle size. |
| CLI | **Rust (clap)** | Same workspace, distributed as a single static binary. |
| Test runners | `cargo test`, `vitest`, `playwright` | Standard for each ecosystem. |
| Lint | `clippy`, `eslint`, `stylelint`, `dprint` | Standard. Configured at M0 so style debates do not happen in PR review. |
| CI | **GitHub Actions** | Repo is on GitHub; matches contributor expectations. |
| Docs | **Markdown + MkDocs Material** for the user manual at M7 | Inline ADRs in repo for engineering docs. |

Open decisions (no default chosen yet) live in `docs/adr/` and the [Roadmap "Open questions"](ROADMAP.md#after-10) section.

---

## 2. Repository layout (created at M0)

```
modern8086/
├── Cargo.toml                # workspace
├── package.json              # workspace
├── pnpm-workspace.yaml
├── rust-toolchain.toml       # pinned MSRV
├── .editorconfig
├── .gitignore
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── release.yml
│   │   └── autograder-dogfood.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   └── pull_request_template.md
├── packages/
│   ├── core/        # crate emu8086-core
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── assembler/   # crate emu8086-assembler
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── devices/
│   │   ├── rust/    # crate emu8086-devices  (port-mapped I/O behaviors)
│   │   └── ts/      # @modern8086/devices       (React components)
│   ├── web/         # @modern8086/web (Vite + React)
│   │   ├── package.json
│   │   ├── index.html
│   │   └── src/
│   └── cli/         # crate modern8086-cli
│       ├── Cargo.toml
│       └── src/main.rs
├── examples/
├── tests/
│   ├── conformance/
│   ├── dialects/
│   └── fixtures/
└── docs/
    ├── pain-points.md
    ├── emu8086-compatibility.md
    ├── student-experience.md
    ├── educator-guide.md
    └── adr/
```

---

## 3. Definition of Done (per layer)

Before any PR is merged into a layer, the following must be true:

### `core` / `assembler` (Rust)

- `cargo fmt --check` clean.
- `cargo clippy --workspace --all-targets -- -D warnings` clean.
- `cargo test --workspace` green on Linux, macOS, Windows in CI.
- Public API changes documented in the crate's `CHANGELOG.md`.
- Any new opcode has at least one positive test and one flag-edge-case test.

### `web` (TypeScript)

- `pnpm typecheck` green (TS strict mode).
- `pnpm lint` clean.
- `pnpm test` green (vitest).
- For UI changes, a Playwright test covers the happy path.
- Visual regressions checked via Playwright screenshot diffs on the demo program.

### Docs

- Markdown linted (`markdownlint`).
- All internal links resolve.
- Spell-check with a project allow-list.

### Universal

- PR description fills the template (problem, change, screenshots/output, manual test).
- One reviewer approval. Two for changes that touch the public API of `core` or `assembler`.

---

## 4. Week-by-week schedule

The dates below are rolling targets. The first column is "weeks after project start" (project start = May 2026).

### M0 — Bootstrap (wks 1–2)

| Wk | Tasks |
|---|---|
| 1 | Repo init complete, all root docs written (this PR). Cargo + pnpm workspaces compile empty crates/packages. CI runs `cargo test` on 3 OSes and passes with empty tests. |
| 2 | "Hello-wasm" path: `core` exposes `add(a,b)` via `wasm-bindgen`; `web` calls it on page load and renders the result. Native `cli` builds. Issue/PR templates in place. Project board populated with M1 issues. |

### M1 — CPU core (wks 3–8)

| Wk | Tasks |
|---|---|
| 3 | Register file + FLAGS data model. `MOV` reg/reg, reg/imm. Microbenchmark target hit. |
| 4 | Memory model + segmented addressing. `MOV` mem variants. `PUSH`/`POP` + stack semantics. |
| 5 | Arithmetic group: `ADD`, `SUB`, `ADC`, `SBB`, `INC`, `DEC`, `NEG`, `CMP`. Flag tests imported. |
| 6 | Logical + shift/rotate group: `AND`, `OR`, `XOR`, `NOT`, `SHL`, `SHR`, `SAR`, `ROL`, `ROR`, `RCL`, `RCR`. Variable-count edge cases tested. |
| 7 | Control flow: `Jcc`, `LOOP`, `CALL`, `RET`, `INT`, `IRET`. Software interrupt subset (`INT 21h`/`10h`). String ops (`MOVS`, `CMPS`, `SCAS`, `LODS`, `STOS`) with `REP`. |
| 8 | Snapshots + step-back. Conformance suite reaches 100% on all targeted opcodes. |

### M2 — Assembler (wks 9–12)

| Wk | Tasks |
|---|---|
| 9 | Lexer + parser for arithmetic expressions and operands. `db/dw/dd`, `EQU`, `DUP`, labels. |
| 10 | Two-pass codegen for all ISA forms; source map; size inference. `OFFSET`, `SEG`, `PTR`. |
| 11 | `emu8086.inc` macro pack expansion; `org 100h` template; `.MODEL`, `.STACK`, `.DATA`, `.CODE`. |
| 12 | Diagnostics polish; corpus of 50 lab programs green; `nasm` dialect mode. |

### M3 — Web IDE alpha (wks 13–16)

| Wk | Tasks |
|---|---|
| 13 | Vite app shell, layout system, dark/light themes. Monaco wired up with placeholder language def. |
| 14 | 8086-asm language def: tokens, completions, hover for opcodes, snippets. Run/step/pause/reset wired to wasm core. |
| 15 | Panels: registers, flags, memory, stack, output. Source-line highlighting. |
| 16 | IndexedDB autosave. Polish, bug bash, perf budget verification. |

### M4 — Time-travel + devices (wks 17–20)

| Wk | Tasks |
|---|---|
| 17 | Step-back UI (timeline scrubber). Snapshot tuning. |
| 18 | Conditional breakpoints, watch expressions, memory diff highlighting. |
| 19 | Devices: traffic light, 7-seg, LED matrix. |
| 20 | Devices: printer, screen, keyboard. Plugin SDK draft. |

### M5 — Educator features (wks 21–24)

| Wk | Tasks |
|---|---|
| 21 | Share-link (URL fragment encoding + Gist save/load). |
| 22 | Classroom mode (Yjs follower mode). Auth shim (anonymous IDs). |
| 23 | CLI autograder + YAML spec + JUnit XML output. |
| 24 | GitHub Action; LTI 1.3 launch with Moodle + Canvas worked examples. |

### M6 — Beta + pilot (wks 25–28)

| Wk | Tasks |
|---|---|
| 25 | Self-host Docker image. Pilot setup with one course. |
| 26 | A11y audit (internal); fixes. NVDA + VoiceOver passes. |
| 27 | i18n extraction; ES + BN translations. |
| 28 | External a11y audit; fix critical findings; freeze for M7. |

### M7 — 1.0 (wks 29–32)

| Wk | Tasks |
|---|---|
| 29 | Tauri desktop builds for 3 OSes. Plugin SDK 1.0. |
| 30 | User manual + 10 in-app tutorials. |
| 31 | Release engineering: signing, notarization (macOS), Windows code-signing, Linux AppImage. |
| 32 | Final QA, tag `v1.0.0`, GitHub release with artifacts, announcement. |

---

## 5. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Flag computation bugs missed by tests until students hit them | Medium | High | Use Intel reference vectors; `proptest` runs in CI nightly; treat flag bugs as P0. |
| R2 | emu8086 dialect has undocumented behaviors needed by some lab manuals | High | Medium | Build dialect against a real corpus, not the manual; call for educator contributions early. |
| R3 | Wasm performance not enough for "run" of long programs | Low | Medium | Batch steps inside wasm; profile in M1; optimization pass in M3. Acceptable threshold: 10 M steps under 10 s. |
| R4 | Tauri toolchain churn | Medium | Low | Keep desktop build behind a feature flag; web is the primary surface. |
| R5 | Single maintainer burnout | High | High | Document everything; recruit at least 2 co-maintainers by M3; protect M1's slip date over M0's velocity. |
| R6 | Pilot institute pulls out at M6 | Medium | High | Line up two pilot courses, not one; the second is fallback. Pilot lead-time announced at M0. |
| R7 | Accessibility findings late in M6 force scope cuts | Medium | Medium | Internal a11y review every milestone, not only M6. |
| R8 | Time-travel snapshots blow memory budget | Low | High | Snapshot interval auto-tunes against memory pressure; cap recorded events; warn user instead of OOM. |
| R9 | Trademark / IP question about "emu8086" name | Medium | Medium | Trademark review at M2. Fallback name reserved (`asm8086.app`). Project name is clearly distinct (`modern8086`) and clean-room (see README acknowledgement). |

---

## 6. Quality gates that block a release

A release tag is not cut unless **all** of the following are true:

1. CI green on the release commit on Linux + macOS + Windows.
2. `cargo test` and Playwright suites green for 3 consecutive runs.
3. No open P0 issues. P1 count ≤ 5 and each has a comment with planned-fix milestone.
4. CHANGELOG entry written and reviewed.
5. Hosted demo deployed and smoke-tested by a human (not bot).
6. SECURITY.md disclosure window is empty (no embargoed advisories).
7. License audit (`cargo deny check licenses`) passes.

---

## 7. How to run the build locally (target state)

```bash
# Prereqs: Rust stable + wasm32 target, Node 20+, pnpm 9+
rustup target add wasm32-unknown-unknown
corepack enable && corepack prepare pnpm@latest --activate

# Install everything
pnpm install
cargo fetch

# Run the IDE in dev mode
pnpm --filter @modern8086/web dev

# Run unit + integration tests
cargo test --workspace
pnpm test

# Build release artifacts
pnpm --filter @modern8086/web build
cargo build --release -p modern8086-cli
pnpm --filter @modern8086/web tauri build
```

Until M0 is complete these commands are aspirational; the placeholder skeleton in this commit makes most of them runnable but no-op.

---

## 8. How to ship work into this plan

1. Open an issue against the milestone you are targeting.
2. Get a 👍 from the maintainer (or self-assign if you are the maintainer).
3. Branch off `main` as `mX/your-feature`.
4. Implement; keep PRs under ~400 lines of diff where possible.
5. Fill the PR template; ensure CI is green.
6. Reviewer merges with squash-and-merge; the merge commit message is the PR title.

The plan exists to make this loop fast, not to slow it down. If a step here is in your way, file an issue and propose a change.
