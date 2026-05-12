# modern8086-cli

Headless runner and autograder. Distributed as a single static binary `emu8086`.

Subcommands (filled in milestone-by-milestone):

- `version` — print core version (M0).
- `assemble` — assemble a source file (M2).
- `run` — run an assembled image (M1).
- `trace` — emit a JSON execution trace (M1).
- `grade` — run a YAML autograder spec against a submission (M5).
- `compat-report` — walk a directory and report compatibility issues (M2).

Status: **skeleton (M0)**. Subcommand wiring only.
