# Educator guide

A practical guide for instructors and institutes evaluating `emu8086-modern` as a replacement for legacy emu8086 in undergraduate computer-architecture courses.

This document is written for the person who has to decide *whether* to adopt the tool, and for the person who has to *make it work* on the first day of class.

## Audience

- Course coordinators choosing teaching tools.
- Lab instructors running weekly sessions.
- IT staff who must deploy something on lab machines.
- TAs grading assignments.

## Why switch from legacy emu8086

Short list — the long list is in [`pain-points.md`](pain-points.md):

1. **Cross-platform.** Works on Linux and macOS labs without Wine. Works on Chromebooks.
2. **Free and open.** No paid version, no nag screens, MIT license.
3. **Better diagnostics.** Errors are actionable, not cryptic.
4. **Autograding.** Headless CLI plus GitHub Action plus YAML test specs replace email-and-eyeball grading.
5. **Source-compatible.** Existing labs in `emu8086.inc` style keep working.
6. **Self-hostable.** A single Docker image runs the IDE, share-link service, and grader on a campus network.
7. **Accessible.** WCAG 2.1 AA target. RTL and i18n.

## Adoption paths

### Path A — Hosted (zero-infrastructure)

For institutes that can let students load `https://emu8086.app` (or the chosen hosted URL).

- Students: open the URL.
- Instructors: same.
- IT: nothing to install.
- Sharing: students share `?gist=…` URLs.

### Path B — Self-hosted

For institutes that must keep traffic inside the campus network.

```bash
docker pull ghcr.io/abuxsarkar/emu8086-modern:latest
docker run -p 8080:8080 ghcr.io/abuxsarkar/emu8086-modern:latest
# Open http://localhost:8080 from any campus machine.
```

The image bundles the IDE, share-link service, and autograder. No outbound internet required at runtime.

### Path C — Native desktop

For teachers who want a Windows/macOS/Linux app for offline labs.

- Download the Tauri build for the OS in question.
- Run. No installer required on Linux/macOS; a one-click installer on Windows.

The three paths interoperate: a share-link generated on the hosted instance opens correctly in the desktop app, and vice versa.

## A typical course term

### Week 0 — Setup

- Decide adoption path (A / B / C).
- Run a 30-minute "tour" with TAs to show the IDE, time-travel, and autograder.
- Optional: import existing lab manuals into the example library so students can open them with one click.

### Week 1 — First contact

- Student opens the IDE.
- Tutorial 1 ("Registers and `mov`") covers the first lecture's content.
- First lab problem published as a share-link.

### Week N — Assignment

- Instructor writes an assignment as a YAML spec (template provided).
- Pushes the spec to a GitHub Classroom assignment template.
- Students fork; submit by pushing.
- The autograder's GitHub Action runs on each push and writes a check.
- Instructor reviews edge cases (style, comments) by hand.

### End of term

- Export anonymized class metrics (assignment pass rates, common error messages, time-on-task).
- Use the report to refine next term's labs.

## Curriculum portability

Most existing emu8086 lab manuals will run unchanged. For the rare divergences (see [`emu8086-compatibility.md`](emu8086-compatibility.md)), we provide a "compat report" command:

```bash
emu8086 compat-report ./labs/
```

This walks a directory of `.asm` files and prints any lines that will trigger warnings or errors under our `emu8086` dialect, with suggested edits. It is fast (1000 files in <5 seconds on a laptop) and idempotent.

## Autograder spec — quick reference

```yaml
# assignment.yml
name: "Lab 3 — find max in array"
timeout_ms: 5000
max_steps: 1_000_000
include_dialect: emu8086

cases:
  - name: "ascending [1..5]"
    setup:
      memory:
        "DS:0100": [1, 2, 3, 4, 5]
        "DS:0200": [5]   # length
    expect:
      registers:
        AX: 5
      flags:
        ZF: 0

  - name: "all equal"
    setup:
      memory:
        "DS:0100": [7, 7, 7, 7, 7]
        "DS:0200": [5]
    expect:
      registers:
        AX: 7

  - name: "single element"
    setup:
      memory:
        "DS:0100": [42]
        "DS:0200": [1]
    expect:
      registers:
        AX: 42

scoring:
  per_case: 1
  total: 3
```

A spec is a portable artifact; instructors share specs across institutes the same way they share problem statements.

## LMS integration

- **GitHub Classroom**: a published Action runs the autograder on each push and writes a check; scores appear in the classroom dashboard.
- **Moodle / Canvas / Blackboard**: LTI 1.3 launch from an assignment item. The launch carries the student's identity; the IDE returns a numeric score on submission.
- **Plain CSV**: the autograder writes `results.csv` for instructors who prefer to import grades by hand.

Examples for each integration are in `examples/lms/`.

## Faculty checklist

Before the term begins:

- [ ] Adoption path chosen (A / B / C).
- [ ] One TA has run through tutorials 1–10.
- [ ] One existing lab has been ported and verified end-to-end.
- [ ] Autograder spec template exists for the course's first assignment.
- [ ] Accessibility plan checked against your institute's standard (we target WCAG 2.1 AA).
- [ ] Backup plan in case of platform issue (we recommend running one assignment under both legacy emu8086 and `emu8086-modern` in week 1 to build confidence).

## Support and feedback

- Bugs / feature requests: GitHub issues on this repo.
- General questions: GitHub Discussions (after M0).
- Direct contact for institute pilots: **abu@cyberdude.com**.

We treat institute feedback as the highest-priority signal in the project. A reproducible problem from a pilot course beats a popular feature request from anywhere else.

## What we do not promise

- We do not promise feature parity with legacy emu8086 on day one. We do promise that all listed pain points will be addressed before 1.0 (see [`pain-points.md`](pain-points.md)) and that lab-manual compatibility will be maintained.
- We do not promise long-term hosted availability for free. The MIT license guarantees you can self-host forever; the hosted instance is best-effort during pre-1.0.
- We do not promise responsiveness from a 24/7 commercial team. This is an open project. Pilots get prioritized response.
