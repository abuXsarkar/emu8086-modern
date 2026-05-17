//! 8085 CPU state — register file, flags, and step trampoline.
//!
//! The 8085 register file:
//!   - 7 × 8-bit data registers: A, B, C, D, E, H, L
//!   - Pseudo-register M = `mem[HL]`
//!   - 3 × 16-bit register pairs by convention: BC, DE, HL
//!   - 16-bit SP (stack pointer) and PC (program counter)
//!   - 5-bit flag register: S Z _ AC _ P 1 CY  (the `_` and `1` bits are
//!     hardwired in PSW pack/unpack — we don't model them as state)

use serde::{Deserialize, Serialize};

use crate::mem::Memory;

/// Identifies one of the 8085's 8-bit registers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Reg8 {
    A,
    B,
    C,
    D,
    E,
    H,
    L,
}

/// Identifies one of the three register pairs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RegPair {
    BC,
    DE,
    HL,
    SP,
}

/// Flag bits. Stored as bool fields for clarity; packed/unpacked on
/// `PUSH PSW`/`POP PSW`.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Flags {
    pub s: bool,
    pub z: bool,
    pub ac: bool,
    pub p: bool,
    pub cy: bool,
}

impl Flags {
    /// Pack the flag bits into the upper half of the PSW word.
    /// Layout in the byte (MSB → LSB):
    ///   S  Z  0  AC  0  P  1  CY
    /// The two `0` bits and the fixed `1` bit are constants on real
    /// hardware.
    #[must_use]
    pub fn to_byte(self) -> u8 {
        (u8::from(self.s) << 7)
            | (u8::from(self.z) << 6)
            | (u8::from(self.ac) << 4)
            | (u8::from(self.p) << 2)
            | 0x02
            | u8::from(self.cy)
    }

    /// Unpack a byte (as written by `PUSH PSW`) back into a `Flags`.
    /// The fixed bits are simply ignored.
    pub fn from_byte(byte: u8) -> Self {
        Self {
            s: (byte & 0x80) != 0,
            z: (byte & 0x40) != 0,
            ac: (byte & 0x10) != 0,
            p: (byte & 0x04) != 0,
            cy: (byte & 0x01) != 0,
        }
    }
}

/// Reasons the CPU may stop executing inside `Cpu::run`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StopReason {
    /// `HLT` executed.
    Halted,
    /// Hit a breakpoint at the given address.
    Breakpoint(u16),
    /// Cycle budget exhausted (the caller passed a max-cycles to `run`).
    /// This is how the web IDE keeps infinite loops from freezing the
    /// browser — execute in budget chunks, yield to the event loop,
    /// surface a "still running… abort?" UI after a couple of chunks.
    BudgetExhausted,
    /// Undefined opcode reached (real silicon executes these as NOPs;
    /// we surface as a stop so the IDE can highlight student bugs).
    InvalidOpcode { pc: u16, opcode: u8 },
    /// `IN <port>` was attempted (M0 has no IO).
    IoRead { pc: u16, port: u8 },
    /// `OUT <port>` was attempted (M0 has no IO).
    IoWrite { pc: u16, port: u8, value: u8 },
}

/// One step of the CPU — what changed, for the web IDE's step-record
/// timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepRecord {
    pub pc_before: u16,
    pub pc_after: u16,
    pub opcode: u8,
    pub cycles: u8,
}

/// The 8085 CPU state.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Cpu {
    pub a: u8,
    pub b: u8,
    pub c: u8,
    pub d: u8,
    pub e: u8,
    pub h: u8,
    pub l: u8,
    pub sp: u16,
    pub pc: u16,
    pub flags: Flags,
    /// Interrupt enable flip-flop (set by EI, cleared by DI).
    pub ie: bool,
    /// Interrupt mask byte (for SIM/RIM).
    pub im: u8,
}

impl Cpu {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Read a register by enum tag.
    #[must_use]
    pub fn get_reg8(&self, r: Reg8) -> u8 {
        match r {
            Reg8::A => self.a,
            Reg8::B => self.b,
            Reg8::C => self.c,
            Reg8::D => self.d,
            Reg8::E => self.e,
            Reg8::H => self.h,
            Reg8::L => self.l,
        }
    }

    /// Write a register by enum tag.
    pub fn set_reg8(&mut self, r: Reg8, value: u8) {
        match r {
            Reg8::A => self.a = value,
            Reg8::B => self.b = value,
            Reg8::C => self.c = value,
            Reg8::D => self.d = value,
            Reg8::E => self.e = value,
            Reg8::H => self.h = value,
            Reg8::L => self.l = value,
        }
    }

    /// Read a register pair as a 16-bit value (high byte first).
    #[must_use]
    pub fn get_pair(&self, p: RegPair) -> u16 {
        match p {
            RegPair::BC => u16::from(self.b) << 8 | u16::from(self.c),
            RegPair::DE => u16::from(self.d) << 8 | u16::from(self.e),
            RegPair::HL => u16::from(self.h) << 8 | u16::from(self.l),
            RegPair::SP => self.sp,
        }
    }

    /// Write a register pair (splits high/low into the two component
    /// 8-bit registers, or assigns SP).
    pub fn set_pair(&mut self, p: RegPair, value: u16) {
        let hi = (value >> 8) as u8;
        let lo = value as u8;
        match p {
            RegPair::BC => {
                self.b = hi;
                self.c = lo;
            }
            RegPair::DE => {
                self.d = hi;
                self.e = lo;
            }
            RegPair::HL => {
                self.h = hi;
                self.l = lo;
            }
            RegPair::SP => self.sp = value,
        }
    }

    /// Read the byte at `[HL]` — the "M" pseudo-register.
    #[must_use]
    pub fn get_m(&self, mem: &Memory) -> u8 {
        mem.read(self.get_pair(RegPair::HL))
    }

    /// Write a byte to `[HL]`.
    pub fn set_m(&mut self, mem: &mut Memory, value: u8) {
        mem.write(self.get_pair(RegPair::HL), value);
    }

    /// Pack A + flags into the PSW word for `PUSH PSW`.
    #[must_use]
    pub fn psw(&self) -> u16 {
        u16::from(self.a) << 8 | u16::from(self.flags.to_byte())
    }

    /// Unpack a PSW word into A + flags (from `POP PSW`).
    pub fn set_psw(&mut self, word: u16) {
        self.a = (word >> 8) as u8;
        self.flags = Flags::from_byte(word as u8);
    }

    /// Push a 16-bit value to the stack (SP decrements by 2; high byte
    /// stored at SP-1, low byte at SP-2 per Intel convention).
    pub fn push_word(&mut self, mem: &mut Memory, value: u16) {
        self.sp = self.sp.wrapping_sub(2);
        mem.write_u16(self.sp, value);
    }

    /// Pop a 16-bit value off the stack.
    pub fn pop_word(&mut self, mem: &Memory) -> u16 {
        let value = mem.read_u16(self.sp);
        self.sp = self.sp.wrapping_add(2);
        value
    }

    /// Reset to power-on state: PC = 0, all registers zero, interrupts
    /// disabled.
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_cpu_is_zero() {
        let cpu = Cpu::new();
        assert_eq!(cpu.a, 0);
        assert_eq!(cpu.pc, 0);
        assert_eq!(cpu.sp, 0);
        assert!(!cpu.flags.cy);
    }

    #[test]
    fn pair_read_write_round_trips() {
        let mut cpu = Cpu::new();
        cpu.set_pair(RegPair::HL, 0xBEEF);
        assert_eq!(cpu.h, 0xBE);
        assert_eq!(cpu.l, 0xEF);
        assert_eq!(cpu.get_pair(RegPair::HL), 0xBEEF);
    }

    #[test]
    fn flags_byte_round_trip() {
        let f = Flags { s: true, z: false, ac: true, p: true, cy: true };
        let b = f.to_byte();
        let parsed = Flags::from_byte(b);
        assert_eq!(parsed.s, f.s);
        assert_eq!(parsed.z, f.z);
        assert_eq!(parsed.ac, f.ac);
        assert_eq!(parsed.p, f.p);
        assert_eq!(parsed.cy, f.cy);
    }

    #[test]
    fn flags_byte_has_constant_bit_one() {
        // Bit 1 is hardwired to 1 on real 8085 hardware.
        let f = Flags::default();
        assert_eq!(f.to_byte() & 0x02, 0x02);
    }

    #[test]
    fn psw_packs_a_in_high_byte() {
        let mut cpu = Cpu::new();
        cpu.a = 0x42;
        cpu.flags.cy = true;
        let p = cpu.psw();
        assert_eq!(p >> 8, 0x42);
        assert!(p & 0x01 != 0); // CY in bit 0 of low byte
    }

    #[test]
    fn push_pop_round_trip() {
        let mut cpu = Cpu::new();
        let mut mem = Memory::new();
        cpu.sp = 0x4000;
        cpu.push_word(&mut mem, 0xCAFE);
        assert_eq!(cpu.sp, 0x3FFE);
        let v = cpu.pop_word(&mem);
        assert_eq!(v, 0xCAFE);
        assert_eq!(cpu.sp, 0x4000);
    }
}
