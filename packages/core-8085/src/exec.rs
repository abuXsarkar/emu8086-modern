//! 8085 instruction decoder + executor.
//!
//! Single entry point: `step(cpu, mem) -> Result<StepRecord, StopReason>`.
//! Each call fetches one instruction at `cpu.pc`, advances PC by 1/2/3
//! bytes, mutates `cpu` and `mem` per the ISA, and returns either a
//! `StepRecord` describing what happened or a `StopReason` (HLT, IO,
//! invalid opcode).
//!
//! Instruction set: all 246 Intel 8085 opcodes. Flag semantics flow
//! exclusively through the helpers in `crate::alu` — that's the
//! single source of truth for the bit-exact behaviour, and where the
//! competitor-bug regression tests live.

use crate::alu;
use crate::cpu::{Cpu, Flags, RegPair, StepRecord, StopReason};
use crate::mem::Memory;

/// Convert a 3-bit register field (lower 3 bits of an opcode) to its
/// 8-bit register value. Index 6 = `[HL]`, index 7 = A.
fn read_reg_or_m(cpu: &Cpu, mem: &Memory, field: u8) -> u8 {
    match field & 0x7 {
        0 => cpu.b,
        1 => cpu.c,
        2 => cpu.d,
        3 => cpu.e,
        4 => cpu.h,
        5 => cpu.l,
        6 => cpu.get_m(mem),
        7 => cpu.a,
        _ => unreachable!(),
    }
}

fn write_reg_or_m(cpu: &mut Cpu, mem: &mut Memory, field: u8, value: u8) {
    match field & 0x7 {
        0 => cpu.b = value,
        1 => cpu.c = value,
        2 => cpu.d = value,
        3 => cpu.e = value,
        4 => cpu.h = value,
        5 => cpu.l = value,
        6 => cpu.set_m(mem, value),
        7 => cpu.a = value,
        _ => unreachable!(),
    }
}

/// 2-bit pair field used by LXI/DAD/INX/DCX. `SP` is the SP slot.
fn pair_sp(field: u8) -> RegPair {
    match field & 0x3 {
        0 => RegPair::BC,
        1 => RegPair::DE,
        2 => RegPair::HL,
        3 => RegPair::SP,
        _ => unreachable!(),
    }
}

/// 2-bit pair field used by PUSH/POP. Same layout but slot 3 is PSW.
fn read_pair_psw(cpu: &Cpu, field: u8) -> u16 {
    match field & 0x3 {
        0 => cpu.get_pair(RegPair::BC),
        1 => cpu.get_pair(RegPair::DE),
        2 => cpu.get_pair(RegPair::HL),
        3 => cpu.psw(),
        _ => unreachable!(),
    }
}

fn write_pair_psw(cpu: &mut Cpu, field: u8, value: u16) {
    match field & 0x3 {
        0 => cpu.set_pair(RegPair::BC, value),
        1 => cpu.set_pair(RegPair::DE, value),
        2 => cpu.set_pair(RegPair::HL, value),
        3 => cpu.set_psw(value),
        _ => unreachable!(),
    }
}

/// Test a 3-bit condition code against the current flags.
fn cond_holds(flags: &Flags, code: u8) -> bool {
    match code & 0x7 {
        0 => !flags.z,  // NZ
        1 => flags.z,   // Z
        2 => !flags.cy, // NC
        3 => flags.cy,  // C
        4 => !flags.p,  // PO (parity odd)
        5 => flags.p,   // PE (parity even)
        6 => !flags.s,  // P  (positive — sign clear)
        7 => flags.s,   // M  (minus  — sign set)
        _ => unreachable!(),
    }
}

/// Fetch the byte at `cpu.pc` and advance PC.
fn fetch_byte(cpu: &mut Cpu, mem: &Memory) -> u8 {
    let b = mem.read(cpu.pc);
    cpu.pc = cpu.pc.wrapping_add(1);
    b
}

/// Fetch a little-endian 16-bit word at PC and advance PC by 2.
fn fetch_word(cpu: &mut Cpu, mem: &Memory) -> u16 {
    let lo = fetch_byte(cpu, mem);
    let hi = fetch_byte(cpu, mem);
    u16::from(lo) | (u16::from(hi) << 8)
}

/// Execute exactly one instruction.
///
/// Returns `Ok(StepRecord)` on a successful step, or `Err(StopReason)`
/// when the CPU encountered HLT, an IO instruction (M0 has no IO
/// peripherals), or an undefined opcode.
#[allow(clippy::too_many_lines, clippy::cognitive_complexity)]
pub fn step(cpu: &mut Cpu, mem: &mut Memory) -> Result<StepRecord, StopReason> {
    let pc_before = cpu.pc;
    let opcode = fetch_byte(cpu, mem);

    // Approximate cycle counts. Real 8085 timing varies per instruction
    // and per operand (M operands take +3 cycles). The web IDE doesn't
    // need cycle-accurate timing; sim8085's metrics panel rounds the
    // same way. We use a coarse table here that gives "looks right"
    // values for the metrics chip; refine later if anyone needs
    // T-state accuracy for embedded timing exercises.
    let mut cycles: u8 = 4;

    match opcode {
        // ── 0x00..0x3F: misc + LXI + INR/DCR + ALU singletons ───
        0x00 => { /* NOP */ }
        // LXI rp, d16
        0x01 | 0x11 | 0x21 | 0x31 => {
            let p = pair_sp((opcode >> 4) & 0x3);
            let w = fetch_word(cpu, mem);
            cpu.set_pair(p, w);
            cycles = 10;
        }
        // STAX B / STAX D
        0x02 => {
            mem.write(cpu.get_pair(RegPair::BC), cpu.a);
            cycles = 7;
        }
        0x12 => {
            mem.write(cpu.get_pair(RegPair::DE), cpu.a);
            cycles = 7;
        }
        // INX rp
        0x03 | 0x13 | 0x23 | 0x33 => {
            let p = pair_sp((opcode >> 4) & 0x3);
            cpu.set_pair(p, cpu.get_pair(p).wrapping_add(1));
            cycles = 6;
        }
        // INR r / INR M
        0x04 | 0x0C | 0x14 | 0x1C | 0x24 | 0x2C | 0x34 | 0x3C => {
            let dest = (opcode >> 3) & 0x7;
            let v = read_reg_or_m(cpu, mem, dest);
            let result = alu::inr(&mut cpu.flags, v);
            write_reg_or_m(cpu, mem, dest, result);
            cycles = if dest == 6 { 10 } else { 4 };
        }
        // DCR r / DCR M
        0x05 | 0x0D | 0x15 | 0x1D | 0x25 | 0x2D | 0x35 | 0x3D => {
            let dest = (opcode >> 3) & 0x7;
            let v = read_reg_or_m(cpu, mem, dest);
            let result = alu::dcr(&mut cpu.flags, v);
            write_reg_or_m(cpu, mem, dest, result);
            cycles = if dest == 6 { 10 } else { 4 };
        }
        // MVI r, d8 / MVI M, d8
        0x06 | 0x0E | 0x16 | 0x1E | 0x26 | 0x2E | 0x36 | 0x3E => {
            let dest = (opcode >> 3) & 0x7;
            let imm = fetch_byte(cpu, mem);
            write_reg_or_m(cpu, mem, dest, imm);
            cycles = if dest == 6 { 10 } else { 7 };
        }
        // RLC
        0x07 => {
            let high = (cpu.a & 0x80) != 0;
            cpu.a = cpu.a.rotate_left(1);
            cpu.flags.cy = high;
        }
        // DAD rp
        0x09 | 0x19 | 0x29 | 0x39 => {
            let p = pair_sp((opcode >> 4) & 0x3);
            let hl = cpu.get_pair(RegPair::HL);
            let addend = cpu.get_pair(p);
            let result = alu::dad(&mut cpu.flags, hl, addend);
            cpu.set_pair(RegPair::HL, result);
            cycles = 10;
        }
        // LDAX B / LDAX D
        0x0A => {
            cpu.a = mem.read(cpu.get_pair(RegPair::BC));
            cycles = 7;
        }
        0x1A => {
            cpu.a = mem.read(cpu.get_pair(RegPair::DE));
            cycles = 7;
        }
        // DCX rp
        0x0B | 0x1B | 0x2B | 0x3B => {
            let p = pair_sp((opcode >> 4) & 0x3);
            cpu.set_pair(p, cpu.get_pair(p).wrapping_sub(1));
            cycles = 6;
        }
        // RRC
        0x0F => {
            let low = (cpu.a & 0x01) != 0;
            cpu.a = cpu.a.rotate_right(1);
            cpu.flags.cy = low;
        }
        // RAL
        0x17 => {
            let high = (cpu.a & 0x80) != 0;
            cpu.a = (cpu.a << 1) | u8::from(cpu.flags.cy);
            cpu.flags.cy = high;
        }
        // RAR
        0x1F => {
            let low = (cpu.a & 0x01) != 0;
            cpu.a = (cpu.a >> 1) | (u8::from(cpu.flags.cy) << 7);
            cpu.flags.cy = low;
        }
        // RIM
        0x20 => {
            // M0 has no real interrupt mask hardware. Return the IM
            // byte as A so RIM still round-trips deterministically.
            cpu.a = cpu.im;
        }
        // SHLD addr
        0x22 => {
            let a = fetch_word(cpu, mem);
            mem.write(a, cpu.l);
            mem.write(a.wrapping_add(1), cpu.h);
            cycles = 16;
        }
        // DAA
        0x27 => {
            cpu.a = alu::daa(&mut cpu.flags, cpu.a);
        }
        // LHLD addr
        0x2A => {
            let a = fetch_word(cpu, mem);
            cpu.l = mem.read(a);
            cpu.h = mem.read(a.wrapping_add(1));
            cycles = 16;
        }
        // CMA
        0x2F => {
            cpu.a = !cpu.a;
        }
        // SIM
        0x30 => {
            cpu.im = cpu.a;
        }
        // STA addr
        0x32 => {
            let a = fetch_word(cpu, mem);
            mem.write(a, cpu.a);
            cycles = 13;
        }
        // STC
        0x37 => {
            cpu.flags.cy = true;
        }
        // LDA addr
        0x3A => {
            let a = fetch_word(cpu, mem);
            cpu.a = mem.read(a);
            cycles = 13;
        }
        // CMC
        0x3F => {
            cpu.flags.cy = !cpu.flags.cy;
        }

        // ── 0x40..0x7F: MOV (with HLT carve-out) ─────────────────
        0x76 => {
            // HLT — leave PC pointing past the HLT so the IDE shows
            // the next address.
            return Err(StopReason::Halted);
        }
        op @ 0x40..=0x7F => {
            let dest = (op >> 3) & 0x7;
            let src = op & 0x7;
            let v = read_reg_or_m(cpu, mem, src);
            write_reg_or_m(cpu, mem, dest, v);
            cycles = if dest == 6 || src == 6 { 7 } else { 4 };
        }

        // ── 0x80..0xBF: ADD/ADC/SUB/SBB/ANA/XRA/ORA/CMP r ────────
        op @ 0x80..=0xBF => {
            let sub_op = (op >> 3) & 0x7;
            let src = op & 0x7;
            let v = read_reg_or_m(cpu, mem, src);
            match sub_op {
                0 => {
                    let r = alu::add8(&mut cpu.flags, cpu.a, v, false);
                    cpu.a = r;
                }
                1 => {
                    let cy = cpu.flags.cy;
                    let r = alu::add8(&mut cpu.flags, cpu.a, v, cy);
                    cpu.a = r;
                }
                2 => {
                    let r = alu::sub8(&mut cpu.flags, cpu.a, v, false);
                    cpu.a = r;
                }
                3 => {
                    let cy = cpu.flags.cy;
                    let r = alu::sub8(&mut cpu.flags, cpu.a, v, cy);
                    cpu.a = r;
                }
                4 => {
                    cpu.a = alu::ana(&mut cpu.flags, cpu.a, v);
                }
                5 => {
                    cpu.a = alu::xra(&mut cpu.flags, cpu.a, v);
                }
                6 => {
                    cpu.a = alu::ora(&mut cpu.flags, cpu.a, v);
                }
                7 => alu::cmp(&mut cpu.flags, cpu.a, v),
                _ => unreachable!(),
            }
            cycles = if src == 6 { 7 } else { 4 };
        }

        // ── 0xC0..0xFF: misc ─────────────────────────────────────
        // RNZ / RZ / RNC / RC / RPO / RPE / RP / RM  (Rcc)
        0xC0 | 0xC8 | 0xD0 | 0xD8 | 0xE0 | 0xE8 | 0xF0 | 0xF8 => {
            let cc = (opcode >> 3) & 0x7;
            if cond_holds(&cpu.flags, cc) {
                cpu.pc = cpu.pop_word(mem);
                cycles = 12;
            } else {
                cycles = 6;
            }
        }
        // POP rp
        0xC1 | 0xD1 | 0xE1 | 0xF1 => {
            let p = (opcode >> 4) & 0x3;
            let w = cpu.pop_word(mem);
            write_pair_psw(cpu, p, w);
            cycles = 10;
        }
        // Jcc addr
        0xC2 | 0xCA | 0xD2 | 0xDA | 0xE2 | 0xEA | 0xF2 | 0xFA => {
            let cc = (opcode >> 3) & 0x7;
            let target = fetch_word(cpu, mem);
            if cond_holds(&cpu.flags, cc) {
                cpu.pc = target;
            }
            cycles = 10;
        }
        // JMP addr
        0xC3 => {
            cpu.pc = fetch_word(cpu, mem);
            cycles = 10;
        }
        // Ccc addr
        0xC4 | 0xCC | 0xD4 | 0xDC | 0xE4 | 0xEC | 0xF4 | 0xFC => {
            let cc = (opcode >> 3) & 0x7;
            let target = fetch_word(cpu, mem);
            if cond_holds(&cpu.flags, cc) {
                let return_addr = cpu.pc;
                cpu.push_word(mem, return_addr);
                cpu.pc = target;
                cycles = 18;
            } else {
                cycles = 9;
            }
        }
        // PUSH rp
        0xC5 | 0xD5 | 0xE5 | 0xF5 => {
            let p = (opcode >> 4) & 0x3;
            let v = read_pair_psw(cpu, p);
            cpu.push_word(mem, v);
            cycles = 12;
        }
        // ADI / ACI / SUI / SBI / ANI / XRI / ORI / CPI d8
        0xC6 | 0xCE | 0xD6 | 0xDE | 0xE6 | 0xEE | 0xF6 | 0xFE => {
            let imm = fetch_byte(cpu, mem);
            cycles = 7;
            match opcode {
                0xC6 => {
                    let r = alu::add8(&mut cpu.flags, cpu.a, imm, false);
                    cpu.a = r;
                }
                0xCE => {
                    let cy = cpu.flags.cy;
                    let r = alu::add8(&mut cpu.flags, cpu.a, imm, cy);
                    cpu.a = r;
                }
                0xD6 => {
                    let r = alu::sub8(&mut cpu.flags, cpu.a, imm, false);
                    cpu.a = r;
                }
                0xDE => {
                    let cy = cpu.flags.cy;
                    let r = alu::sub8(&mut cpu.flags, cpu.a, imm, cy);
                    cpu.a = r;
                }
                0xE6 => {
                    cpu.a = alu::ana(&mut cpu.flags, cpu.a, imm);
                }
                0xEE => {
                    cpu.a = alu::xra(&mut cpu.flags, cpu.a, imm);
                }
                0xF6 => {
                    cpu.a = alu::ora(&mut cpu.flags, cpu.a, imm);
                }
                0xFE => alu::cmp(&mut cpu.flags, cpu.a, imm),
                _ => unreachable!(),
            }
        }
        // RST n
        0xC7 | 0xCF | 0xD7 | 0xDF | 0xE7 | 0xEF | 0xF7 | 0xFF => {
            let n = (opcode >> 3) & 0x7;
            let return_addr = cpu.pc;
            cpu.push_word(mem, return_addr);
            cpu.pc = u16::from(n) * 8;
            cycles = 12;
        }
        // RET
        0xC9 => {
            cpu.pc = cpu.pop_word(mem);
            cycles = 10;
        }
        // CALL addr
        0xCD => {
            let target = fetch_word(cpu, mem);
            let return_addr = cpu.pc;
            cpu.push_word(mem, return_addr);
            cpu.pc = target;
            cycles = 18;
        }
        // OUT port (M0: surface as a stop so the IDE / autograder can
        // observe — most lab programs don't use OUT anyway).
        0xD3 => {
            let port = fetch_byte(cpu, mem);
            return Err(StopReason::IoWrite {
                pc: pc_before,
                port,
                value: cpu.a,
            });
        }
        // IN port (M0: surface as stop)
        0xDB => {
            let port = fetch_byte(cpu, mem);
            return Err(StopReason::IoRead {
                pc: pc_before,
                port,
            });
        }
        // XTHL
        0xE3 => {
            let top = mem.read_u16(cpu.sp);
            let hl = cpu.get_pair(RegPair::HL);
            mem.write_u16(cpu.sp, hl);
            cpu.set_pair(RegPair::HL, top);
            cycles = 16;
        }
        // PCHL
        0xE9 => {
            cpu.pc = cpu.get_pair(RegPair::HL);
            cycles = 6;
        }
        // XCHG
        0xEB => {
            let hl = cpu.get_pair(RegPair::HL);
            let de = cpu.get_pair(RegPair::DE);
            cpu.set_pair(RegPair::HL, de);
            cpu.set_pair(RegPair::DE, hl);
        }
        // DI
        0xF3 => {
            cpu.ie = false;
        }
        // SPHL
        0xF9 => {
            cpu.sp = cpu.get_pair(RegPair::HL);
            cycles = 6;
        }
        // EI
        0xFB => {
            cpu.ie = true;
        }
        // Anything left is an undefined opcode (8085 has a handful of
        // "officially undefined" slots like 0x08, 0x10, 0x18, 0x28,
        // 0x38, 0xCB, 0xD9, 0xDD, 0xED, 0xFD). Real silicon executes
        // these as NOP on most variants — surface as a stop so the IDE
        // can highlight student bugs.
        _ => {
            return Err(StopReason::InvalidOpcode {
                pc: pc_before,
                opcode,
            });
        }
    }

    Ok(StepRecord {
        pc_before,
        pc_after: cpu.pc,
        opcode,
        cycles,
    })
}

/// Run until HLT, breakpoint, IO trap, invalid opcode, or `budget`
/// instructions are consumed (whichever comes first).
///
/// Returning `BudgetExhausted` is how the web IDE keeps infinite loops
/// from freezing the browser: drive `run()` in a Web Worker with a
/// small budget per chunk, yield to the event loop between chunks, and
/// surface an "Abort?" button after a couple of chunks have passed
/// without progress toward HLT.
pub fn run(cpu: &mut Cpu, mem: &mut Memory, budget: u64, breakpoints: &[u16]) -> StopReason {
    run_with_cycles(cpu, mem, budget, breakpoints).0
}

/// Same as `run`, but also returns the total cycle count actually
/// consumed (sum of the `cycles` field of every `StepRecord` produced
/// during the run). The IDE uses this for an accurate cycle counter
/// during a Run — previously it charged a flat 5 cycles per chunk-op
/// which was way off for memory-touching instructions.
pub fn run_with_cycles(
    cpu: &mut Cpu,
    mem: &mut Memory,
    budget: u64,
    breakpoints: &[u16],
) -> (StopReason, u64) {
    let mut cycles: u64 = 0;
    for _ in 0..budget {
        if breakpoints.contains(&cpu.pc) {
            return (StopReason::Breakpoint(cpu.pc), cycles);
        }
        match step(cpu, mem) {
            Ok(rec) => cycles += u64::from(rec.cycles),
            Err(stop) => return (stop, cycles),
        }
    }
    (StopReason::BudgetExhausted, cycles)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: load `bytes` at `origin`, set PC to `origin`, run with
    /// a generous budget, and return the CPU state.
    fn run_program(origin: u16, bytes: &[u8]) -> (Cpu, Memory, StopReason) {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(origin, bytes);
        cpu.pc = origin;
        cpu.sp = 0xFFFE; // a safe default stack
        let stop = run(&mut cpu, &mut mem, 100_000, &[]);
        (cpu, mem, stop)
    }

    #[test]
    fn lone_hlt_halts() {
        let (_, _, stop) = run_program(0x2000, &[0x76]);
        assert_eq!(stop, StopReason::Halted);
    }

    #[test]
    fn mvi_then_hlt_sets_register() {
        let (cpu, _, _) = run_program(0x2000, &[0x3E, 0x42, 0x76]); // MVI A,42H ; HLT
        assert_eq!(cpu.a, 0x42);
    }

    #[test]
    fn add_two_8bit_numbers() {
        // GfG example #1 in machine code, with inputs preloaded.
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.write(0x2050, 0x12);
        mem.write(0x2051, 0x34);
        mem.load(
            0x2000,
            &[
                0x3A, 0x50, 0x20, // LDA 2050H
                0x47, // MOV B, A
                0x3A, 0x51, 0x20, // LDA 2051H
                0x80, // ADD B
                0x32, 0x50, 0x30, // STA 3050H
                0x76, // HLT
            ],
        );
        cpu.pc = 0x2000;
        cpu.sp = 0xFFFE;
        let stop = run(&mut cpu, &mut mem, 1000, &[]);
        assert_eq!(stop, StopReason::Halted);
        assert_eq!(mem.read(0x3050), 0x46);
    }

    #[test]
    fn jmp_loops_until_budget() {
        // ORG 2000H ; JMP 2000H — should exhaust the budget.
        let (_, _, stop) = run_program(0x2000, &[0xC3, 0x00, 0x20]);
        assert_eq!(stop, StopReason::BudgetExhausted);
    }

    #[test]
    fn call_ret_round_trip() {
        // 2000: CALL 2010H ; HLT
        // 2010: MVI A, 99H ; RET
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(0x2000, &[0xCD, 0x10, 0x20, 0x76]);
        mem.load(0x2010, &[0x3E, 0x99, 0xC9]);
        cpu.pc = 0x2000;
        cpu.sp = 0xFFFE;
        let stop = run(&mut cpu, &mut mem, 1000, &[]);
        assert_eq!(stop, StopReason::Halted);
        assert_eq!(cpu.a, 0x99);
        // SP must be restored after RET
        assert_eq!(cpu.sp, 0xFFFE);
    }

    #[test]
    fn dcr_after_80h_matches_documented_flags() {
        // Regression for GNUSim8085 #46.
        // MVI A, 80H ; DCR A ; HLT
        let (cpu, _, _) = run_program(0x2000, &[0x3E, 0x80, 0x3D, 0x76]);
        assert_eq!(cpu.a, 0x7F);
        assert!(!cpu.flags.s);
        assert!(cpu.flags.ac);
    }

    #[test]
    fn adc_propagates_carry() {
        // Regression for GNUSim8085 #71.
        // STC ; MVI A, 0FFH ; ACI 0 ; HLT
        // After ADC with cy=1, result=00 and cy=1.
        let (cpu, _, _) = run_program(
            0x2000,
            &[
                0x37, // STC
                0x3E, 0xFF, // MVI A, 0FFH
                0xCE, 0x00, // ACI 0
                0x76, // HLT
            ],
        );
        assert_eq!(cpu.a, 0x00);
        assert!(cpu.flags.cy);
        assert!(cpu.flags.z);
    }

    #[test]
    fn dad_only_touches_cy() {
        // Regression for sim8085 #45.
        // Set S/Z/AC/P artificially via CMP A,A, then DAD H of 8000H+8000H.
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        cpu.flags = Flags {
            s: true,
            z: true,
            ac: true,
            p: true,
            cy: false,
        };
        cpu.set_pair(RegPair::HL, 0x8000);
        mem.load(0x2000, &[0x29, 0x76]); // DAD H ; HLT
        cpu.pc = 0x2000;
        cpu.sp = 0xFFFE;
        let _ = run(&mut cpu, &mut mem, 100, &[]);
        assert_eq!(cpu.get_pair(RegPair::HL), 0x0000);
        assert!(cpu.flags.cy);
        // Other flags must survive untouched.
        assert!(cpu.flags.s);
        assert!(cpu.flags.z);
        assert!(cpu.flags.ac);
        assert!(cpu.flags.p);
    }

    #[test]
    fn invalid_opcode_surfaces_stop() {
        // 0xCB is undefined on 8085 (it's a Z80 prefix byte).
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(0x2000, &[0xCB]);
        cpu.pc = 0x2000;
        let stop = step(&mut cpu, &mut mem);
        assert_eq!(
            stop,
            Err(StopReason::InvalidOpcode {
                pc: 0x2000,
                opcode: 0xCB
            })
        );
    }

    #[test]
    fn run_with_cycles_accumulates_per_instruction() {
        // MVI A,d8 (7) + ADD B (4) = 11 cycles. The terminating HLT
        // returns Err(Halted) from step() before we can record a
        // StepRecord, so its own cycle count is dropped — that's an
        // intentional simplification: programs that need T-state
        // accuracy don't end with HLT anyway, they end with the
        // last "real" instruction and HLT is bookkeeping.
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(0x2000, &[0x3E, 0x42, 0x80, 0x76]); // MVI A,42H ; ADD B ; HLT
        cpu.pc = 0x2000;
        let (stop, cycles) = run_with_cycles(&mut cpu, &mut mem, 100, &[]);
        assert_eq!(stop, StopReason::Halted);
        assert_eq!(
            cycles, 11,
            "MVI(7) + ADD(4); HLT cycles intentionally dropped"
        );
    }

    #[test]
    fn rst_pushes_return_jumps_to_vector() {
        // ORG 2000H : RST 5 ; HLT
        // RST 5 vector is 0x0028. Should push return address (2001),
        // then jump to 0x0028 (which contains 0x00 → NOP).
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(0x2000, &[0xEF, 0x76]); // RST 5 ; HLT
        mem.load(0x0028, &[0xC9]); // RET at the vector
        cpu.pc = 0x2000;
        cpu.sp = 0xFFFE;
        let stop = run(&mut cpu, &mut mem, 100, &[]);
        assert_eq!(stop, StopReason::Halted);
    }

    #[test]
    fn fibonacci_first_8_terms() {
        // GfG example #18: ORG 2000H, store 8 terms from 3050H.
        // Source from research §18 (verbatim, then hand-assembled).
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(
            0x2000,
            &[
                0x21, 0x50, 0x30, // LXI H, 3050H
                0x0E, 0x08, // MVI C, 8
                0x06, 0x00, // MVI B, 0
                0x16, 0x01, // MVI D, 1
                0x70, // MOV M, B    ; store 0
                0x23, // INX H
                0x72, // MOV M, D    ; store 1
                // NEXT:
                0x78, // MOV A, B
                0x82, // ADD D
                0x42, // MOV B, D
                0x57, // MOV D, A
                0x23, // INX H
                0x77, // MOV M, A
                0x0D, // DCR C
                0xC2, 0x0C, 0x20, // JNZ NEXT  (NEXT = 200C)
                0x76, // HLT
            ],
        );
        cpu.pc = 0x2000;
        cpu.sp = 0xFFFE;
        let stop = run(&mut cpu, &mut mem, 100_000, &[]);
        assert_eq!(stop, StopReason::Halted);
        // First two seeds + 8 generated terms (the loop writes 8
        // additions after the two seeds, so 10 cells total).
        // Series: 0 1 1 2 3 5 8 13 21 34
        assert_eq!(mem.read(0x3050), 0);
        assert_eq!(mem.read(0x3051), 1);
        assert_eq!(mem.read(0x3052), 1);
        assert_eq!(mem.read(0x3053), 2);
        assert_eq!(mem.read(0x3054), 3);
        assert_eq!(mem.read(0x3055), 5);
        assert_eq!(mem.read(0x3056), 8);
        assert_eq!(mem.read(0x3057), 13);
        assert_eq!(mem.read(0x3058), 21);
        assert_eq!(mem.read(0x3059), 34);
    }

    #[test]
    fn budget_exhaustion_returns_bytes() {
        // Tight loop, low budget — must return BudgetExhausted, not
        // hang.
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(0x2000, &[0xC3, 0x00, 0x20]); // JMP 2000H
        cpu.pc = 0x2000;
        let stop = run(&mut cpu, &mut mem, 10, &[]);
        assert_eq!(stop, StopReason::BudgetExhausted);
    }

    #[test]
    fn breakpoint_stops_before_executing() {
        // ORG 2000: MVI A, 11H ; MVI A, 22H ; HLT
        // Set breakpoint at 2002 → A should be 0x11 (first MVI executed,
        // second not).
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load(0x2000, &[0x3E, 0x11, 0x3E, 0x22, 0x76]);
        cpu.pc = 0x2000;
        cpu.sp = 0xFFFE;
        let stop = run(&mut cpu, &mut mem, 100, &[0x2002]);
        assert_eq!(stop, StopReason::Breakpoint(0x2002));
        assert_eq!(cpu.a, 0x11);
    }
}
