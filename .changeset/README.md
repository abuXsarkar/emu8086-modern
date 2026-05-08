# Changeset fragments

Each pull request that ships a user-visible change drops a single Markdown file into this directory describing what changed. At release time the maintainer collates every file in this directory into `CHANGELOG.md`'s `## [Unreleased]` section and deletes the fragments.

## Why this exists

Multiple PRs in flight against the same repository all want to add their entry at the top of `CHANGELOG.md`'s `### Added` list. Every one of those PRs conflicts with every other on the *same single line* — even when the PRs touch entirely different code.

A directory of one-PR-per-file fragments solves this cleanly: two PRs adding new files in the same directory don't conflict in git's eyes (different paths), and the collation step runs once at release rather than on every merge.

## How to add an entry

1. Pick a short slug describing the change. Use kebab-case. Examples: `int10-video`, `single-quote-strings`, `lab-port-aliases`.

2. Create `.changeset/<slug>.md` with a single bullet and no surrounding header:

   ```markdown
   - **Short title (bold)** — what changed, why, and what to look at. One paragraph; same length and voice as existing CHANGELOG entries.
   ```

3. **Do not edit `CHANGELOG.md` directly in your PR.** That file only changes when the maintainer collates fragments at release time.

## Collation

Run from the repo root:

```bash
tools/collate-changeset.sh
```

The script:

1. Reads every `.changeset/*.md` (excluding this README).
2. Inserts each file's body at the top of `CHANGELOG.md`'s `### Added (post-handoff)` list, in alphabetical order by filename.
3. Removes the fragment files in the same commit.

The maintainer runs the script once per release (or whenever they want to collate pending entries) and commits the result. PR authors don't run it.

## Naming conventions

- `kebab-case-slug.md` — descriptive, not date-stamped (the file's git-blame timestamp is the date)
- Don't prefix with PR number — the number isn't known until the PR is opened, and it's not useful in the eventual changelog

## What goes in the file

Just the bullet and its body. Don't include any header (the collator adds the structure). Don't end with a trailing blank line.

```markdown
- **`MOV r16, r16` shortcut form**. The encoder now emits the 1-byte
  `89 /r` form when both operands are 16-bit registers, matching what
  legacy emu8086 produces. Drops one byte from every same-sized
  register move; previously we always emitted the 3-byte mod-r/m
  form. New unit test checks `mov ax, bx` → `89 D8`.
```
