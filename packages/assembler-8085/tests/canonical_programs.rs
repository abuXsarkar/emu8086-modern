//! Integration test: every program shipped in the IDE's Examples
//! dropdown must assemble cleanly. Each entry below is the exact
//! source string from `packages/web/src/8085/examples.ts` — if a
//! student picks "Add two 8-bit numbers" from the dropdown, the
//! assembler must produce bytes, not an error.
//!
//! Source per program is documented in `docs/plans/8085-port-research.md`
//! §3; patches noted there have already been applied to the strings
//! we ship.

use modern8085_assembler::assemble;

fn assert_ok(name: &str, src: &str) {
    let out = assemble(src).unwrap_or_else(|e| panic!("`{name}` failed to assemble: {e}"));
    assert!(!out.bytes.is_empty(), "`{name}` assembled to zero bytes");
}

#[test]
fn add_two_8bit_numbers() {
    assert_ok(
        "add 8-bit",
        "ORG 2000H
LDA 2050H
MOV H, A
LDA 2051H
ADD H
MOV L, A
MVI A, 00H
ADC A
MOV H, A
SHLD 3050H
HLT",
    );
}

#[test]
fn subtract_with_borrow() {
    assert_ok(
        "sub with borrow",
        "ORG 2000H
MVI C, 00H
LHLD 2500H
MOV A, H
SUB L
JNC NOBRW
INR C
NOBRW: STA 2502H
MOV A, C
STA 2503H
HLT",
    );
}

#[test]
fn multiply_repeated_add() {
    assert_ok(
        "multiply",
        "ORG 2000H
LHLD 2050H
XCHG
MOV C, D
MVI D, 00H
LXI H, 0000H
LOOP: DAD D
DCR C
JNZ LOOP
SHLD 3050H
HLT",
    );
}

#[test]
fn divide_repeated_subtract() {
    assert_ok(
        "divide",
        "ORG 2000H
LXI H, 2050H
MOV B, M
MVI C, 00H
INX H
MOV A, M
LOOP: CMP B
JC DONE
SUB B
INR C
JMP LOOP
DONE: STA 3050H
MOV A, C
STA 3051H
HLT",
    );
}

#[test]
fn largest_in_array() {
    assert_ok(
        "largest",
        "ORG 2000H
LXI H, 2050H
MOV C, M
DCR C
INX H
MOV A, M
LOOP: INX H
CMP M
JNC SKIP
MOV A, M
SKIP: DCR C
JNZ LOOP
STA 3050H
HLT",
    );
}

#[test]
fn smallest_in_array() {
    assert_ok(
        "smallest",
        "ORG 2000H
LXI H, 2050H
MOV C, M
INX H
MOV B, M
DCR C
LOOP: INX H
MOV A, M
CMP B
JNC SKIP
MOV B, A
SKIP: DCR C
JNZ LOOP
MOV A, B
STA 3050H
HLT",
    );
}

#[test]
fn block_transfer_with_overlap() {
    assert_ok(
        "block transfer",
        "ORG 2000H
LXI H, 2050H
LXI SP, 2FFEH
MOV B, M
MOV C, M
INX H
SAVE: MVI D, 00H
MOV E, M
PUSH D
DCR C
INX H
JNZ SAVE
MOV C, B
LXI D, 2080H
XCHG
DAD B
DCX H
COPY: POP D
MOV M, E
DCR C
DCX H
JNZ COPY
HLT",
    );
}

#[test]
fn bubble_sort() {
    assert_ok(
        "bubble sort",
        "ORG 2000H
START: LXI H, 2040H
MVI D, 00H
MOV C, M
DCR C
INX H
CHECK: MOV A, M
INX H
CMP M
JC NEXT
JZ NEXT
MOV B, M
MOV M, A
DCX H
MOV M, B
INX H
MVI D, 01H
NEXT: DCR C
JNZ CHECK
MOV A, D
CPI 01H
JZ START
HLT",
    );
}

#[test]
fn bcd_to_binary() {
    assert_ok(
        "bcd->bin",
        "ORG 2000H
LDA 2050H
MOV B, A
ANI 0FH
MOV C, A
MOV A, B
ANI 0F0H
JZ SKIP
RRC
RRC
RRC
RRC
MOV D, A
XRA A
MVI E, 0AH
SUM: ADD D
DCR E
JNZ SUM
SKIP: ADD C
STA 3050H
HLT",
    );
}

#[test]
fn binary_to_bcd() {
    assert_ok(
        "bin->bcd",
        "ORG 2000H
LXI H, 2050H
MVI D, 00H
XRA A
MOV C, M
LOOP: ADI 01H
DAA
JNC SKIP
INR D
SKIP: DCR C
JNZ LOOP
STA 3050H
MOV A, D
STA 3051H
HLT",
    );
}

#[test]
fn add_16bit_dad() {
    assert_ok(
        "16-bit add",
        "ORG 2000H
LHLD 2050H
XCHG
LHLD 2052H
DAD D
SHLD 3050H
HLT",
    );
}

#[test]
fn sub_16bit() {
    assert_ok(
        "16-bit sub",
        "ORG 2000H
LHLD 2050H
XCHG
LHLD 2052H
MOV A, E
SUB L
STA 2054H
MOV A, D
SBB H
STA 2055H
HLT",
    );
}

#[test]
fn square_repeated_add() {
    assert_ok(
        "square",
        "ORG 2000H
LXI H, 2050H
MVI A, 00H
MOV B, M
ADD_LP: ADD M
DCR B
JNZ ADD_LP
STA 3050H
HLT",
    );
}

#[test]
fn factorial() {
    assert_ok(
        "factorial",
        "ORG 2000H
LDA 2050H
MOV B, A
MVI D, 01H
FACT: CALL MULT
DCR B
JNZ FACT
MOV A, D
STA 3050H
HLT
MULT: MOV E, B
MVI A, 00H
MLOOP: ADD D
DCR E
JNZ MLOOP
MOV D, A
RET",
    );
}

#[test]
fn count_neg_zero_pos() {
    assert_ok(
        "count -/0/+",
        "ORG 2000H
LXI H, 2100H
MVI C, 00H
MVI B, 00H
MVI E, 00H
MVI D, 00H
BEGIN: MOV A, M
CPI 00H
JZ ZERONUM
ANI 80H
JNZ NEGNUM
INR D
JMP LAST
ZERONUM: INR E
JMP LAST
NEGNUM: INR B
LAST: INX H
INR C
MOV A, C
CPI 32H
JNZ BEGIN
LXI H, 3050H
MOV M, B
INX H
MOV M, E
INX H
MOV M, D
HLT",
    );
}

#[test]
fn separate_even_odd() {
    assert_ok(
        "even/odd",
        "ORG 2000H
LXI H, 2100H
LXI D, 2200H
MVI C, 32H
ODDLP: MOV A, M
ANI 01H
JZ ODDSKIP
MOV A, M
STAX D
INX D
ODDSKIP: INX H
DCR C
JNZ ODDLP
LXI H, 2100H
LXI D, 2300H
MVI C, 32H
EVNLP: MOV A, M
ANI 01H
JNZ EVNSKIP
MOV A, M
STAX D
INX D
EVNSKIP: INX H
DCR C
JNZ EVNLP
HLT",
    );
}

#[test]
fn sum_n_numbers() {
    assert_ok(
        "sum N",
        "ORG 2000H
LDA 2050H
MOV B, A
LXI H, 2051H
MVI A, 00H
MVI C, 00H
SUMLP: ADD M
INX H
JNC NOCY
INR C
NOCY: DCR B
JNZ SUMLP
STA 3050H
MOV A, C
STA 3051H
HLT",
    );
}

#[test]
fn fibonacci() {
    assert_ok(
        "fibonacci",
        "ORG 2000H
LXI H, 3050H
MVI C, 08H
MVI B, 00H
MVI D, 01H
MOV M, B
INX H
MOV M, D
NEXT: MOV A, B
ADD D
MOV B, D
MOV D, A
INX H
MOV M, A
DCR C
JNZ NEXT
HLT",
    );
}

#[test]
fn prime_check() {
    assert_ok(
        "prime",
        "ORG 2000H
LDA 2050H
MVI C, 00H
MOV E, A
MOV B, A
LOOP1: MOV D, E
MOV A, B
LOOP2: CMP D
JC DONE2
SUB D
JMP LOOP2
DONE2: CPI 00H
JNZ NEXT
INR C
NEXT: DCR E
JNZ LOOP1
MOV A, C
CPI 02H
JNZ NOTPR
MVI A, 01H
JMP SAVE
NOTPR: MVI A, 00H
SAVE: STA 3050H
HLT",
    );
}

#[test]
fn ascii_to_hex() {
    assert_ok(
        "ascii->hex",
        "ORG 2000H
LDA 2050H
SUI 30H
CPI 0AH
JC STORE
SUI 07H
STORE: STA 3050H
HLT",
    );
}
