# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting with `1.0.0`.

## [Unreleased]

### Added

- Initial documentation set: `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `BUILD_PLAN.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- Architecture Decision Record `0001` (technology stack).
- Detailed pain-point comparison vs legacy emu8086.
- Compatibility matrix for the `emu8086` and `nasm` assembler dialects.
- Educator-adoption guide and student-experience principles.
- Monorepo skeleton: `packages/{core,assembler,devices/{rust,ts},web,cli}`.
- Cargo workspace + pnpm workspace configuration.
- GitHub Actions CI: Rust on Linux/macOS/Windows, web build, markdown lint.
- Issue templates (bug report, feature request) and pull-request template.
- Editor and formatter configuration: `.editorconfig`, `dprint.json`.
