//! 8051 instruction decoder + executor.
//!
//! Single entry point: `step(cpu, mem) -> Result<StepRecord, StopReason>`.
//! Each call fetches one instruction at `cpu.pc` from CODE space,
//! advances PC by 1/2/3 bytes, mutates `cpu` and `mem` per the ISA,
//! and returns a StepRecord or a StopReason.
//!
//! The 8051 ISA is irregular — opcodes are organised in groups but
//! many operands share opcode patterns. We dispatch on the top nibble
//! plus minor disambiguation rather than a flat 256-arm match, which
//! keeps the file readable.
//!
//! Memory spaces:
//!   - CODE  — program memory, read-only at runtime (MOVC A,@A+DPTR)
//!   - IDATA — internal RAM (00H-7FH) + SFR aliasing (80H-FFH via
//!             direct addressing)
//!   - XDATA — external RAM (MOVX A,@DPTR | A,@Ri)
//!
//! Bit operands address either bytes 0x20-0x2F (low 128 bits) or
//! 8-aligned SFRs (high 128 bits); see crate::sfr::bit_to_byte.

use crate::cpu::{Cpu, Psw, StepRecord, StopReason};
use crate::mem::Memory;
use crate::sfr;

/// Fetch the byte at `cpu.pc` from CODE space and advance PC.
fn fetch_byte(cpu: &mut Cpu, mem: &Memory) -> u8 {
    let b = mem.code_read(cpu.pc);
    cpu.pc = cpu.pc.wrapping_add(1);
    b
}

/// Fetch a 16-bit immediate (big-endian on the 8051 — high byte first,
/// the only Intel chip that puts it that way).
fn fetch_word_be(cpu: &mut Cpu, mem: &Memory) -> u16 {
    let hi = fetch_byte(cpu, mem);
    let lo = fetch_byte(cpu, mem);
    (u16::from(hi) << 8) | u16::from(lo)
}

/// Sign-extend an 8-bit relative offset and add to PC.
fn rel_target(cpu: &Cpu, rel: u8) -> u16 {
    let off = rel as i8 as i16;
    (cpu.pc as i32 + off as i32) as u16
}

/// Look up an active-bank Rn register address in IDATA.
fn r_addr(cpu: &Cpu, n: u8) -> u8 {
    cpu.psw.bank() * 8 + (n & 0x7)
}

/// Read a *direct*-addressed byte. Handles SFR aliasing so direct
/// 0xE0 reads cpu.a, direct 0x82/0x83 read DPL/DPH from the cached
/// SFR mirror, etc. The mirror is synced before each step.
fn read_direct(_cpu: &Cpu, mem: &Memory, addr: u8) -> u8 {
    mem.idata_read(addr)
}

fn write_direct(cpu: &mut Cpu, mem: &mut Memory, addr: u8, value: u8) {
    mem.idata_write(addr, value);
    // If a direct write touched an SFR we model in `Cpu`, pull it.
    match addr {
        a if a == sfr::ACC.0 => cpu.a = value,
        a if a == sfr::B.0 => cpu.b = value,
        a if a == sfr::DPL.0 => cpu.dptr = (cpu.dptr & 0xFF00) | u16::from(value),
        a if a == sfr::DPH.0 => cpu.dptr = (cpu.dptr & 0x00FF) | (u16::from(value) << 8),
        a if a == sfr::SP.0 => cpu.sp = value,
        a if a == sfr::PSW.0 => cpu.psw = Psw::from_byte(value),
        _ => {}
    }
    // Log port writes (P0..P3) for the IDE's device pane. Using the
    // raw SFR addresses as the "port" id keeps the channel shape the
    // same as the 8085 (port, byte) io_log entries.
    if matches!(addr, 0x80 | 0x90 | 0xA0 | 0xB0) {
        cpu.io_log.push((addr, value));
    }
    // SBUF write — model the "transmission complete" UART flag instantly
    // and surface the byte on io_log so the Screen device renders it
    // as serial output. Real hardware would clock the bit out over
    // ~10 timer-1 reloads; for student labs the "instant TX" approximation
    // is fine. TI must be cleared by software (no auto-clear) so a
    // serial ISR fires once per byte.
    if addr == sfr::SBUF.0 {
        cpu.io_log.push((sfr::SBUF.0, value));
        let scon = mem.idata_read(sfr::SCON.0);
        mem.idata_write(sfr::SCON.0, scon | sfr::SCON_TI);
    }
}

/// Read a bit. Returns true if set.
fn read_bit(_cpu: &Cpu, mem: &Memory, bit: u8) -> bool {
    let (byte_addr, b) = sfr::bit_to_byte(bit);
    (mem.idata_read(byte_addr) >> b) & 1 == 1
}

fn write_bit(cpu: &mut Cpu, mem: &mut Memory, bit: u8, value: bool) {
    let (byte_addr, b) = sfr::bit_to_byte(bit);
    let mask = 1u8 << b;
    let cur = mem.idata_read(byte_addr);
    let new = if value { cur | mask } else { cur & !mask };
    write_direct(cpu, mem, byte_addr, new);
}

/// Update the parity bit of PSW from the current A. Hardware does
/// this after every A-touching op; we just call it from the same
/// places.
fn update_parity(cpu: &mut Cpu) {
    cpu.psw.p = cpu.a.count_ones() % 2 == 1;
}

/// 8-bit ADD with CY/AC/OV flag computation per the 8051 reference.
fn add8(cpu: &mut Cpu, lhs: u8, rhs: u8, carry_in: bool) -> u8 {
    let cy = u16::from(carry_in);
    let wide = u16::from(lhs) + u16::from(rhs) + cy;
    let result = wide as u8;
    cpu.psw.cy = wide > 0xFF;
    cpu.psw.ac = ((lhs & 0x0F) + (rhs & 0x0F) + cy as u8) > 0x0F;
    // OV: carry into bit 7 differs from carry out of bit 7.
    let c6 = ((lhs & 0x7F) + (rhs & 0x7F) + cy as u8) > 0x7F;
    cpu.psw.ov = c6 != cpu.psw.cy;
    result
}

/// 8-bit SUBB (subtract with borrow). Sets CY/AC/OV per the datasheet.
fn subb8(cpu: &mut Cpu, lhs: u8, rhs: u8, borrow_in: bool) -> u8 {
    let bin = u16::from(borrow_in);
    let wide = (u16::from(lhs))
        .wrapping_sub(u16::from(rhs))
        .wrapping_sub(bin);
    let result = wide as u8;
    cpu.psw.cy = u16::from(lhs) < u16::from(rhs) + bin;
    cpu.psw.ac = (lhs & 0x0F) < (rhs & 0x0F) + bin as u8;
    // OV: borrow into bit 7 differs from borrow out of bit 7.
    let b6 = (lhs & 0x7F) < (rhs & 0x7F) + bin as u8;
    cpu.psw.ov = b6 != cpu.psw.cy;
    result
}

/// Decimal-adjust the accumulator following ADD/ADDC of BCD values.
fn da(cpu: &mut Cpu) {
    let mut a = cpu.a;
    if (a & 0x0F) > 9 || cpu.psw.ac {
        let (r, c) = a.overflowing_add(0x06);
        a = r;
        if c {
            cpu.psw.cy = true;
        }
    }
    if (a & 0xF0) > 0x90 || cpu.psw.cy {
        let (r, c) = a.overflowing_add(0x60);
        a = r;
        if c {
            cpu.psw.cy = true;
        }
    }
    cpu.a = a;
    update_parity(cpu);
}

/// Push a byte onto the stack (8051 SP pre-increments).
fn push(cpu: &mut Cpu, mem: &mut Memory, value: u8) {
    cpu.sp = cpu.sp.wrapping_add(1);
    mem.idata_write(cpu.sp, value);
}

fn pop(cpu: &mut Cpu, mem: &Memory) -> u8 {
    let v = mem.idata_read(cpu.sp);
    cpu.sp = cpu.sp.wrapping_sub(1);
    v
}

/// Execute one instruction.
#[allow(clippy::too_many_lines, clippy::cognitive_complexity)]
pub fn step(cpu: &mut Cpu, mem: &mut Memory) -> Result<StepRecord, StopReason> {
    cpu.sync_sfrs(mem);

    // Before fetching the next opcode, see if an enabled, higher-
    // priority interrupt is pending. If so, the dispatch consumes 2
    // machine cycles (matching real hardware) and the next step()
    // call lands at the ISR vector. We return early with a synthetic
    // StepRecord whose opcode is 0x12 (LCALL) so the IDE's step
    // counter and cycle budget see the dispatch as a single step.
    if let Some((vector, priority)) = pending_interrupt(cpu, mem) {
        let pc_before_isr = cpu.pc;
        push(cpu, mem, (cpu.pc & 0xFF) as u8);
        push(cpu, mem, (cpu.pc >> 8) as u8);
        cpu.pc = vector;
        cpu.isr_active[priority as usize] = true;
        // Hardware auto-clears the timer overflow flag for the vector
        // we just dispatched to. Serial + external flags must be
        // cleared in software.
        match vector {
            sfr::VEC_TIMER0 => {
                let v = mem.idata_read(sfr::TCON.0) & !sfr::TCON_TF0;
                mem.idata_write(sfr::TCON.0, v);
            }
            sfr::VEC_TIMER1 => {
                let v = mem.idata_read(sfr::TCON.0) & !sfr::TCON_TF1;
                mem.idata_write(sfr::TCON.0, v);
            }
            _ => {}
        }
        cpu.sync_sfrs(mem);
        return Ok(StepRecord {
            pc_before: pc_before_isr,
            pc_after: vector,
            opcode: 0x12, // LCALL — for IDE diagnostics
            cycles: 2,
        });
    }

    let pc_before = cpu.pc;
    let opcode = fetch_byte(cpu, mem);
    let mut cycles: u8 = 1;

    match opcode {
        // ── NOP ───────────────────────────────────────────────────
        0x00 => {}

        // ── AJMP page0..page7 (xxx00001) — 11-bit absolute jump ───
        0x01 | 0x21 | 0x41 | 0x61 | 0x81 | 0xA1 | 0xC1 | 0xE1 => {
            let lo = fetch_byte(cpu, mem);
            let page = u16::from(opcode >> 5) & 0x7;
            cpu.pc = (cpu.pc & 0xF800) | (page << 8) | u16::from(lo);
            cycles = 2;
        }

        // ── LJMP addr16 ───────────────────────────────────────────
        0x02 => {
            cpu.pc = fetch_word_be(cpu, mem);
            cycles = 2;
        }

        // ── RR A ──────────────────────────────────────────────────
        0x03 => {
            cpu.a = cpu.a.rotate_right(1);
        }

        // ── INC A ─────────────────────────────────────────────────
        0x04 => {
            cpu.a = cpu.a.wrapping_add(1);
            update_parity(cpu);
        }

        // ── INC direct ────────────────────────────────────────────
        0x05 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d).wrapping_add(1);
            write_direct(cpu, mem, d, v);
        }

        // ── INC @Ri ───────────────────────────────────────────────
        0x06 | 0x07 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr).wrapping_add(1);
            mem.idata_write(addr, v);
        }

        // ── INC Rn ────────────────────────────────────────────────
        0x08..=0x0F => {
            let n = opcode & 0x7;
            let v = cpu.r(mem, n).wrapping_add(1);
            cpu.set_r(mem, n, v);
        }

        // ── JBC bit, rel ──────────────────────────────────────────
        0x10 => {
            let bit = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            if read_bit(cpu, mem, bit) {
                write_bit(cpu, mem, bit, false);
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }

        // ── ACALL page0..page7 (xxx10001) ─────────────────────────
        0x11 | 0x31 | 0x51 | 0x71 | 0x91 | 0xB1 | 0xD1 | 0xF1 => {
            let lo = fetch_byte(cpu, mem);
            // Push PC after the 2-byte ACALL instruction.
            push(cpu, mem, (cpu.pc & 0xFF) as u8);
            push(cpu, mem, (cpu.pc >> 8) as u8);
            let page = u16::from(opcode >> 5) & 0x7;
            cpu.pc = (cpu.pc & 0xF800) | (page << 8) | u16::from(lo);
            cycles = 2;
        }

        // ── LCALL addr16 ──────────────────────────────────────────
        0x12 => {
            let target = fetch_word_be(cpu, mem);
            push(cpu, mem, (cpu.pc & 0xFF) as u8);
            push(cpu, mem, (cpu.pc >> 8) as u8);
            cpu.pc = target;
            cycles = 2;
        }

        // ── RRC A ─────────────────────────────────────────────────
        0x13 => {
            let low = cpu.a & 0x01 != 0;
            cpu.a = (cpu.a >> 1) | (u8::from(cpu.psw.cy) << 7);
            cpu.psw.cy = low;
        }

        // ── DEC A ─────────────────────────────────────────────────
        0x14 => {
            cpu.a = cpu.a.wrapping_sub(1);
            update_parity(cpu);
        }

        // ── DEC direct ────────────────────────────────────────────
        0x15 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d).wrapping_sub(1);
            write_direct(cpu, mem, d, v);
        }

        // ── DEC @Ri ───────────────────────────────────────────────
        0x16 | 0x17 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr).wrapping_sub(1);
            mem.idata_write(addr, v);
        }

        // ── DEC Rn ────────────────────────────────────────────────
        0x18..=0x1F => {
            let n = opcode & 0x7;
            let v = cpu.r(mem, n).wrapping_sub(1);
            cpu.set_r(mem, n, v);
        }

        // ── JB bit, rel ───────────────────────────────────────────
        0x20 => {
            let bit = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            if read_bit(cpu, mem, bit) {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }

        // ── RET ───────────────────────────────────────────────────
        0x22 => {
            let hi = pop(cpu, mem);
            let lo = pop(cpu, mem);
            cpu.pc = (u16::from(hi) << 8) | u16::from(lo);
            cycles = 2;
        }

        // ── RL A ──────────────────────────────────────────────────
        0x23 => {
            cpu.a = cpu.a.rotate_left(1);
        }

        // ── ADD A, #imm ───────────────────────────────────────────
        0x24 => {
            let imm = fetch_byte(cpu, mem);
            cpu.a = add8(cpu, cpu.a, imm, false);
            update_parity(cpu);
        }

        // ── ADD A, direct ─────────────────────────────────────────
        0x25 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d);
            cpu.a = add8(cpu, cpu.a, v, false);
            update_parity(cpu);
        }

        // ── ADD A, @Ri ────────────────────────────────────────────
        0x26 | 0x27 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr);
            cpu.a = add8(cpu, cpu.a, v, false);
            update_parity(cpu);
        }

        // ── ADD A, Rn ─────────────────────────────────────────────
        0x28..=0x2F => {
            let n = opcode & 0x7;
            let v = cpu.r(mem, n);
            cpu.a = add8(cpu, cpu.a, v, false);
            update_parity(cpu);
        }

        // ── JNB bit, rel ──────────────────────────────────────────
        0x30 => {
            let bit = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            if !read_bit(cpu, mem, bit) {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }

        // ── RETI ──────────────────────────────────────────────────
        0x32 => {
            let hi = pop(cpu, mem);
            let lo = pop(cpu, mem);
            cpu.pc = (u16::from(hi) << 8) | u16::from(lo);
            // Clear the highest active priority bit — the ISR that's
            // returning is the most-recently-entered one.
            if cpu.isr_active[1] {
                cpu.isr_active[1] = false;
            } else if cpu.isr_active[0] {
                cpu.isr_active[0] = false;
            }
            cycles = 2;
        }

        // ── RLC A ─────────────────────────────────────────────────
        0x33 => {
            let high = cpu.a & 0x80 != 0;
            cpu.a = (cpu.a << 1) | u8::from(cpu.psw.cy);
            cpu.psw.cy = high;
        }

        // ── ADDC A, #imm ──────────────────────────────────────────
        0x34 => {
            let imm = fetch_byte(cpu, mem);
            cpu.a = add8(cpu, cpu.a, imm, cpu.psw.cy);
            update_parity(cpu);
        }

        // ── ADDC A, direct ────────────────────────────────────────
        0x35 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d);
            cpu.a = add8(cpu, cpu.a, v, cpu.psw.cy);
            update_parity(cpu);
        }

        // ── ADDC A, @Ri / Rn ──────────────────────────────────────
        0x36 | 0x37 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr);
            cpu.a = add8(cpu, cpu.a, v, cpu.psw.cy);
            update_parity(cpu);
        }
        0x38..=0x3F => {
            let n = opcode & 0x7;
            let v = cpu.r(mem, n);
            cpu.a = add8(cpu, cpu.a, v, cpu.psw.cy);
            update_parity(cpu);
        }

        // ── JC rel ────────────────────────────────────────────────
        0x40 => {
            let rel = fetch_byte(cpu, mem);
            if cpu.psw.cy {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }

        // ── ORL direct, A ─────────────────────────────────────────
        0x42 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d) | cpu.a;
            write_direct(cpu, mem, d, v);
        }
        // ── ORL direct, #imm ──────────────────────────────────────
        0x43 => {
            let d = fetch_byte(cpu, mem);
            let imm = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d) | imm;
            write_direct(cpu, mem, d, v);
            cycles = 2;
        }
        // ── ORL A, #imm ───────────────────────────────────────────
        0x44 => {
            let imm = fetch_byte(cpu, mem);
            cpu.a |= imm;
            update_parity(cpu);
        }
        // ── ORL A, direct ─────────────────────────────────────────
        0x45 => {
            let d = fetch_byte(cpu, mem);
            cpu.a |= read_direct(cpu, mem, d);
            update_parity(cpu);
        }
        // ── ORL A, @Ri / Rn ───────────────────────────────────────
        0x46 | 0x47 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            cpu.a |= mem.idata_read(addr);
            update_parity(cpu);
        }
        0x48..=0x4F => {
            let n = opcode & 0x7;
            cpu.a |= cpu.r(mem, n);
            update_parity(cpu);
        }

        // ── JNC rel ───────────────────────────────────────────────
        0x50 => {
            let rel = fetch_byte(cpu, mem);
            if !cpu.psw.cy {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }
        // ── ANL family (0x52-0x5F same shape as ORL) ──────────────
        0x52 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d) & cpu.a;
            write_direct(cpu, mem, d, v);
        }
        0x53 => {
            let d = fetch_byte(cpu, mem);
            let imm = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d) & imm;
            write_direct(cpu, mem, d, v);
            cycles = 2;
        }
        0x54 => {
            let imm = fetch_byte(cpu, mem);
            cpu.a &= imm;
            update_parity(cpu);
        }
        0x55 => {
            let d = fetch_byte(cpu, mem);
            cpu.a &= read_direct(cpu, mem, d);
            update_parity(cpu);
        }
        0x56 | 0x57 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            cpu.a &= mem.idata_read(addr);
            update_parity(cpu);
        }
        0x58..=0x5F => {
            let n = opcode & 0x7;
            cpu.a &= cpu.r(mem, n);
            update_parity(cpu);
        }

        // ── JZ rel ────────────────────────────────────────────────
        0x60 => {
            let rel = fetch_byte(cpu, mem);
            if cpu.a == 0 {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }
        // ── XRL family (0x62-0x6F) ────────────────────────────────
        0x62 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d) ^ cpu.a;
            write_direct(cpu, mem, d, v);
        }
        0x63 => {
            let d = fetch_byte(cpu, mem);
            let imm = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d) ^ imm;
            write_direct(cpu, mem, d, v);
            cycles = 2;
        }
        0x64 => {
            let imm = fetch_byte(cpu, mem);
            cpu.a ^= imm;
            update_parity(cpu);
        }
        0x65 => {
            let d = fetch_byte(cpu, mem);
            cpu.a ^= read_direct(cpu, mem, d);
            update_parity(cpu);
        }
        0x66 | 0x67 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            cpu.a ^= mem.idata_read(addr);
            update_parity(cpu);
        }
        0x68..=0x6F => {
            let n = opcode & 0x7;
            cpu.a ^= cpu.r(mem, n);
            update_parity(cpu);
        }

        // ── JNZ rel ───────────────────────────────────────────────
        0x70 => {
            let rel = fetch_byte(cpu, mem);
            if cpu.a != 0 {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }
        // ── ORL C, bit ────────────────────────────────────────────
        0x72 => {
            let bit = fetch_byte(cpu, mem);
            cpu.psw.cy = cpu.psw.cy || read_bit(cpu, mem, bit);
            cycles = 2;
        }
        // ── JMP @A+DPTR ───────────────────────────────────────────
        0x73 => {
            cpu.pc = cpu.dptr.wrapping_add(u16::from(cpu.a));
            cycles = 2;
        }
        // ── MOV A, #imm ───────────────────────────────────────────
        0x74 => {
            cpu.a = fetch_byte(cpu, mem);
            update_parity(cpu);
        }
        // ── MOV direct, #imm ──────────────────────────────────────
        0x75 => {
            let d = fetch_byte(cpu, mem);
            let imm = fetch_byte(cpu, mem);
            write_direct(cpu, mem, d, imm);
            cycles = 2;
        }
        // ── MOV @Ri, #imm ─────────────────────────────────────────
        0x76 | 0x77 => {
            let r = opcode & 0x1;
            let imm = fetch_byte(cpu, mem);
            let addr = mem.idata_read(r_addr(cpu, r));
            mem.idata_write(addr, imm);
        }
        // ── MOV Rn, #imm ──────────────────────────────────────────
        0x78..=0x7F => {
            let n = opcode & 0x7;
            let imm = fetch_byte(cpu, mem);
            cpu.set_r(mem, n, imm);
        }

        // ── SJMP rel ──────────────────────────────────────────────
        0x80 => {
            let rel = fetch_byte(cpu, mem);
            let target = rel_target(cpu, rel);
            // SJMP $ (jump-to-self, encoded as 80 FE) is the canonical
            // "stop here" idiom on the 8051. But when interrupts are
            // enabled (IE.EA set), real hardware uses SJMP $ as an
            // idle loop waiting for an ISR — flagging it as a stop
            // would prevent the ISR from ever running. Only halt
            // when interrupts are off.
            if target == pc_before && mem.idata_read(sfr::IE.0) & sfr::IE_EA == 0 {
                return Err(StopReason::SelfJump(pc_before));
            }
            cpu.pc = target;
            cycles = 2;
        }
        // ── ANL C, bit ────────────────────────────────────────────
        0x82 => {
            let bit = fetch_byte(cpu, mem);
            cpu.psw.cy = cpu.psw.cy && read_bit(cpu, mem, bit);
            cycles = 2;
        }
        // ── MOVC A, @A+PC ─────────────────────────────────────────
        0x83 => {
            let addr = cpu.pc.wrapping_add(u16::from(cpu.a));
            cpu.a = mem.code_read(addr);
            update_parity(cpu);
            cycles = 2;
        }
        // ── DIV AB ────────────────────────────────────────────────
        0x84 => {
            if let Some(q) = cpu.a.checked_div(cpu.b) {
                cpu.psw.ov = false;
                let r = cpu.a % cpu.b;
                cpu.a = q;
                cpu.b = r;
            } else {
                // Divide-by-zero: A and B undefined per the datasheet;
                // leave them as-is and just raise OV.
                cpu.psw.ov = true;
            }
            cpu.psw.cy = false;
            update_parity(cpu);
            cycles = 4;
        }
        // ── MOV direct, direct ────────────────────────────────────
        0x85 => {
            let src = fetch_byte(cpu, mem);
            let dst = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, src);
            write_direct(cpu, mem, dst, v);
            cycles = 2;
        }
        // ── MOV direct, @Ri ───────────────────────────────────────
        0x86 | 0x87 => {
            let r = opcode & 0x1;
            let dst = fetch_byte(cpu, mem);
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr);
            write_direct(cpu, mem, dst, v);
            cycles = 2;
        }
        // ── MOV direct, Rn ────────────────────────────────────────
        0x88..=0x8F => {
            let n = opcode & 0x7;
            let dst = fetch_byte(cpu, mem);
            let v = cpu.r(mem, n);
            write_direct(cpu, mem, dst, v);
            cycles = 2;
        }

        // ── MOV DPTR, #data16 ─────────────────────────────────────
        0x90 => {
            cpu.dptr = fetch_word_be(cpu, mem);
            cycles = 2;
        }
        // ── MOV bit, C ────────────────────────────────────────────
        0x92 => {
            let bit = fetch_byte(cpu, mem);
            write_bit(cpu, mem, bit, cpu.psw.cy);
            cycles = 2;
        }
        // ── MOVC A, @A+DPTR ───────────────────────────────────────
        0x93 => {
            let addr = cpu.dptr.wrapping_add(u16::from(cpu.a));
            cpu.a = mem.code_read(addr);
            update_parity(cpu);
            cycles = 2;
        }
        // ── SUBB A, #imm ──────────────────────────────────────────
        0x94 => {
            let imm = fetch_byte(cpu, mem);
            cpu.a = subb8(cpu, cpu.a, imm, cpu.psw.cy);
            update_parity(cpu);
        }
        // ── SUBB A, direct ────────────────────────────────────────
        0x95 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d);
            cpu.a = subb8(cpu, cpu.a, v, cpu.psw.cy);
            update_parity(cpu);
        }
        // ── SUBB A, @Ri / Rn ──────────────────────────────────────
        0x96 | 0x97 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr);
            cpu.a = subb8(cpu, cpu.a, v, cpu.psw.cy);
            update_parity(cpu);
        }
        0x98..=0x9F => {
            let n = opcode & 0x7;
            let v = cpu.r(mem, n);
            cpu.a = subb8(cpu, cpu.a, v, cpu.psw.cy);
            update_parity(cpu);
        }

        // ── ORL C, /bit ───────────────────────────────────────────
        0xA0 => {
            let bit = fetch_byte(cpu, mem);
            cpu.psw.cy = cpu.psw.cy || !read_bit(cpu, mem, bit);
            cycles = 2;
        }
        // ── MOV C, bit ────────────────────────────────────────────
        0xA2 => {
            let bit = fetch_byte(cpu, mem);
            cpu.psw.cy = read_bit(cpu, mem, bit);
        }
        // ── INC DPTR ──────────────────────────────────────────────
        0xA3 => {
            cpu.dptr = cpu.dptr.wrapping_add(1);
            cycles = 2;
        }
        // ── MUL AB ────────────────────────────────────────────────
        0xA4 => {
            let prod = u16::from(cpu.a) * u16::from(cpu.b);
            cpu.a = (prod & 0xFF) as u8;
            cpu.b = (prod >> 8) as u8;
            cpu.psw.ov = prod > 0xFF;
            cpu.psw.cy = false;
            update_parity(cpu);
            cycles = 4;
        }
        // ── MOV @Ri, direct ───────────────────────────────────────
        0xA6 | 0xA7 => {
            let r = opcode & 0x1;
            let src = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, src);
            let addr = mem.idata_read(r_addr(cpu, r));
            mem.idata_write(addr, v);
            cycles = 2;
        }
        // ── MOV Rn, direct ────────────────────────────────────────
        0xA8..=0xAF => {
            let n = opcode & 0x7;
            let src = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, src);
            cpu.set_r(mem, n, v);
            cycles = 2;
        }

        // ── ANL C, /bit ───────────────────────────────────────────
        0xB0 => {
            let bit = fetch_byte(cpu, mem);
            cpu.psw.cy = cpu.psw.cy && !read_bit(cpu, mem, bit);
            cycles = 2;
        }
        // ── CPL bit ───────────────────────────────────────────────
        0xB2 => {
            let bit = fetch_byte(cpu, mem);
            let v = !read_bit(cpu, mem, bit);
            write_bit(cpu, mem, bit, v);
        }
        // ── CPL C ─────────────────────────────────────────────────
        0xB3 => {
            cpu.psw.cy = !cpu.psw.cy;
        }
        // ── CJNE A, #imm, rel ─────────────────────────────────────
        0xB4 => {
            let imm = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            cpu.psw.cy = cpu.a < imm;
            if cpu.a != imm {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }
        // ── CJNE A, direct, rel ───────────────────────────────────
        0xB5 => {
            let d = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d);
            cpu.psw.cy = cpu.a < v;
            if cpu.a != v {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }
        // ── CJNE @Ri / Rn, #imm, rel ──────────────────────────────
        0xB6 | 0xB7 => {
            let r = opcode & 0x1;
            let imm = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr);
            cpu.psw.cy = v < imm;
            if v != imm {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }
        0xB8..=0xBF => {
            let n = opcode & 0x7;
            let imm = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            let v = cpu.r(mem, n);
            cpu.psw.cy = v < imm;
            if v != imm {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }

        // ── PUSH direct ───────────────────────────────────────────
        0xC0 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d);
            push(cpu, mem, v);
            cycles = 2;
        }
        // ── CLR bit ───────────────────────────────────────────────
        0xC2 => {
            let bit = fetch_byte(cpu, mem);
            write_bit(cpu, mem, bit, false);
        }
        // ── CLR C ─────────────────────────────────────────────────
        0xC3 => {
            cpu.psw.cy = false;
        }
        // ── SWAP A ────────────────────────────────────────────────
        0xC4 => {
            cpu.a = cpu.a.rotate_left(4);
        }
        // ── XCH A, direct ─────────────────────────────────────────
        0xC5 => {
            let d = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d);
            write_direct(cpu, mem, d, cpu.a);
            cpu.a = v;
            update_parity(cpu);
        }
        // ── XCH A, @Ri / Rn ───────────────────────────────────────
        0xC6 | 0xC7 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr);
            mem.idata_write(addr, cpu.a);
            cpu.a = v;
            update_parity(cpu);
        }
        0xC8..=0xCF => {
            let n = opcode & 0x7;
            let v = cpu.r(mem, n);
            cpu.set_r(mem, n, cpu.a);
            cpu.a = v;
            update_parity(cpu);
        }

        // ── POP direct ────────────────────────────────────────────
        0xD0 => {
            let d = fetch_byte(cpu, mem);
            let v = pop(cpu, mem);
            write_direct(cpu, mem, d, v);
            cycles = 2;
        }
        // ── SETB bit ──────────────────────────────────────────────
        0xD2 => {
            let bit = fetch_byte(cpu, mem);
            write_bit(cpu, mem, bit, true);
        }
        // ── SETB C ────────────────────────────────────────────────
        0xD3 => {
            cpu.psw.cy = true;
        }
        // ── DA A ──────────────────────────────────────────────────
        0xD4 => {
            da(cpu);
        }
        // ── DJNZ direct, rel ──────────────────────────────────────
        0xD5 => {
            let d = fetch_byte(cpu, mem);
            let rel = fetch_byte(cpu, mem);
            let v = read_direct(cpu, mem, d).wrapping_sub(1);
            write_direct(cpu, mem, d, v);
            if v != 0 {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }
        // ── XCHD A, @Ri ───────────────────────────────────────────
        0xD6 | 0xD7 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            let v = mem.idata_read(addr);
            let new_a = (cpu.a & 0xF0) | (v & 0x0F);
            let new_m = (v & 0xF0) | (cpu.a & 0x0F);
            cpu.a = new_a;
            mem.idata_write(addr, new_m);
            update_parity(cpu);
        }
        // ── DJNZ Rn, rel ──────────────────────────────────────────
        0xD8..=0xDF => {
            let n = opcode & 0x7;
            let v = cpu.r(mem, n).wrapping_sub(1);
            let rel = fetch_byte(cpu, mem);
            cpu.set_r(mem, n, v);
            if v != 0 {
                cpu.pc = rel_target(cpu, rel);
            }
            cycles = 2;
        }

        // ── MOVX A, @DPTR ─────────────────────────────────────────
        0xE0 => {
            cpu.a = mem.xdata_read(cpu.dptr);
            cpu.io_log.push((0xFE, cpu.a)); // marker for "XDATA read"
            update_parity(cpu);
            cycles = 2;
        }
        // ── MOVX A, @Ri ───────────────────────────────────────────
        0xE2 | 0xE3 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            cpu.a = mem.xdata_read(u16::from(addr));
            update_parity(cpu);
            cycles = 2;
        }
        // ── CLR A ─────────────────────────────────────────────────
        0xE4 => {
            cpu.a = 0;
            cpu.psw.p = false;
        }
        // ── MOV A, direct ─────────────────────────────────────────
        0xE5 => {
            let d = fetch_byte(cpu, mem);
            cpu.a = read_direct(cpu, mem, d);
            update_parity(cpu);
        }
        // ── MOV A, @Ri / Rn ───────────────────────────────────────
        0xE6 | 0xE7 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            cpu.a = mem.idata_read(addr);
            update_parity(cpu);
        }
        0xE8..=0xEF => {
            let n = opcode & 0x7;
            cpu.a = cpu.r(mem, n);
            update_parity(cpu);
        }

        // ── MOVX @DPTR, A ─────────────────────────────────────────
        0xF0 => {
            mem.xdata_write(cpu.dptr, cpu.a);
            // Log to io_log so devices listening on XDATA addresses
            // can hook in. Encoding: high byte=0xFF marker, byte=A.
            cpu.io_log.push((0xFF, cpu.a));
            cycles = 2;
        }
        // ── MOVX @Ri, A ───────────────────────────────────────────
        0xF2 | 0xF3 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            mem.xdata_write(u16::from(addr), cpu.a);
            cycles = 2;
        }
        // ── CPL A ─────────────────────────────────────────────────
        0xF4 => {
            cpu.a = !cpu.a;
            update_parity(cpu);
        }
        // ── MOV direct, A ─────────────────────────────────────────
        0xF5 => {
            let d = fetch_byte(cpu, mem);
            write_direct(cpu, mem, d, cpu.a);
        }
        // ── MOV @Ri, A / MOV Rn, A ────────────────────────────────
        0xF6 | 0xF7 => {
            let r = opcode & 0x1;
            let addr = mem.idata_read(r_addr(cpu, r));
            mem.idata_write(addr, cpu.a);
        }
        0xF8..=0xFF => {
            let n = opcode & 0x7;
            cpu.set_r(mem, n, cpu.a);
        }

        // Unimplemented opcode — every byte 0x00-0xFF is mapped above
        // in the 8051 ISA, so reaching this is "we missed one".
        #[allow(unreachable_patterns)]
        _ => {
            return Err(StopReason::InvalidOpcode {
                pc: pc_before,
                opcode,
            });
        }
    }

    cpu.sync_sfrs(mem);
    // Advance the timers by however many machine cycles this
    // instruction consumed. Done *after* execution so a write to TR0
    // / TR1 in this instruction takes effect from the next step.
    tick_timers(mem, cycles);
    Ok(StepRecord {
        pc_before,
        pc_after: cpu.pc,
        opcode,
        cycles,
    })
}

/// Advance timers 0 and 1 by `cycles` machine ticks. Sets TF0/TF1
/// in TCON on overflow. Modes:
///   0 — 13-bit (TL low 5 bits + TH all 8 bits)
///   1 — 16-bit (TL + TH cascaded)
///   2 — 8-bit auto-reload (TL counts, TH is reload value)
///   3 — split (T0 only; rarely used in labs, modelled as mode 0 here)
/// External-trigger (GATE) and counter (C/T) modes treat the source
/// as the machine-cycle clock — we have no pin model.
fn tick_timers(mem: &mut Memory, cycles: u8) {
    let tcon = mem.idata_read(sfr::TCON.0);
    let tmod = mem.idata_read(sfr::TMOD.0);

    if tcon & sfr::TCON_TR0 != 0 {
        let mode = tmod & 0x03;
        let (new_lo, new_hi, overflowed) =
            advance_timer(mem.idata_read(sfr::TL0.0), mem.idata_read(sfr::TH0.0), mode, cycles);
        mem.idata_write(sfr::TL0.0, new_lo);
        mem.idata_write(sfr::TH0.0, new_hi);
        if overflowed {
            mem.idata_write(sfr::TCON.0, mem.idata_read(sfr::TCON.0) | sfr::TCON_TF0);
        }
    }
    if tcon & sfr::TCON_TR1 != 0 {
        let mode = (tmod >> 4) & 0x03;
        let (new_lo, new_hi, overflowed) =
            advance_timer(mem.idata_read(sfr::TL1.0), mem.idata_read(sfr::TH1.0), mode, cycles);
        mem.idata_write(sfr::TL1.0, new_lo);
        mem.idata_write(sfr::TH1.0, new_hi);
        if overflowed {
            mem.idata_write(sfr::TCON.0, mem.idata_read(sfr::TCON.0) | sfr::TCON_TF1);
        }
    }
}

/// Advance a single timer's TL/TH pair by `ticks` cycles. Returns
/// the new (TL, TH, did-it-overflow).
fn advance_timer(tl: u8, th: u8, mode: u8, ticks: u8) -> (u8, u8, bool) {
    let mut overflowed = false;
    match mode {
        // Mode 1: 16-bit cascade.
        1 => {
            let current = u32::from(tl) | (u32::from(th) << 8);
            let next = current + u32::from(ticks);
            if next > 0xFFFF {
                overflowed = true;
            }
            let wrapped = (next & 0xFFFF) as u16;
            ((wrapped & 0xFF) as u8, (wrapped >> 8) as u8, overflowed)
        }
        // Mode 2: 8-bit auto-reload — TL counts, TH is reload value.
        2 => {
            let next = u16::from(tl) + u16::from(ticks);
            if next > 0xFF {
                // Reload TL from TH, accounting for ticks-past-overflow.
                let extra = (next - 0x100) as u8;
                (th.wrapping_add(extra), th, true)
            } else {
                (next as u8, th, false)
            }
        }
        // Mode 0 (13-bit) and mode 3 (split — rare; treated as mode 0
        // for T0): TH counts as the high 8 bits, TL counts only its
        // low 5 bits. Overflow when the full 13-bit value wraps.
        _ => {
            let current = u32::from(tl & 0x1F) | (u32::from(th) << 5);
            let next = current + u32::from(ticks);
            if next > 0x1FFF {
                overflowed = true;
            }
            let wrapped = next & 0x1FFF;
            ((wrapped & 0x1F) as u8, (wrapped >> 5) as u8, overflowed)
        }
    }
}

/// Returns `(vector, priority)` for the highest-priority enabled
/// interrupt whose flag is set, if one can be dispatched right now
/// (i.e. it's not blocked by an equal/higher ISR already in flight).
/// Reading order matches real hardware: priority level first, then
/// the fixed natural order INT0 < TIMER0 < INT1 < TIMER1 < SERIAL.
fn pending_interrupt(cpu: &Cpu, mem: &Memory) -> Option<(u16, u8)> {
    let ie = mem.idata_read(sfr::IE.0);
    if ie & sfr::IE_EA == 0 {
        return None;
    }
    let ip = mem.idata_read(sfr::IP.0);
    let tcon = mem.idata_read(sfr::TCON.0);
    let scon = mem.idata_read(sfr::SCON.0);

    // (enable bit, vector, flag-source closure, ip bit).
    // We don't model external interrupts because the IDE has no pin
    // surface — programs that want to fire them set TCON_IE0/IE1
    // by hand. Treat that as a valid source for the dispatch.
    let sources: [(u8, u16, bool); 5] = [
        (sfr::IE_EX0, sfr::VEC_INT0, tcon & sfr::TCON_IE0 != 0),
        (sfr::IE_ET0, sfr::VEC_TIMER0, tcon & sfr::TCON_TF0 != 0),
        (sfr::IE_EX1, sfr::VEC_INT1, tcon & sfr::TCON_IE1 != 0),
        (sfr::IE_ET1, sfr::VEC_TIMER1, tcon & sfr::TCON_TF1 != 0),
        (sfr::IE_ES, sfr::VEC_SERIAL, scon & (sfr::SCON_TI | sfr::SCON_RI) != 0),
    ];

    // High priority pass first, then low. A high ISR blocks both
    // levels; a low ISR blocks only low.
    for target_high in [true, false] {
        if target_high && cpu.isr_active[1] {
            continue; // already in a high ISR — nothing preempts.
        }
        if !target_high && (cpu.isr_active[0] || cpu.isr_active[1]) {
            continue;
        }
        for (i, (enable, vec, flagged)) in sources.iter().enumerate() {
            if !flagged || ie & enable == 0 {
                continue;
            }
            let is_high = ip & enable != 0;
            if is_high != target_high {
                continue;
            }
            let priority = u8::from(is_high);
            // Flag auto-clear (TF0/TF1 cleared by hardware on ISR
            // entry; serial RI/TI must be cleared in software) is
            // done by the caller after dispatch.
            let _ = i;
            return Some((*vec, priority));
        }
    }
    None
}

/// Run until SelfJump, breakpoint, invalid opcode, or budget exhausted.
pub fn run(cpu: &mut Cpu, mem: &mut Memory, budget: u64, breakpoints: &[u16]) -> StopReason {
    for _ in 0..budget {
        if breakpoints.contains(&cpu.pc) {
            return StopReason::Breakpoint(cpu.pc);
        }
        if let Err(stop) = step(cpu, mem) {
            return stop;
        }
    }
    StopReason::BudgetExhausted
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_prog(bytes: &[u8]) -> (Cpu, Memory) {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load_code(0x0000, bytes);
        let _ = run(&mut cpu, &mut mem, 100_000, &[]);
        (cpu, mem)
    }

    #[test]
    fn mov_a_imm_then_self_jump() {
        // MOV A, #42H ; SJMP $
        let (cpu, _) = run_prog(&[0x74, 0x42, 0x80, 0xFE]);
        assert_eq!(cpu.a, 0x42);
    }

    #[test]
    fn add_a_imm() {
        // MOV A, #10 ; ADD A, #20 ; SJMP $
        let (cpu, _) = run_prog(&[0x74, 10, 0x24, 20, 0x80, 0xFE]);
        assert_eq!(cpu.a, 30);
        assert!(!cpu.psw.cy);
    }

    #[test]
    fn add_carry_out() {
        // MOV A, #FFH ; ADD A, #1 ; SJMP $
        let (cpu, _) = run_prog(&[0x74, 0xFF, 0x24, 0x01, 0x80, 0xFE]);
        assert_eq!(cpu.a, 0x00);
        assert!(cpu.psw.cy);
    }

    #[test]
    fn mul_ab() {
        // MOV A, #6 ; MOV B, #7 ; MUL AB ; SJMP $
        // B is SFR 0xF0 — MOV direct, #imm = 75 F0 07
        let (cpu, _) = run_prog(&[0x74, 6, 0x75, 0xF0, 7, 0xA4, 0x80, 0xFE]);
        assert_eq!(cpu.a, 42);
        assert_eq!(cpu.b, 0);
    }

    #[test]
    fn div_ab() {
        // MOV A, #45 ; MOV B, #7 ; DIV AB ; SJMP $ → A=6 r3
        let (cpu, _) = run_prog(&[0x74, 45, 0x75, 0xF0, 7, 0x84, 0x80, 0xFE]);
        assert_eq!(cpu.a, 6);
        assert_eq!(cpu.b, 3);
    }

    #[test]
    fn djnz_loop() {
        // MOV R0, #5 ; (loop:) INC A ; DJNZ R0, loop ; SJMP $
        // R0 is at IDATA 0x00 in bank 0. MOV R0, #imm = 0x78 imm.
        // Loop body: 0x04 (INC A) + 0xD8 rel (DJNZ R0, rel)
        // rel = -2 to jump back to the INC A
        let (cpu, _) = run_prog(&[0x78, 5, 0x04, 0xD8, 0xFD, 0x80, 0xFE]);
        assert_eq!(cpu.a, 5);
    }

    #[test]
    fn setb_clr_bit_via_p1() {
        // SETB P1.0 ; CLR P1.7 ; SJMP $
        // P1 bit 0 = bit address 0x90; P1.7 = 0x97
        let (_, mem) = run_prog(&[0xD2, 0x90, 0xC2, 0x97, 0x80, 0xFE]);
        // P1 is at SFR 0x90; bit 0 should be set, bit 7 should be 0.
        let p1 = mem.idata_read(0x90);
        assert_eq!(p1 & 0x01, 0x01);
        assert_eq!(p1 & 0x80, 0x00);
    }

    #[test]
    fn lcall_ret_round_trip() {
        // 0x0000: LCALL 0x0100   (12 01 00)
        // 0x0003: SJMP $          (80 FE)
        // 0x0100: MOV A, #99H ; RET (74 99 22)
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load_code(0x0000, &[0x12, 0x01, 0x00, 0x80, 0xFE]);
        mem.load_code(0x0100, &[0x74, 0x99, 0x22]);
        let _ = run(&mut cpu, &mut mem, 100, &[]);
        assert_eq!(cpu.a, 0x99);
    }

    #[test]
    fn movx_a_dptr_round_trip() {
        // MOV DPTR, #0x1234 ; MOVX A, @DPTR ; SJMP $
        // Pre-seed XDATA[0x1234] = 0x55.
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.xdata_write(0x1234, 0x55);
        mem.load_code(0x0000, &[0x90, 0x12, 0x34, 0xE0, 0x80, 0xFE]);
        let _ = run(&mut cpu, &mut mem, 100, &[]);
        assert_eq!(cpu.a, 0x55);
        assert_eq!(cpu.dptr, 0x1234);
    }

    #[test]
    fn budget_exhausted_protects_tight_loop() {
        // SJMP -2 (jumps to itself but rel is FE, so SJMP $ — caught
        // by SelfJump). Use AJMP self instead to test BudgetExhausted.
        // AJMP 0x000 — encoding 01 00 (page 0)
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load_code(0x0000, &[0x01, 0x00]); // AJMP 0
        let stop = run(&mut cpu, &mut mem, 50, &[]);
        assert_eq!(stop, StopReason::BudgetExhausted);
    }

    #[test]
    fn timer0_mode1_overflows_and_sets_tf0() {
        // Set TR0 + mode 1; preload TH0=0xFF, TL0=0xF0; advance — the
        // 16 cycles needed for the next 16 ticks should overflow.
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.idata_write(sfr::TMOD.0, 0x01); // T0 mode 1
        mem.idata_write(sfr::TCON.0, sfr::TCON_TR0);
        mem.idata_write(sfr::TH0.0, 0xFF);
        mem.idata_write(sfr::TL0.0, 0xF0);
        // Run a sequence of NOPs (1 cycle each). 16 NOPs = TL overflows
        // past 0xFFFF, sets TF0.
        let nops = vec![0x00u8; 32];
        mem.load_code(0x0030, &nops);
        cpu.pc = 0x0030;
        for _ in 0..16 {
            step(&mut cpu, &mut mem).unwrap();
        }
        assert!(mem.idata_read(sfr::TCON.0) & sfr::TCON_TF0 != 0);
    }

    #[test]
    fn timer0_interrupt_dispatches_and_reti_returns() {
        // Program: MAIN at 0x0030 just NOPs and SJMP $; ISR at the
        // timer0 vector (0x000B) sets a marker byte in IDATA 0x70
        // then RETI. We pre-arm the interrupt by setting TF0 directly
        // (avoids needing to actually tick the timer for the test).
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        // ISR at 0x000B: MOV 70H, #AAH ; RETI  (75 70 AA 32)
        mem.load_code(0x000B, &[0x75, 0x70, 0xAA, 0x32]);
        // Main at 0x0030: NOP ; NOP ; SJMP $   (00 00 80 FE)
        mem.load_code(0x0030, &[0x00, 0x00, 0x80, 0xFE]);
        cpu.pc = 0x0030;
        // Enable timer 0 interrupt + master enable; set TF0 to fire.
        mem.idata_write(sfr::IE.0, sfr::IE_EA | sfr::IE_ET0);
        mem.idata_write(sfr::TCON.0, sfr::TCON_TF0);
        // First step should dispatch (synthetic LCALL → 0x000B), not
        // execute the NOP at 0x0030.
        let r = step(&mut cpu, &mut mem).unwrap();
        assert_eq!(r.pc_after, 0x000B);
        assert!(cpu.isr_active[0]); // dispatched at low priority
        // TF0 should have been auto-cleared.
        assert_eq!(mem.idata_read(sfr::TCON.0) & sfr::TCON_TF0, 0);
        // Run the ISR (MOV ; RETI). Budget = 4 instructions max.
        for _ in 0..4 {
            if let Err(stop) = step(&mut cpu, &mut mem) {
                panic!("ISR died: {stop:?}");
            }
            if !cpu.isr_active[0] {
                break;
            }
        }
        assert_eq!(mem.idata_read(0x70), 0xAA);
        assert!(!cpu.isr_active[0]);
        // PC should be back at the main code (PC=0x0030 was pushed
        // before dispatch, so RETI restored it).
        assert_eq!(cpu.pc, 0x0030);
    }

    #[test]
    fn sbuf_write_sets_ti_and_logs_byte() {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        // MOV SBUF, #41H ; SJMP $   (75 99 41 80 FE)
        mem.load_code(0x0000, &[0x75, 0x99, 0x41, 0x80, 0xFE]);
        let stop = run(&mut cpu, &mut mem, 100, &[]);
        assert!(matches!(stop, StopReason::SelfJump(_)));
        assert!(mem.idata_read(sfr::SCON.0) & sfr::SCON_TI != 0);
        assert!(cpu.io_log.iter().any(|&(p, b)| p == sfr::SBUF.0 && b == 0x41));
    }

    #[test]
    fn serial_interrupt_fires_after_sbuf_write() {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        // ISR at 0x0023: MOV 71H, #55H ; CLR SCON.1 (TI) ; RETI
        //                75 71 55     ;  C2 99             ; 32
        mem.load_code(0x0023, &[0x75, 0x71, 0x55, 0xC2, 0x99, 0x32]);
        // Main at 0x0050: MOV SBUF, #41H ; SJMP $
        // (SJMP $ with EA set is an idle loop — won't trigger
        // SelfJump halt — so we cap the run by budget instead.)
        mem.load_code(0x0050, &[0x75, 0x99, 0x41, 0x80, 0xFE]);
        cpu.pc = 0x0050;
        mem.idata_write(sfr::IE.0, sfr::IE_EA | sfr::IE_ES);
        let _ = run(&mut cpu, &mut mem, 200, &[]);
        assert_eq!(mem.idata_read(0x71), 0x55);
    }

    #[test]
    fn isr_blocked_when_ie_ea_is_clear() {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        mem.load_code(0x0030, &[0x00, 0x80, 0xFE]); // NOP ; SJMP $
        cpu.pc = 0x0030;
        // Per-source enable on, but master disable.
        mem.idata_write(sfr::IE.0, sfr::IE_ET0);
        mem.idata_write(sfr::TCON.0, sfr::TCON_TF0);
        let r = step(&mut cpu, &mut mem).unwrap();
        assert_eq!(r.pc_before, 0x0030); // NOP executed, not dispatched
        assert!(!cpu.isr_active[0]);
        assert!(mem.idata_read(sfr::TCON.0) & sfr::TCON_TF0 != 0); // still set
    }
}
