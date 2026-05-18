//! 8051 CPU state — accumulator, B, DPTR, SP, PC, and the PSW
//! (which doubles as the active-bank selector via RS0/RS1).
//!
//! Working registers R0–R7 live in IDATA at offsets 0x00–0x1F. The
//! active bank's R0 is at `IDATA[8 * RS_field + 0]`. The executor
//! computes the offset on each access rather than caching it, which
//! keeps the bank-switch instruction (`MOV PSW, #08H`) trivially
//! correct.

use serde::{Deserialize, Serialize};

use crate::mem::Memory;
use crate::sfr;

/// PSW flag layout: CY AC F0 RS1 RS0 OV — P (low bit, parity).
///
/// Standard bit positions:
///   bit 7 CY  — carry
///   bit 6 AC  — auxiliary carry (DA A)
///   bit 5 F0  — user flag 1
///   bit 4 RS1 — register-bank select bit 1
///   bit 3 RS0 — register-bank select bit 0
///   bit 2 OV  — overflow
///   bit 1 F1  — user flag 2 (8052+; we model it)
///   bit 0 P   — parity (auto-updated by the executor)
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Psw {
    pub cy: bool,
    pub ac: bool,
    pub f0: bool,
    pub rs1: bool,
    pub rs0: bool,
    pub ov: bool,
    pub f1: bool,
    pub p: bool,
}

impl Psw {
    #[must_use]
    pub fn to_byte(self) -> u8 {
        (u8::from(self.cy) << 7)
            | (u8::from(self.ac) << 6)
            | (u8::from(self.f0) << 5)
            | (u8::from(self.rs1) << 4)
            | (u8::from(self.rs0) << 3)
            | (u8::from(self.ov) << 2)
            | (u8::from(self.f1) << 1)
            | u8::from(self.p)
    }

    #[must_use]
    pub fn from_byte(byte: u8) -> Self {
        Self {
            cy: byte & 0x80 != 0,
            ac: byte & 0x40 != 0,
            f0: byte & 0x20 != 0,
            rs1: byte & 0x10 != 0,
            rs0: byte & 0x08 != 0,
            ov: byte & 0x04 != 0,
            f1: byte & 0x02 != 0,
            p: byte & 0x01 != 0,
        }
    }

    /// Active register bank (0..3) encoded by RS1:RS0.
    #[must_use]
    pub fn bank(&self) -> u8 {
        u8::from(self.rs1) << 1 | u8::from(self.rs0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StopReason {
    /// HLT-equivalent — there's no HLT on the 8051; we use NOP at PC
    /// 0x0000 after wraparound, or any `SJMP $` (jump-to-self) as a
    /// "stop" marker. The IDE drives execution with a budget and
    /// treats budget-exhausted or self-jump as natural endpoints.
    SelfJump(u16),
    /// Hit a breakpoint at the given address.
    Breakpoint(u16),
    /// Cycle budget exhausted.
    BudgetExhausted,
    /// Undefined opcode.
    InvalidOpcode { pc: u16, opcode: u8 },
}

/// One step record for the IDE's timeline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StepRecord {
    pub pc_before: u16,
    pub pc_after: u16,
    pub opcode: u8,
    pub cycles: u8,
}

/// The 8051 CPU state. R0–R7 live in IDATA via the active bank, so
/// this struct only holds the registers that don't have a memory
/// home: A (also at SFR ACC), B (SFR B), DPTR (split into DPH/DPL
/// SFRs), SP (SFR), PC, and the unpacked PSW.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cpu {
    pub a: u8,
    pub b: u8,
    pub dptr: u16,
    pub sp: u8,
    pub pc: u16,
    pub psw: Psw,
    /// 256 IO port-style activity log entries — same shape as the
    /// 8085's so the web IDE's device polling code is reusable.
    pub io_log: Vec<(u8, u8)>,
    /// Active interrupt-service-routine nesting. The 8051 has two
    /// priority levels (high and low). A high-priority ISR can
    /// preempt a low-priority one; nothing preempts a high. RETI
    /// clears the topmost set flag. `[low, high]`.
    pub isr_active: [bool; 2],
}

impl Cpu {
    #[must_use]
    pub fn new() -> Self {
        Self {
            a: 0,
            b: 0,
            dptr: 0,
            sp: 0x07, // 8051 reset value
            pc: 0,
            psw: Psw::default(),
            io_log: Vec::new(),
            isr_active: [false, false],
        }
    }

    /// Read working register Rn of the currently-active bank.
    #[must_use]
    pub fn r(&self, mem: &Memory, n: u8) -> u8 {
        let base = self.psw.bank() * 8;
        mem.idata_read(base + (n & 0x7))
    }

    pub fn set_r(&mut self, mem: &mut Memory, n: u8, value: u8) {
        let base = self.psw.bank() * 8;
        mem.idata_write(base + (n & 0x7), value);
    }

    /// Synchronise the on-chip SFR mirror with the unpacked Psw + A/B
    /// + DPTR + SP. Called by the executor whenever it commits a step
    /// so direct-addressed reads of `ACC`, `B`, etc. observe the
    /// current values.
    pub fn sync_sfrs(&self, mem: &mut Memory) {
        mem.idata_write(sfr::ACC.0, self.a);
        mem.idata_write(sfr::B.0, self.b);
        mem.idata_write(sfr::DPL.0, (self.dptr & 0xFF) as u8);
        mem.idata_write(sfr::DPH.0, (self.dptr >> 8) as u8);
        mem.idata_write(sfr::SP.0, self.sp);
        mem.idata_write(sfr::PSW.0, self.psw.to_byte());
    }

    /// Inverse of sync_sfrs — pulls SFR bytes that the program may
    /// have written via `MOV PSW, #...` back into the unpacked state.
    pub fn pull_sfrs(&mut self, mem: &Memory) {
        self.a = mem.idata_read(sfr::ACC.0);
        self.b = mem.idata_read(sfr::B.0);
        self.dptr =
            u16::from(mem.idata_read(sfr::DPL.0)) | (u16::from(mem.idata_read(sfr::DPH.0)) << 8);
        self.sp = mem.idata_read(sfr::SP.0);
        self.psw = Psw::from_byte(mem.idata_read(sfr::PSW.0));
    }
}

impl Default for Cpu {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_cpu_has_reset_state() {
        let cpu = Cpu::new();
        assert_eq!(cpu.a, 0);
        assert_eq!(cpu.b, 0);
        assert_eq!(cpu.dptr, 0);
        assert_eq!(cpu.sp, 0x07);
        assert_eq!(cpu.pc, 0);
    }

    #[test]
    fn psw_round_trip() {
        let p = Psw {
            cy: true,
            ac: false,
            f0: true,
            rs1: true,
            rs0: false,
            ov: true,
            f1: false,
            p: true,
        };
        assert_eq!(Psw::from_byte(p.to_byte()).to_byte(), p.to_byte());
    }

    #[test]
    fn psw_rs_bits_select_bank() {
        let mut p = Psw::default();
        assert_eq!(p.bank(), 0);
        p.rs0 = true;
        assert_eq!(p.bank(), 1);
        p.rs1 = true;
        assert_eq!(p.bank(), 3);
        p.rs0 = false;
        assert_eq!(p.bank(), 2);
    }

    #[test]
    fn r_n_reads_from_active_bank() {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        // Write 0xAA into R3 of bank 0 (byte 0x03 of IDATA).
        mem.idata_write(0x03, 0xAA);
        // Bank 1's R3 lives at byte 0x0B.
        mem.idata_write(0x0B, 0xBB);
        assert_eq!(cpu.r(&mem, 3), 0xAA);
        cpu.psw.rs0 = true; // switch to bank 1
        assert_eq!(cpu.r(&mem, 3), 0xBB);
    }

    #[test]
    fn sync_then_pull_round_trips_state() {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        cpu.a = 0x42;
        cpu.b = 0x99;
        cpu.dptr = 0xBEEF;
        cpu.sp = 0x7F;
        cpu.psw.cy = true;
        cpu.psw.ov = true;
        cpu.sync_sfrs(&mut mem);

        let mut cpu2 = Cpu::new();
        cpu2.pull_sfrs(&mem);
        assert_eq!(cpu2.a, 0x42);
        assert_eq!(cpu2.b, 0x99);
        assert_eq!(cpu2.dptr, 0xBEEF);
        assert_eq!(cpu2.sp, 0x7F);
        assert!(cpu2.psw.cy);
        assert!(cpu2.psw.ov);
    }
}
