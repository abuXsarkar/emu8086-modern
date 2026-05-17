//! End-to-end integration: assemble each canonical program, run it
//! against the core executor, and verify the documented output. This
//! is the cross-crate gate that catches both assembler-encoding bugs
//! and executor-decoding bugs at the example level.
//!
//! Covers the high-confidence subset of the IDE's Examples library —
//! programs with well-defined inputs and a single deterministic
//! output address. (A few examples — like the sort + the count
//! routines — work on larger arrays and are verified via the
//! assemble-only test in `canonical_programs.rs`.)

use modern8085_assembler::assemble;
use modern8085_core::{exec, Cpu, Memory, StopReason};

/// Run helper: assemble `src`, load at the assembled origin, poke
/// every `inputs[i].0 → inputs[i].1` byte before run, drive the
/// executor with a generous budget, then return the (final mem,
/// final cpu) state. Panics with a descriptive message if the
/// program failed to halt cleanly.
fn run(src: &str, inputs: &[(u16, u8)]) -> (Memory, Cpu) {
    let out = assemble(src).expect("assemble failed");
    let mut cpu = Cpu::new();
    let mut mem = Memory::new();
    mem.load(out.origin, &out.bytes);
    cpu.pc = out.origin;
    cpu.sp = 0xFFFE;
    for &(addr, val) in inputs {
        mem.write(addr, val);
    }
    let stop = exec::run(&mut cpu, &mut mem, 1_000_000, &[]);
    assert_eq!(stop, StopReason::Halted, "program did not halt cleanly");
    (mem, cpu)
}

#[test]
fn add_8bit_12h_plus_34h_equals_46h() {
    let src = "ORG 2000H
LDA 2050H
MOV H, A
LDA 2051H
ADD H
MOV L, A
MVI A, 00H
ADC A
MOV H, A
SHLD 3050H
HLT";
    let (mem, _) = run(src, &[(0x2050, 0x12), (0x2051, 0x34)]);
    assert_eq!(mem.read(0x3050), 0x46, "sum should be 0x46");
    assert_eq!(mem.read(0x3051), 0x00, "carry should be 0");
}

#[test]
fn add_8bit_with_carry_out() {
    // 0xFF + 0x02 = 0x101 → low=0x01, carry=0x01
    let src = "ORG 2000H
LDA 2050H
MOV H, A
LDA 2051H
ADD H
MOV L, A
MVI A, 00H
ADC A
MOV H, A
SHLD 3050H
HLT";
    let (mem, _) = run(src, &[(0x2050, 0xFF), (0x2051, 0x02)]);
    assert_eq!(mem.read(0x3050), 0x01);
    assert_eq!(mem.read(0x3051), 0x01);
}

#[test]
fn multiply_7_x_6_equals_42() {
    let src = "ORG 2000H
LHLD 2050H
XCHG
MOV C, D
MVI D, 00H
LXI H, 0000H
LOOP: DAD D
DCR C
JNZ LOOP
SHLD 3050H
HLT";
    // Memory layout: LHLD 2050H reads L from 2050, H from 2051.
    // After XCHG, DE = HL → D = (old H) = multiplier, E = (old L) = multiplicand.
    // So multiplier is at 2051 and multiplicand at 2050. Set multiplier=6, multiplicand=7.
    let (mem, _) = run(src, &[(0x2050, 0x07), (0x2051, 0x06)]);
    assert_eq!(mem.read(0x3050), 42, "product low byte");
    assert_eq!(mem.read(0x3051), 0, "product high byte");
}

#[test]
fn divide_45_by_7_equals_6_remainder_3() {
    let src = "ORG 2000H
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
HLT";
    let (mem, _) = run(src, &[(0x2050, 7), (0x2051, 45)]);
    assert_eq!(mem.read(0x3050), 3, "remainder");
    assert_eq!(mem.read(0x3051), 6, "quotient");
}

#[test]
fn largest_in_array_finds_max() {
    let src = "ORG 2000H
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
HLT";
    let (mem, _) = run(
        src,
        &[
            (0x2050, 5), // count
            (0x2051, 0x12),
            (0x2052, 0x77),
            (0x2053, 0x34),
            (0x2054, 0xAB), // <- max
            (0x2055, 0x09),
        ],
    );
    assert_eq!(mem.read(0x3050), 0xAB);
}

#[test]
fn smallest_in_array_finds_min() {
    let src = "ORG 2000H
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
HLT";
    let (mem, _) = run(
        src,
        &[
            (0x2050, 5),
            (0x2051, 0x42),
            (0x2052, 0x10),
            (0x2053, 0x77),
            (0x2054, 0x05), // <- min
            (0x2055, 0x88),
        ],
    );
    assert_eq!(mem.read(0x3050), 0x05);
}

#[test]
fn add_16bit_dad() {
    // 0x1234 + 0xABCD = 0xBE01
    let src = "ORG 2000H
LHLD 2050H
XCHG
LHLD 2052H
DAD D
SHLD 3050H
HLT";
    let (mem, _) = run(
        src,
        &[
            (0x2050, 0x34), // first low
            (0x2051, 0x12), // first high (= 0x1234)
            (0x2052, 0xCD), // second low
            (0x2053, 0xAB), // second high (= 0xABCD)
        ],
    );
    assert_eq!(mem.read(0x3050), 0x01); // low
    assert_eq!(mem.read(0x3051), 0xBE); // high
}

#[test]
fn fibonacci_first_ten_terms() {
    let src = "ORG 2000H
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
HLT";
    let (mem, _) = run(src, &[]);
    let expected = [0u8, 1, 1, 2, 3, 5, 8, 13, 21, 34];
    for (i, want) in expected.iter().enumerate() {
        assert_eq!(
            mem.read(0x3050 + i as u16),
            *want,
            "fib[{i}] at 0x{:04X}",
            0x3050 + i
        );
    }
}

#[test]
fn bubble_sort_sorts_ascending() {
    let src = "ORG 2000H
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
HLT";
    let (mem, _) = run(
        src,
        &[
            (0x2040, 5),
            (0x2041, 0x34),
            (0x2042, 0x11),
            (0x2043, 0x77),
            (0x2044, 0x09),
            (0x2045, 0x22),
        ],
    );
    let sorted: Vec<u8> = (0..5).map(|i| mem.read(0x2041 + i)).collect();
    assert_eq!(sorted, vec![0x09, 0x11, 0x22, 0x34, 0x77]);
}

#[test]
fn ascii_to_hex_letter_b() {
    let src = "ORG 2000H
LDA 2050H
SUI 30H
CPI 0AH
JC STORE
SUI 07H
STORE: STA 3050H
HLT";
    // 'B' = 0x42 → expect 0x0B
    let (mem, _) = run(src, &[(0x2050, 0x42)]);
    assert_eq!(mem.read(0x3050), 0x0B);

    // Also verify a digit: '5' = 0x35 → expect 0x05
    let (mem2, _) = run(src, &[(0x2050, 0x35)]);
    assert_eq!(mem2.read(0x3050), 0x05);
}

#[test]
fn square_of_eleven() {
    let src = "ORG 2000H
LXI H, 2050H
MVI A, 00H
MOV B, M
ADD_LP: ADD M
DCR B
JNZ ADD_LP
STA 3050H
HLT";
    // 11 * 11 = 121 = 0x79
    let (mem, _) = run(src, &[(0x2050, 0x0B)]);
    assert_eq!(mem.read(0x3050), 121);
}

#[test]
fn factorial_of_five() {
    let src = "ORG 2000H
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
RET";
    // 5! = 120 = 0x78
    let (mem, _) = run(src, &[(0x2050, 0x05)]);
    assert_eq!(mem.read(0x3050), 120);
}
