# ADR 0001 — Technology stack

- Status: **Accepted**
- Date: 2026-04-28
- Decision-maker: maintainer
- Supersedes: —
- Superseded by: —

## Context

We are building a modern replacement for legacy emu8086. Choices made here ripple through every later decision. This ADR records the stack we are committing to at M0 and the alternatives we considered.

The constraints we are optimizing for:

1. **Determinism.** Same inputs → same outputs, byte-for-byte. Required for time-travel debugging, share-links, and autograding.
2. **Portability.** Single emulator core that runs in browsers, in Node.js for tests, as a native library, and inside an autograder runtime in CI.
3. **Pedagogical clarity.** Code we hope undergraduates will read and learn from.
4. **Contributor reach.** Languages and frameworks that many educators-who-also-code already know.
5. **Long-term maintenance with one core maintainer.** Boring tech wherever boring works.

## Decision

| Layer | Choice |
|---|---|
| Emulator core | **Rust**, compiled to `wasm32-unknown-unknown` for browsers and to a `cdylib` for native. |
| Assembler | **Rust** (same workspace). |
| Web IDE | **React 18 + TypeScript**, built with **Vite**. |
| Editor | **Monaco**. |
| Styling | **Tailwind CSS** + **shadcn/ui** primitives. |
| State | **Zustand**. |
| Native shell | **Tauri**. |
| CLI | **Rust + clap**. |
| Test runners | `cargo test`, `vitest`, `playwright`. |
| CI | **GitHub Actions**. |
| Docs site (M7) | **MkDocs Material**. |

## Rationale

### Rust for the core

- Native integer types (`u8`, `u16`) make 8086 flag arithmetic straightforward; we are not fighting JS `Number`'s 53-bit limit and silent truncation.
- Compiles cleanly to wasm with `wasm-bindgen`; bundle size is acceptable (<500 KB gzipped is in reach).
- Single source of truth for the emulator: the same crate runs in the browser IDE, in the CLI, in the autograder, and in the test harness.
- `cargo` is the build, package, and test tool; no glue scripts to maintain.
- Strong memory-safety story matters here: the autograder runs untrusted student code, and we want the bug surface in the runtime to be small.

We considered:

- **TypeScript core** — straightforward integration with the IDE, but the flag-arithmetic burden plus the autograder sandboxing question made it the worse choice.
- **C / C++ core** — many existing 8086 emulators are written in C, which would be reusable. Rejected on contributor reach (smaller pool than Rust today, especially among educators) and on safety (we explicitly run untrusted programs).
- **Zig core** — attractive for the low-level fit, but the ecosystem (especially around wasm + npm publishing) is too thin for a one-maintainer project.

### React + TypeScript + Vite for the IDE

- Largest contributor pool among the people we want contributing (educators who code).
- Monaco's most-tested integration is in React.
- Vite gives fast dev iteration and small production bundles; we have no need for SSR.

We considered:

- **Svelte** — smaller bundles, but smaller ecosystem and fewer educators ready to contribute.
- **Solid** — interesting reactivity model, but Monaco integration is rougher.
- **Plain HTML+ESM** — too much hand-rolled wiring for a project of this scope.

### Monaco editor

- Students recognize the UX from VS Code.
- The language-services API (completions, hover, diagnostics) is what we need to surface our diagnostics and instruction reference well.
- Mature and maintained.

We considered:

- **CodeMirror 6** — lighter and very capable, but completion + diagnostic ergonomics for a custom DSL favor Monaco for our use.

### Tailwind + shadcn/ui

- Speeds up UI work; "what does this button look like?" stops being a discussion.
- Themability is built in.
- shadcn/ui gives us accessible primitives (dialog, menu, popover) without taking on a heavyweight framework.

### Zustand

- Smallest state library that does the job.
- Plays well with React 18 concurrent features.
- Avoids Redux ceremony for a single-app store.

### Tauri for the desktop shell

- Reuses the entire web codebase.
- Binary size ~10 MB vs Electron's ~100 MB+; matters for users on metered networks.
- Rust-aligned with the rest of the stack.

We considered:

- **Electron** — bigger binaries, more memory, but maximum compatibility. Rejected on size and on philosophical preference.
- **Native rewrites** — too much work; the value is the web IDE.

### Rust + clap for the CLI

- Same workspace as the core; no language boundary.
- Static binary; one artifact to ship per OS.
- Easy to embed in CI pipelines.

### GitHub Actions for CI

- Repo lives on GitHub.
- Free for public repos at our scale.
- Familiar to contributors; no extra account to create.

## Consequences

Positive:

- Single Rust codebase for core / assembler / CLI; one mental model, one toolchain.
- Web and desktop IDE share 100% of UI code.
- Autograder reuses the same emulator the student saw; no "but it worked in the IDE" class of bugs.

Negative / costs:

- Maintainers must be comfortable with both Rust and TypeScript; this raises the bar for some kinds of contributions.
- wasm-bindgen API surface is ours to keep stable; breaking changes ripple through the IDE.
- Tauri toolchain churn periodically requires attention.
- Monaco bundle is heavy; we will need to tune lazy-loading for the cold-start budget.

## Alternatives considered (summary)

| Alternative | Why rejected |
|---|---|
| Pure-TS emulator | Flag-arithmetic friction; harder autograder sandboxing. |
| C core via Emscripten | Contributor reach; safety surface. |
| Svelte / Solid IDE | Smaller ecosystem; rougher Monaco integration. |
| Electron desktop | Binary size, memory footprint. |
| Redux / MobX | Overkill for our state shape. |
| Vue | Fine choice in isolation; no advantage over React for our team. |

## Follow-ups / future ADRs

- ADR-0002: Block-based ("scratch-style") view for absolute-beginner labs.
- ADR-0003: 8087 FPU support — implement, stub, or refuse.
- ADR-0004: Cycle-accurate timing as opt-in.
- ADR-0005: i18n infrastructure — ICU MessageFormat vs key/value JSON.

## References

- Roadmap: [`../../ROADMAP.md`](../../ROADMAP.md)
- Build plan: [`../../BUILD_PLAN.md`](../../BUILD_PLAN.md)
- Architecture: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
