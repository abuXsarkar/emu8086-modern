# /8085 — Research Findings (companion to 8085-port.md)

Verbatim outputs from four parallel research agents run on 2026-05-17. Use this as the source of truth for Phase 0 of the implementation plan.

---

## §1 Competitor landscape

See agent report archived in conversation history. Key entries:

| Tool | URL | Platforms | License | Status |
|---|---|---|---|---|
| Sim8085 (Debjit Biswas) | https://www.sim8085.com/ | Web (PWA), legacy iOS | BSD-3-Clause, free w/ Plus tier | Active — Jan 2026 changelog, 134★ |
| GNUSim8085 | https://github.com/GNUSim8085/GNUSim8085 | Linux primary, Win, Mac | GPL-2.0 | Stale — v1.4.1 (2018), "needs maintainer" |
| OshonSoft 8085 Simulator IDE | https://www.oshonsoft.com/8085.php | Windows | Paid ~$29 | Long-tail, dated UI |
| Jubin Mitra's 8085 Simulator | https://github.com/8085simulator/8085simulator.github.io | Java JAR | unspecified | 2023, widely used in Indian colleges |
| Neutrino 8085 | https://8085emu.github.io/ | Web | GPL-3.0 | Mar 2024, niche |
| theSa1/8085-simulator | https://8085.sa1.dev | Web | unspecified | Hobby, small scope |
| Shastram / web8085 | https://web8085.appspot.com/ | Web | unspecified | Stale |
| 8085 Simulator Ultimate (Android) | Play Store: com.ablsoftech.mp_8085 | Android | Free | 50K+ installs, no ads |
| Live 8085 (Android) | Play Store: com.live8085.simulator | Android | Free w/ ads | 43K installs |
| Intel 8085 Simulator (Android) | mp.project.intel8085simulator | Android | Free | Last updated Nov 2014 |

**Verdict:** Sim8085 is the bar to beat on UX/sharing/classroom; everyone else on platform reach. Most differentiators are already shipped in modern8086.

**Reconciliation:** the previously-attributed "Vault Information Services" product does not exist; the dominant commercial product matching that description is OshonSoft.

---

## §2 Dialect spec (canonical for modern8085)

See `docs/plans/8085-port.md` §0.2 for the full 14-rule spec. Source data:

| Feature | GNUSim8085 | sim8085 | OshonSoft | TASM | A85 | Indian lab convention |
|---|---|---|---|---|---|---|
| Comment | `;` | `;` | `;` | `;` | `;` | `;` |
| Hex `H` suffix | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `0x` hex | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `$` hex | ✗ | ✗ | ✓ | ✓ | ✗ (= PC) | ✗ |
| Leading-0 req. | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `LABEL:` colon | mandatory | mandatory | yes | optional | yes | yes |
| Case-sens labels | ? | ? | no | yes | yes | n/a (UPPER) |
| ORG directive | ✗ | ✓ | ✓ (`.ORG`) | ✓ (`.ORG`) | ✓ | ✓ |
| END directive | ✗ | ✓ | ✓ | ✓ (`.END`) | ✓ | optional |
| Conventional ORG | n/a (assembles at 0) | `0000H`/user | user | user | user | **`4200H` dominant** |
| Strings — `'…'` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Strings — `"…"` | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| `LOW`/`HIGH` ops | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |

Tolerance auto-fixes list (20 items) in `8085-port.md` §0.3.

**Sources (15+):**
- GNUSim8085 asm-guide.txt: https://github.com/GNUSim8085/GNUSim8085/blob/master/doc/asm-guide.txt
- GNUSim8085 userguide.md: https://github.com/GNUSim8085/GNUSim8085/blob/master/doc/help/userguide.md
- GNUSim8085 Issue #41: https://github.com/GNUSim8085/GNUSim8085/issues/41
- Sim8085 — Assembly Language: https://www.sim8085.com/docs/en/assembly/
- Sim8085 — END directive: https://www.sim8085.com/docs/en/directives/end/
- OshonSoft 8085 IDE: https://www.oshonsoft.com/8085.php, https://www.oshonsoft.com/8085helptopics.php
- TASM User's Manual: https://www.cpcalive.com/docs/TASMMAN.HTM
- A85 / ASM85 manual: https://www.ordersomewherechaos.com/rosso/fetish/m102/web100/docs/assemb-x-8085.html
- Crossware 8085 Assembler: http://www.crossware.com/smanuals/a8085/index.html
- SSIT 8085 lab manual: https://ssit.edu.in/dept/assignment/8085labmanual.pdf
- Dronacharya GN India lab manual: https://gnindia.dronacharya.info/ECE/Downloads/Labmanuals/Microprocessor_Lab_Manual.pdf
- CSJMU lab manual: https://gyansanchay.csjmu.ac.in/wp-content/uploads/2022/10/Microprocessor_Lab_Manual-1.pdf
- GGP Bilaspur lab manual: https://www.ggpbilaspur.ac.in/Download%20Content/Download%20LAB%20MANUALS%20VIVA/Electronics%20&%20Telecommunication%20Deptt/Digital%20lab/Microprocessor%208085%20Lab%20Manual.pdf
- BIET Sikar lab manual: https://www.bietsikar.ac.in/documents/9998598840MICROPROCESSOR_%20Lab.pdf
- Intel 8080/8085 Programming Manual: https://nj7p.org/Manuals/PDFs/Intel/9800301D.pdf

---

## §3 Example programs (verbatim, 20 of them)

All 20 programs with their source code, ORG layout, and citations are in `docs/plans/8085-port-research-examples.md` (extracted from the agent's report — too long to inline here).

Summary of standardized memory layout:
- `ORG 2000H` for all programs (relocate sources that used `F000H` or `0000H`)
- Inputs at `2050H+` (or `2040H` for count when `2050H+` holds data)
- Outputs at `3050H+`
- Code never overlaps `2050H–20FFH` or `3050H–30FFH`

Three programs needed minor patches (documented in §0.5 of the plan):
- #15 (count -/0/+): add `MVI D,00H` initialization
- #17 (sum of N): replace `INR L` with `INX H`
- #19 (prime check): use canonical count-divisors-equals-2 idiom

**Sources:**
- GeeksforGeeks 8085 index: https://www.geeksforgeeks.org/category/computer-subject/computer-organization-and-architecture/microprocessor/
- Tutorialspoint 8085 hub: https://www.tutorialspoint.com/microprocessor/index.htm
- sim8085 examples library: https://www.sim8085.com/docs/en/programs/

---

## §4 Pain points (top 15 from competitor issue trackers)

Numbered in `docs/plans/8085-port.md` §0.4. Key issue-tracker citations:

### CPU semantics bugs (pain #2)
- GNUSim8085 #71 (adc carry): https://github.com/GNUSim8085/GNUSim8085/issues/71
- GNUSim8085 #46 (DCR after 80H): https://github.com/GNUSim8085/GNUSim8085/issues/46
- GNUSim8085 #14 (AC flag): https://github.com/GNUSim8085/GNUSim8085/issues/14
- GNUSim8085 #45 (PSW display): https://github.com/GNUSim8085/GNUSim8085/issues/45
- sim8085 #18 (DAA error): https://github.com/debjitbis08/sim8085/issues/18
- sim8085 #44 (AC on SBB): https://github.com/debjitbis08/sim8085/issues/44
- sim8085 #45 (DAD shouldn't affect flags): https://github.com/debjitbis08/sim8085/issues/45
- sim8085 #50 (Aux Carry): https://github.com/debjitbis08/sim8085/issues/50
- sim8085 #57 (DAA bug): https://github.com/debjitbis08/sim8085/issues/57
- 8085simulator #17 (carry on CMP): https://github.com/8085simulator/8085simulator.github.io/issues/17

### Infinite-loop freeze (pain #1)
- GNUSim8085 #21: https://github.com/GNUSim8085/GNUSim8085/issues/21
- sim8085 #67 (rejected all loops): https://github.com/debjitbis08/sim8085/issues/67
- Phoxis review: https://phoxis.org/2011/08/14/reviewing-the-gnusim8085-v1-3-7/

### Install hell (pain #3)
- Launchpad #680079 (Win7 64-bit): https://bugs.launchpad.net/gnusim8085/+bug/680079
- GNUSim8085 #50 (Win7/10): https://github.com/GNUSim8085/GNUSim8085/issues/50
- GNUSim8085 #18 (DLL missing): https://github.com/GNUSim8085/GNUSim8085/issues/18

### No Mac/M1 (pain #4)
- GNUSim8085 #65 (M1): https://github.com/GNUSim8085/GNUSim8085/issues/65
- GNUSim8085 #13 (Mac OS 10.12): https://github.com/GNUSim8085/GNUSim8085/issues/13
- GNUSim8085 #25 (Mac bundle): https://github.com/GNUSim8085/GNUSim8085/issues/25

### Dark mode / dated UI (pain #5)
- GNUSim8085 #69: https://github.com/GNUSim8085/GNUSim8085/issues/69
- 8085simulator #9 (text size): https://github.com/8085simulator/8085simulator.github.io/issues/9
- TheWindowsClub Win85 review: https://www.thewindowsclub.com/8085-microprocessor-simulator-for-windows-10

### Crashes (pain #6)
- GNUSim8085 #47: https://github.com/GNUSim8085/GNUSim8085/issues/47
- 8085simulator #8: https://github.com/8085simulator/8085simulator.github.io/issues/8
- Launchpad #691412 (long DB): https://bugs.launchpad.net/gnusim8085/+bug/691412

### Memory dec vs registers hex (pain #7)
- Phoxis review (above)
- GNUSim8085 #61: https://github.com/GNUSim8085/GNUSim8085/issues/61
- GNUSim8085 #39: https://github.com/GNUSim8085/GNUSim8085/issues/39

### No interrupts (pain #8)
- sim8085 #21 (SIM/RIM): https://github.com/debjitbis08/sim8085/issues/21
- 8085simulator #6: https://github.com/8085simulator/8085simulator.github.io/issues/6
- 8085simulator #7: https://github.com/8085simulator/8085simulator.github.io/issues/7

### Mobile broken (pain #9)
- sim8085 #17: https://github.com/debjitbis08/sim8085/issues/17

### No share link / cloud save (pain #10)
- sim8085 upgrade (Plus paywall): https://www.sim8085.com/upgrade/
- sim8085 #37 (cloud save): https://github.com/debjitbis08/sim8085/issues/37
- sim8085 #38: https://github.com/debjitbis08/sim8085/issues/38

### Cryptic errors (pain #11)
- sim8085 changelog (AI tutor add): https://www.sim8085.com/changelog/

### Project dead (pain #12)
- GNUSim8085 #64: https://github.com/GNUSim8085/GNUSim8085/issues/64

### OshonSoft paywall (pain #13)
- OshonSoft pricing: https://www.oshonsoft.com/8085.php
- Software Informer: https://8085-simulator-ide.software.informer.com/2.8/

### No examples / inline docs (pain #14)
- Launchpad #579321 (wishlist): https://bugs.launchpad.net/gnusim8085/+bug/579321
- GNUSim8085 #26 (call highlight): https://github.com/GNUSim8085/GNUSim8085/issues/26

### Slow / no timing (pain #15)
- Launchpad #579326 (slow mode): https://bugs.launchpad.net/gnusim8085/+bug/579326

---

## Additional feature requests harvested

- Recent files / remember last folder — GNUSim8085 #55
- Cloud save / Google Drive — sim8085 #37, #38
- Raw binary export for EPROM — sim8085 #77, GNUSim8085 #60
- Auto-scroll editor on highlight — sim8085 #75
- ORG directive / runtime address — sim8085 #40, GNUSim8085 wishlist #579325
- Built-in hex/dec converter — sim8085 #46, GNUSim8085 #66, #51
- Ctrl+/ comment shortcut — sim8085 #8
- ASCII in memory view — GNUSim8085 #57
- Tutorial mode — added by sim8085, paywalled
- Undocumented 8085 instructions (DSUB/ARHL/RDEL/LDHI/LDSI/LHLX/RSTV/SHLX) — sim8085 #16, GNUSim8085 #63

---

## Unverifiable but plausible

- Step-back / time-travel debug — high engineering value, no public 8085-user complaint found
- Register diff highlighting — strong intuition, no quote
- Classroom submission flow — strong product intuition, only secondary evidence (researchgate paper on 8085 SimuKit)
- YouTube tutorial comments — couldn't scrape
- Chromebook complaints — inferred from desktop-only distribution
- Reddit threads — Reddit blocks scraping; students appear to vent on GitHub instead

---

## Reconciliation notes

1. **"Vault Information Services"** was a misattribution — the product is OshonSoft's. All references in `8085-port.md` use the correct name.
2. **"compilers.world online 8085"** — could not be located. Likely a misremembered URL or dead site.
3. **"ASIM"** — no specific 8085 tool by that name surfaced. j8085sim or J-Tech's "8085 Simulator" are the closest matches.
