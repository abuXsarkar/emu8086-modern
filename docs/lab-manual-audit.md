# Lab manual compatibility audit

This document records what real 8086 microprocessor lab manuals expect of an emulator+assembler, what `modern8086` provides today, and what is still missing. Each gap is cited back to the manual and the specific lab program that exposes it, so a future contributor can re-run the same audit (or extend it with more manuals) and reproduce the verdict.

The document was opened against commit `main@e6ef73c`, audited 2026-05-08. The "implemented" column reflects the code on that commit. As gaps close, this document is updated in the same PR that closes them — see the Tracker section.

## How the manuals were sourced

A public web search on 2026-05-08 for `8086 lab manual filetype:pdf` and `microprocessor lab manual` returned a long tail of institute-hosted PDFs. Four were selected based on diversity of programs (cover both software-only and 8255-PPI interfacing labs), public reachability (no login wall), and span of difficulty (from short ALPs to 30-program manuals).

| ID | Source | URL | Accessed | Scope |
|---|---|---|---|---|
| **M1** | Hashemite University, Eng. Khader & Al-shaer | <https://elcom-team.com/Subjects/Microprocessors%20Lab/Manuals/%D9%85%D8%A7%D9%86%D9%8A%D9%88%D8%A7%D9%84.pdf> | 2026-05-08 | 9 experiments on the MTS-8088 trainer kit. Mix of software ALPs, INT 10h video, INT 33h mouse, INT 21h file I/O, 8255 PPI interfacing. |
| **M2** | Gopalan College of Engineering & Management (10ECL68) | <https://www.gopalancolleges.com/gcem/course-material/ece/manuals/sem-VI/Microprocessor-lab-manual-10ECL68.pdf> | 2026-05-08 | ~30 numbered ALPs across data move, arithmetic+BCD, bit ops, arrays/sort, strings, DOS I/O, plus 8255-based 7-segment / stepper / 4×4 keyboard interfacing. The most program-dense of the four. |
| **M3** | Sri Indu College of Engineering & Technology | <https://sriindu.ac.in/wp-content/uploads/2022/07/microprocessors-and-microcontrollers-lab-file.pdf> | 2026-05-08 | Mostly 8051 content; the 8086 portion is ~6 ALPs plus an 8255 program. Useful as a "minimal subset" reference. |
| **M4** | BMS Institute of Technology, 15CSL48 (Shankar) | <https://shankarrajagopal.github.io/labs/15CSL48_Microprocessor_Lab_Manual_Shankar_Software.pdf> | 2026-05-08 | 5 software-only programs: binary search, sort, string reverse, recursive nCr, real-time-clock display via INT 21h AH=2Ch + INT 10h. |

Each PDF was decoded with `pypdf` and scanned for instruction mnemonics, directives, expression operators, interrupt subfunctions, and I/O port addresses. Hits were cross-referenced against:

- `packages/assembler/src/lexer.rs` — token set
- `packages/assembler/src/parser.rs` — operand syntax, directive handling
- `packages/assembler/src/encode.rs` — instruction encoding tables
- `packages/assembler/src/preprocess.rs` — macro expansion, no-op directives
- `packages/core/src/cpu.rs` — interrupt handlers, port I/O routing

## Compatibility verdict at this commit

**Programs runnable as written, no source modification:**

| Manual | Programs runnable | Programs total | Main blockers |
|---|---|---|---|
| M1 Hashemite | ~22% | 9 experiments (each multi-program) | OFFSET, `$`, INT 10h, INT 33h, 8255 ports |
| M2 Gopalan | ~55% | ~30 ALPs | OFFSET, INT 21h AH=0Ah, 8255 ports |
| M3 Sri Indu | ~70% | ~6 ALPs (8086) + 1 PPI program | 8255 ports |
| M4 BMSIT | ~60% | 5 programs | OFFSET, INT 21h AH=2Ch, INT 10h |

Weighted across all four manuals: **~45% of programs run as written today.** Closing the assembler-side blockers (PRs 1, 4) lifts that to ~70%. Adding the interrupt blockers (PRs 2, 3) lifts to ~85%. The last 10–15% is hardware-port aliasing for the 8255 interfacing labs (PR 8).

These percentages are estimates from manual inspection of program listings, not from a CI test corpus. PR 0 (below) builds the test corpus that turns these into measurements.

## Gaps — full list, with citations

Severity legend: **B** = blocker (a typical lab program will not assemble or will not run), **M** = major (workaround possible, but every manual using that feature uses it heavily), **m** = minor (rare, often library boilerplate).

Each gap has a stable ID (`GAP-NNN`) so PR commits can reference it.

### Assembler — instructions

| ID | Item | Sev | Cited in | Suggested PR |
|---|---|---|---|---|
| GAP-001 | `LDS` / `LES` (load far pointer DS:r16 / ES:r16) | M | M4 mnemonic dump (file/far-pointer programs) | PR 5 |
| GAP-002 | `INT 3` one-byte form (opcode `CC`, vs `CD 03`) | m | M3 mnemonic list | PR 6 |
| GAP-003 | `WAIT`, `LOCK`, `ESC` prefix bytes | m | All manuals (listed, never executed) | PR 6 |
| GAP-004 | `PUSHA` / `POPA` (80186+, not 8086) | — | M2 prose | not applicable — out of architecture scope |

### Assembler — directives & pseudo-ops

| ID | Item | Sev | Cited in | Suggested PR |
|---|---|---|---|---|
| GAP-010 | `OFFSET label` operator | B | M1, M2, M4: every `mov dx, OFFSET msg ; AH=09h ; INT 21h` print idiom | PR 1 |
| GAP-011 | `$` token (current location counter) and `$-label` expressions | B | M1, M2, M4: `LEN EQU $-MSG` pattern | PR 1 |
| GAP-012 | `EQU` with forward references and full constant expressions | B | All four — verify; partly works today | PR 1 |
| GAP-013 | `SEGMENT … ENDS` full-segment form | B | M2, M3 (M3 uses *only* this form) | PR 4 |
| GAP-014 | `BYTE PTR` / `WORD PTR` outside brackets (`INC BYTE PTR var`) | M | M2 BCD programs | PR 5 |
| GAP-015 | `PUBLIC` / `EXTRN` / `EXTERN` lex-and-drop | M | M1 Experiment 4 (multi-file library lab), M4 | PR 4 |
| GAP-016 | `LABEL` directive (`name LABEL BYTE`) | M | M1, M2, M4 | PR 4 |
| GAP-017 | `STRUC` / `ENDS` (record-type) skeleton | M | M1, M2, M4 | PR 4 |
| GAP-018 | `IF` / `ELSE` / `ENDIF` conditional assembly | m | Library macros in M1, M2, M4 | PR 4 (lex-and-drop) |
| GAP-019 | `DQ` (8-byte) and `DT` (10-byte) data | m | M2 (one BCD program) | PR 5 |
| GAP-020 | `GROUP` directive | m | M1, M3 | PR 4 (lex-and-drop) |
| GAP-021 | `INVOKE` with arguments (no-arg form already works) | m | M1 (calls into library) | PR 4 |

### Assembler — expression operators

| ID | Item | Sev | Cited in | Suggested PR |
|---|---|---|---|---|
| GAP-030 | `/` and `%` (`MOD`) operators in EQU expressions | B | M2: `LEN EQU SIZE/2`-style sizing | PR 1 |
| GAP-031 | `SEG` operator | M | M1, M2, M3 | PR 4 |
| GAP-032 | `TYPE` / `LENGTH` / `SIZE` / `LENGTHOF` operators | M | M1, M2, M4 | PR 4 |
| GAP-033 | Hex literal without `0` prefix or `H` suffix (`MOV DX, FF12`) | M | M1 stepper program | PR 1 (clear "did you mean `0FF12H`?" diagnostic) |
| GAP-034 | `<<`, `>>` shift operators in expressions | m | M4 library boilerplate | PR 5 |
| GAP-035 | `&`, `\|`, `^`, `~` bitwise operators in expressions | m | M4 | PR 5 |

### CPU — INT 21h DOS subfunctions (currently support: 01h, 02h, 06h, 09h, 00h, 4Ch)

| ID | Subfn | Description | Sev | Cited in | Suggested PR |
|---|---|---|---|---|---|
| GAP-100 | `AH=0Ah` | Buffered keyboard input | B | M2 program 7.2 (dedicated ALP), referenced in M4 | PR 2 |
| GAP-101 | `AH=2Ch` | Get system time (CH:CL=h:m, DH:DL=s:hundredths) | B | M4 program 5 (RTC display) | PR 2 |
| GAP-102 | `AH=2Ah` | Get system date | M | M4 | PR 2 |
| GAP-103 | `AH=08h` | Read char without echo | M | M2 (interactive programs) | PR 2 |
| GAP-104 | `AH=3Ch` | Create file | M | M1 Experiment 5, M4 | PR 7 |
| GAP-105 | `AH=3Dh` | Open file | M | M1 Experiment 5 | PR 7 |
| GAP-106 | `AH=3Eh` | Close file | M | M1 Experiment 5 | PR 7 |
| GAP-107 | `AH=3Fh` | Read from file | M | M1 Experiment 5 | PR 7 |
| GAP-108 | `AH=40h` | Write to file | M | M1 Experiment 5 | PR 7 |
| GAP-109 | `AH=41h` | Delete file | M | M1 Experiment 5 | PR 7 |
| GAP-110 | `AH=05h` | Print character to LPT | m | M1 (printing) | PR 6 |
| GAP-111 | `AH=0Bh` | Check stdin status | m | M1 | PR 6 |
| GAP-112 | `AH=0Ch` | Flush input + read | m | M1 | PR 6 |
| GAP-113 | `AH=0Dh` | Disk reset | m | M1 | PR 6 (no-op stub) |
| GAP-114 | `AH=30h` | Get DOS version | m | M1, M4 | PR 6 (return DOS 3.30 stub) |
| GAP-115 | `AH=2Bh` | Set system date | m | M4 | PR 6 (no-op stub) |
| GAP-116 | `AH=1Ah` | Set DTA address | m | M1 (uses with file ops) | PR 7 (with file I/O) |

### CPU — INT 10h video (currently: none)

| ID | Subfn | Description | Sev | Cited in | Suggested PR |
|---|---|---|---|---|---|
| GAP-200 | `AH=00h` | Set video mode | B | M1, M4 program 5 | PR 3 |
| GAP-201 | `AH=0Fh` | Get current video mode | B | M4 program 5, M1 | PR 3 |
| GAP-202 | `AH=02h` | Set cursor position | B | M1 entire Experiment 6 | PR 3 |
| GAP-203 | `AH=06h` / `07h` | Scroll up / down (incl. clear-screen idiom) | M | M1 (every program) | PR 3 |
| GAP-204 | `AH=09h` | Write char with attribute | M | M1 | PR 3 |
| GAP-205 | `AH=0Ah` | Write char (current attr) | M | M1 | PR 3 |
| GAP-206 | `AH=0Eh` | Teletype write | M | M1, M4 | PR 3 |
| GAP-207 | `AH=03h` | Get cursor position and size | M | M1 | PR 3 |
| GAP-208 | `AH=0Ch` / `0Dh` | Write / read pixel | M | M1 Experiment 6 (mouse-paint) | PR 3 |

### CPU — other interrupts

| ID | Item | Sev | Cited in | Suggested PR |
|---|---|---|---|---|
| GAP-300 | INT 33h `AH=00..03` (mouse init/show/hide/poll) | M | M1 Experiment 6 (4 INT 33h call sites) | PR 6 |
| GAP-301 | INT 16h `AH=02h` (shift state) | m | M1 | PR 6 |
| GAP-302 | INT 14h (serial), INT 17h (parallel/printer) | m | None directly (mentioned in M1 prose) | PR 6 (stub) |
| GAP-303 | INT 25h / 26h (absolute disk read/write) | m | None directly | PR 6 (stub) |

### Hardware — I/O ports

The four manuals assume 8255 PPI hardware-trainer port maps that do not match emu8086's port set or ours. The current `modern8086` ports were chosen to match legacy emu8086 (e.g. port 4 = traffic light, port 199 = 7-seg) for our own examples; the manuals' programs will not drive our virtual peripherals as written.

| ID | Item | Sev | Cited in | Suggested PR |
|---|---|---|---|---|
| GAP-400 | 8255 PPI port aliasing in general | B | M1, M2, M3 | PR 8 |
| GAP-401 | M1 ports `0FF10H` / `0FF11H` / `0FF12H` / `0FF13H` (PA / PB / PC / Control Reg) | M | M1 Experiments 7–9 | PR 8 |
| GAP-402 | M2 ports `0D400H` / `0D402H`, `0E800H` / `0E802H` (variant kits) | M | M2 Part B 8.1–8.4 | PR 8 |
| GAP-403 | M3 ports `0FFC0H` / `0FFC2H` / `0FFC4H` / `0FFC6H` | M | M3 8255 program | PR 8 |

PR 8 has a design call to make:

- **Option A:** route well-known PPI addresses to existing virtual peripherals at the emulator level (invisible to the student, the manual's source runs unchanged).
- **Option B:** ship `mts8088.inc` / `gopalan.inc` include files that `EQU` the manual's port names to our native ports. Students must add `INCLUDE "mts8088.inc"`. More honest about what's emulated, but the source no longer matches the printed manual byte-for-byte.

Recommendation in PR 8: do A for the most common 8255 control-word patterns (the "all output" / "PA in, PB out" cases), with a fallback include file for unusual layouts.

## PR plan

Eight PRs to close every gap above. No item deferred indefinitely; every minor item lands in PR 6 or later, but each is named in this table so it cannot be dropped.

| PR | Title | Closes | Dependencies | Compat lift |
|---|---|---|---|---|
| **PR 0** | `tests/lab-corpus/`: ingest small subsets of the four manuals as a regression corpus | (none — establishes measurement) | none | enables CI to track lift |
| **PR 1** | `feat(asm): OFFSET, $, /, %, hex-without-0 diagnostic` | GAP-010, 011, 012, 030, 033 | none | +27 pts |
| **PR 2** | `feat(cpu): INT 21h AH=08h, 0Ah, 2Ah, 2Ch` | GAP-100, 101, 102, 103 | none | +10 pts |
| **PR 3** | `feat(cpu): INT 10h video subset (9 subfunctions) + text-mode video model` | GAP-200..208 | extends existing video buffer | +8 pts |
| **PR 4** | `feat(asm): SEGMENT/ENDS, LABEL, PUBLIC/EXTRN, STRUC, GROUP, IF/ENDIF, INVOKE-args, SEG/TYPE/LENGTH/SIZE` | GAP-013, 015..018, 020, 021, 031, 032 | PR 1 (operator infra) | +5 pts |
| **PR 5** | `feat(asm+cpu): LDS/LES, BYTE PTR outside brackets, DQ/DT, shift+bitwise operators` | GAP-001, 014, 019, 034, 035 | PR 1 | +2 pts |
| **PR 6** | `feat(cpu): minor INT subfunctions + mouse + INT3/WAIT/LOCK/ESC` | GAP-002, 003, 110..115, 300..303 | none | +2 pts |
| **PR 7** | `feat(cpu): virtual filesystem + INT 21h file ops 3Ch..41h, AH=1Ah` | GAP-104..109, 116 | new VFS layer | +3 pts |
| **PR 8** | `feat(devices): 8255 PPI port aliasing or mts8088.inc` | GAP-400..403 | design call | +6 pts |

PR 0 is the foundation: until the lab-corpus tests exist, every "+N pts" number above is an estimate. With PR 0 in place, each subsequent PR's lift is a measured CI delta.

## Per-manual program inventories

For traceability when a future maintainer wants to verify "did GAP-101 really come from M4 program 5?", here is the program-by-program scan. Programs marked ✅ run on `modern8086@main` today; 🚧 mostly works but needs one named gap; ❌ blocked by multiple gaps.

### M1 Hashemite (9 experiments)

| Experiment | Status | Blocking gaps |
|---|---|---|
| 1 — Register transfer / arithmetic | ✅ | — |
| 2 — Branching / loops | 🚧 | GAP-010 (OFFSET in print epilogue) |
| 3 — String instructions | 🚧 | GAP-010, 011 |
| 4 — Modular library (PUBLIC/EXTRN, build .LIB) | ❌ | GAP-015, 016, 017 |
| 5 — File I/O via INT 21h handles | ❌ | GAP-104..109 (PR 7) |
| 6 — Video + mouse-paint | ❌ | GAP-200..208, GAP-300 (PR 3, PR 6) |
| 7 — 8255 PPI: read switches, drive LEDs | ❌ | GAP-400, 401 (PR 8) |
| 8 — 8255 PPI: stepper motor | ❌ | GAP-400, 401 (PR 8) |
| 9 — 8255 PPI: dot-matrix scan | ❌ | GAP-400, 401, GAP-033 (PR 8, PR 1) |

### M2 Gopalan (~30 ALPs across Parts A and B)

Part A — software (ALPs 1.x–7.x). Part B — hardware (8.x).

| Group | Status | Blocking gaps |
|---|---|---|
| 1.1–1.3 (data move, BCD↔ASCII) | ✅ | — |
| 2.1–2.4 (arithmetic, BCD adjust) | ✅ | — |
| 3.1–3.3 (bit manipulation) | 🚧 | GAP-014 in 3.2 (`INC BYTE PTR var`) |
| 4.1–4.4 (arrays, sort, search) | 🚧 | GAP-010 in print-result epilogue |
| 5.1–5.3 (string ops via REP) | ✅ | — |
| 6.1 (Fibonacci, factorial) | ✅ | — |
| 7.1 (display message via AH=09h) | 🚧 | GAP-010 |
| 7.2 (read buffered string via AH=0Ah) | ❌ | GAP-100 |
| 7.3 (read line by char via AH=01h) | ✅ | — |
| 7.4 (case conversion) | 🚧 | GAP-010 |
| 8.1 (drive 7-seg via 8255) | ❌ | GAP-400, 402 |
| 8.2 (control stepper via 8255) | ❌ | GAP-400, 402 |
| 8.3 (4×4 matrix keyboard scan) | ❌ | GAP-400, 402 |
| 8.4 (DAC ramp/triangle/sine) | ❌ | GAP-400, 402 |

### M3 Sri Indu (8086 portion)

| Program | Status | Blocking gaps |
|---|---|---|
| 1. Add two 16-bit numbers | ✅ | — |
| 2. Multi-byte addition | ✅ | — |
| 3. Sort an array | ✅ | — |
| 4. Find largest in array | ✅ | — |
| 5. String compare | ✅ | — |
| 6. Block move | ✅ | — |
| 7. 8255 PPI program | ❌ | GAP-013 (full-segment form), GAP-400, 403 |

### M4 BMSIT (5 programs)

| Program | Status | Blocking gaps |
|---|---|---|
| 1. Binary search on sorted array | 🚧 | GAP-010 |
| 2. Bubble sort | 🚧 | GAP-010 |
| 3. Reverse a string in place | 🚧 | GAP-010 |
| 4. Recursive nCr (procedures) | 🚧 | GAP-010 (`OFFSET`), GAP-001 (`LES`-based far-pointer trick if used) |
| 5. Read system time + display HH:MM:SS | ❌ | GAP-101 (RTC), GAP-200, 201 (mode get/set) |

## Tracker

This section is updated on every PR that closes a gap. A row is removed only when its PR has merged to `main`.

| PR | Status | Branch | Closes gaps |
|---|---|---|---|
| PR 0 | not started | — | — |
| PR 1 | not started | — | GAP-010, 011, 012, 030, 033 |
| PR 2 | not started | — | GAP-100, 101, 102, 103 |
| PR 3 | not started | — | GAP-200..208 |
| PR 4 | not started | — | GAP-013, 015..018, 020, 021, 031, 032 |
| PR 5 | not started | — | GAP-001, 014, 019, 034, 035 |
| PR 6 | not started | — | GAP-002, 003, 110..115, 300..303 |
| PR 7 | not started | — | GAP-104..109, 116 |
| PR 8 | not started | — | GAP-400..403 |

## Methodology — re-running this audit

To re-audit (e.g. after adding a fifth manual, or to verify a gap really did close):

1. Fetch each PDF and extract text with `pypdf` (`pip install pypdf` if needed):

   ```bash
   python3 -c "from pypdf import PdfReader; print(PdfReader('M2.pdf').pages[i].extract_text())"
   ```

2. Scan extracted text for:
   - 8086 mnemonics (regex: `\b(MOV|ADD|SUB|...|HLT|NOP)\b` — the full set is in `packages/assembler/src/encode.rs`)
   - Directives: `\b(\.MODEL|\.STACK|\.DATA|\.CODE|SEGMENT|ENDS|PROC|ENDP|MACRO|ENDM|EQU|ORG|DB|DW|DD|DUP|OFFSET|SEG|PTR|LABEL|STRUC|GROUP|PUBLIC|EXTRN|EXTERN|IF|ELSE|ENDIF)\b`
   - INT subfunctions: pair each `INT NNh` with the surrounding `MOV AH, ...` to identify the subfunction.
   - Port addresses: hex literals immediately before `OUT DX,` or after `IN AL,` / `MOV DX,`.

3. Compare each hit against the supported surface in:
   - `packages/assembler/src/encode.rs` (mnemonics)
   - `packages/assembler/src/parser.rs` (directives, operators)
   - `packages/assembler/src/lexer.rs` (token set)
   - `packages/core/src/cpu.rs::dos_int21`, `::bios_int16`, `::handle_int` (interrupts)
   - `packages/devices/rust/src/` (port handlers)

4. File any new gap with a `GAP-NNN` ID, link it back to the manual + program, and append it to the table above. PR title must include the GAP IDs it closes.

## Why this audit exists

Lab manuals are the contract students sign with our emulator. If a manual's program doesn't run, the student has to debug both the program *and* the emulator simultaneously — a learning experience nobody asked for. Closing the gap is a 1-PR fix once the gap is named; the audit's job is to name them and keep them named.

The four manuals above are not exhaustive. They are a representative sample. As more manuals are surveyed (PRs welcome), this document grows; the GAP IDs stay stable so old PR titles still reference real rows.
