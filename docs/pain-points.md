# Legacy emu8086 — pain points and how we address them

The legacy emu8086 (Emu8086 Inc., last meaningful release ~2010) has served two decades of computer-architecture courses. It is also the source of a long list of student and educator complaints. This document enumerates those complaints and states, for each, what `modern8086` does about them.

This is the document we will be measured against. If a student or educator points to a pain on this list and our software does not address it, that is a bug.

---

## 1. Platform and installation

| # | Pain in legacy emu8086 | Our response |
|---|---|---|
| 1.1 | Windows-only binary; runs under Wine on Linux/macOS with rendering glitches and broken keyboard input. | Browser-first IDE — runs on any modern browser, including school-managed Chromebooks and iPads. Native desktop builds via Tauri for Windows / macOS / Linux. |
| 1.2 | Installer requires Administrator on Windows; blocked by IT in many lab environments. | No install required for the web IDE. Native builds are self-contained, no admin needed. |
| 1.3 | Files saved to `Program Files` by default; lab users on shared accounts lose work. | All work persists in the browser (IndexedDB) by default. Optional save to disk, Gist, or campus storage. |
| 1.4 | Shareware nag screen and feature-locked free version. | MIT-licensed, no paywall, no nag screens, no telemetry by default. |

## 2. Editor experience

| # | Pain | Response |
|---|---|---|
| 2.1 | Tiny edit area; no syntax highlighting per token type (only one color). | Monaco editor (VS Code's engine) with full syntax highlighting, themes, multi-cursor, find/replace with regex, minimap. |
| 2.2 | No autocomplete; students mistype `MOV` and find out at assemble time. | Completions for opcodes, registers, labels, and `emu8086.inc` macros. |
| 2.3 | No inline documentation. | Hover an opcode → Intel-manual-derived summary, flag effects, encoding, examples, link to in-app reference. |
| 2.4 | No snippets for common patterns (loop, procedure, interrupt). | Built-in snippet library; users can add their own. |
| 2.5 | No format-on-save. | `dprint` formats source on save and on paste. |

## 3. Diagnostics and errors

| # | Pain | Response |
|---|---|---|
| 3.1 | Errors like `(line 23) wrong parameters` with no source context, no caret, no suggestion. | `rustc`-style diagnostics: source span with caret, plain-language reason, "did you mean…?" suggestions, link to relevant manual section. |
| 3.2 | Errors that point at the wrong line because of the legacy macro expander. | Source maps thread the original line/column through every transform; errors point at the user's source, not the expanded text. |
| 3.3 | Single error reported per assemble; user fixes one, hits the next. | Multiple errors per pass, with recovery; user fixes a batch. |
| 3.4 | No structured warnings. | Warnings vs errors are distinguished; warnings are clickable to suppress per-line with a code-action. |

## 4. Debugging

| # | Pain | Response |
|---|---|---|
| 4.1 | Step-forward only; if you step past the bug, you must restart. | Step **backward** as well, anywhere in the trace, with low latency. |
| 4.2 | Breakpoints only by absolute address; useless for symbolic programs. | Breakpoints by source line, label, or expression (e.g. `AX == 5 && CF`). |
| 4.3 | No watch expressions. | Watches over registers, flags, and memory references with addressing modes (`[BX+SI+4]`). |
| 4.4 | Memory window flickers and loses scroll position on every step. | Stable memory view; cells changed by the last step are highlighted; jump-to-pointer with one click. |
| 4.5 | No way to see "what changed" since the last step. | Per-step diff list (registers, flags, memory ranges) shown alongside the timeline. |
| 4.6 | No stack visualization beyond a memory window. | Dedicated stack panel showing frames, return addresses, saved BP, and stack growth direction. |

## 5. Devices and I/O

| # | Pain | Response |
|---|---|---|
| 5.1 | Device windows are non-resizable, low-DPI bitmaps. | Vector (SVG) device renderings with crisp scaling, dark/light themes, and large-print accessibility mode. |
| 5.2 | No way to script a device or replay an input sequence. | Devices accept an event log; sessions are deterministically replayable from the log. Used by the autograder. |
| 5.3 | Adding a new device requires modifying the closed-source program. | Plugin SDK: educators ship custom devices as a small TS+Rust package. |
| 5.4 | The "Screen" device is fixed to text mode and a hard-coded font. | Configurable text-mode size, font, palette; screen-reader announces output for visually impaired students. |

## 6. Source-control and sharing

| # | Pain | Response |
|---|---|---|
| 6.1 | No Git integration; students email `.asm` files. | Built-in load-from-Git, save-to-Gist, share-link. |
| 6.2 | No way to share a "stuck" state with an instructor. | Share-link encodes the buffer **and** initial state in a URL; recipient sees exactly what the sender sees. |
| 6.3 | No history within the editor. | Local history (per-session) and time-travel debugger together replace this need. |

## 7. Collaboration and classroom

| # | Pain | Response |
|---|---|---|
| 7.1 | Single-user only; teachers cannot demonstrate live to a class except via a projector. | Classroom mode: the teacher's session can be followed live by students (read-only or fork-to-own-buffer). |
| 7.2 | Lab manuals get stale because there is no living example library. | Curated, versioned example library shipped with the IDE; "open in IDE" buttons in the docs. |
| 7.3 | Teachers grade by hand — `.asm` files emailed in. | CLI autograder + GitHub Action + LTI 1.3 launch. JUnit-XML output integrates with most LMS gradebooks. |

## 8. Accessibility and inclusion

| # | Pain | Response |
|---|---|---|
| 8.1 | Mouse-required for many actions (no keyboard equivalents). | Full keyboard navigation; every action has a shortcut; shortcut help is searchable. |
| 8.2 | Poor color contrast in the default theme; no dark mode. | Themes meet WCAG 2.1 AA contrast minimums; dark mode default. |
| 8.3 | No screen-reader support. | ARIA labels on every panel; screen-reader-friendly representations of registers, flags, memory, and devices. |
| 8.4 | English UI only; translated lab manuals reference English-only menu items. | i18n from M6: launch with English, Spanish, Bengali; volunteers welcome for more. RTL layout supported. |
| 8.5 | Fixed UI font sizes; cannot scale up for students who need larger text. | Browser zoom + an in-app text-size slider that scales the IDE without reflow breakage. |

## 9. Performance and stability

| # | Pain | Response |
|---|---|---|
| 9.1 | Long-running programs slow to a crawl in the GUI. | Wasm core batches steps; UI receives diffs at 60 fps regardless of program length. |
| 9.2 | Crashes on certain malformed inputs. | Fuzzed continuously in CI; failure modes are diagnostic errors, never crashes. |
| 9.3 | No guard against runaway loops; only "kill the program" via the OS. | Step budget per run; configurable timeout; runaway warning with options to abort or extend. |

## 10. Documentation and learning curve

| # | Pain | Response |
|---|---|---|
| 10.1 | Help is a static, dated `.chm` file (Windows-only viewer). | Searchable in-app docs; hover and "F1 on opcode" surface the right page. |
| 10.2 | No interactive tutorials; first-time users are dropped at a blank screen. | Ten in-app tutorials covering registers → segments → addressing → stack → procedures → interrupts → devices → debugging → autograder → share-links. |
| 10.3 | Sample programs scattered across folders; not discoverable. | Examples gallery in the IDE with "open in editor" + "what does this teach?" tags. |

## 11. Build and licensing

| # | Pain | Response |
|---|---|---|
| 11.1 | Closed source; bugs cannot be fixed by the community. | MIT license; pull requests welcome; CI public. |
| 11.2 | No way for institutes to self-host. | Single Docker image runs the IDE, autograder, and share-link service entirely on a campus network. |

---

## How we will know we have actually solved these

For each row, the matching feature is gated by an end-to-end test or a documented manual verification. The acceptance criteria for releases reference rows in this table. A 1.0 release does not ship until every row above is checked off (or formally deferred with a tracked issue and a rationale).

If you experience a pain that is not on this list, please open an issue with `pain-point:` in the title.
