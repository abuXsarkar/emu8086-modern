# modern8085-assembler

Assembler for the Intel 8085 mnemonic set. Two-pass: pass 1 resolves labels, pass 2 emits bytes.

The 8085 ISA is distinct from 8086 — different mnemonics, different operand encoding, different addressing modes. This crate is a clean implementation, not a subset of the 8086 assembler.

Includes a **tolerance pass** that silently auto-fixes the most common cross-dialect paste-in mistakes (hex literals without the leading `0`, `0x`-prefixed hex, smart quotes, dot-prefixed directives, etc.) so students can paste programs from sim8085, GNUSim8085, OshonSoft, lab manuals, and GeeksforGeeks without manual editing. Each auto-fix is reported so the editor can surface a non-blocking hint.

Default `ORG` when omitted is `2000H` (textbook convention). A `Lab Kit Mode` toggle in the IDE switches the default to `4200H` (Vinytics/Dynalog trainer convention).
