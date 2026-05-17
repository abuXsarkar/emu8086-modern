# modern8051-assembler

Two-pass assembler for the Intel 8051 mnemonic set. Sibling to `modern8085-assembler`.

The 8051 ISA is meaningfully different from 8085:
- ~111 mnemonics vs ~70 on 8085
- Three operand spaces (direct / indirect `@Ri` / indirect `@DPTR`)
- Bit operands (`SETB P1.0`, `JB ACC.7, label`)
- Bit-addressable space + SFR bit aliases (`MOV C, P1.0`)
- Distinct memory directives: `DBIT`, `BSEG`, `DSEG`, `XSEG`, `CSEG`, `RSEG`

The canonical dialect spec + tolerance auto-fixes are documented in `docs/plans/8051-port.md` (lands after research consolidates). Default `ORG` when omitted is `0000H` (8051 reset vector). Bit operands accept both `P1.0` (port-bit) and `90H.0` (numeric) forms.

Status: **skeleton.** Lexer/parser/encoder stubs in place; full implementation after the dialect spec lands.
