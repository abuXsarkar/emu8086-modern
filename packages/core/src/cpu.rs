//! 8086 CPU loop. M1 slice 1: register-mode MOV, single-byte flag and
//! halt/no-op opcodes. Memory addressing modes (mod-r/m with [BX+SI]
//! etc.) and the rest of the ISA arrive in subsequent slices.
//!
//! The decoder is intentionally table-light and explicit: each branch is
//! a self-contained read that pulls bytes from `Bus::fetch_*` so we can
//! later snapshot every fetched byte for the trace log.

use crate::mem::{seg_off, Memory};
use crate::{Flags, Registers};

/// 8086 8-bit register codes (REG field of mod-r/m, or low 3 bits of opcode).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reg8 {
    Al,
    Cl,
    Dl,
    Bl,
    Ah,
    Ch,
    Dh,
    Bh,
}

impl Reg8 {
    #[must_use]
    pub const fn from_code(code: u8) -> Self {
        match code & 0b111 {
            0 => Self::Al,
            1 => Self::Cl,
            2 => Self::Dl,
            3 => Self::Bl,
            4 => Self::Ah,
            5 => Self::Ch,
            6 => Self::Dh,
            _ => Self::Bh,
        }
    }
}

/// 8086 16-bit register codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reg16 {
    Ax,
    Cx,
    Dx,
    Bx,
    Sp,
    Bp,
    Si,
    Di,
}

impl Reg16 {
    #[must_use]
    pub const fn from_code(code: u8) -> Self {
        match code & 0b111 {
            0 => Self::Ax,
            1 => Self::Cx,
            2 => Self::Dx,
            3 => Self::Bx,
            4 => Self::Sp,
            5 => Self::Bp,
            6 => Self::Si,
            _ => Self::Di,
        }
    }
}

/// Reason a `step()` returned without making progress past a normal advance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StopReason {
    /// HLT executed.
    Halted,
    /// Decoder hit an opcode that hasn't been implemented yet (M1 will whittle this down).
    Unimplemented { opcode: u8, ip: u16 },
}

/// What one `step` did. Rich enough for the IDE's diff highlighting.
#[derive(Debug, Default, Clone)]
pub struct StepRecord {
    pub bytes_consumed: u8,
    pub mnemonic: &'static str,
    pub stopped: Option<StopReason>,
}

/// The CPU state. Owns its registers and memory; borrows nothing.
#[derive(Debug, Clone)]
pub struct Cpu {
    pub regs: Registers,
    pub mem: Memory,
    pub halted: bool,
}

impl Default for Cpu {
    fn default() -> Self {
        Self::new()
    }
}

impl Cpu {
    #[must_use]
    pub fn new() -> Self {
        Self {
            regs: Registers::default(),
            mem: Memory::new(),
            halted: false,
        }
    }

    /// Initialize a `.com`-style program: code at `cs:0x100`, IP at 0x100, all
    /// segments equal. Matches the emu8086 default template.
    pub fn load_com(&mut self, image: &[u8]) {
        let seg: u16 = 0x0700;
        self.regs = Registers {
            cs: seg,
            ds: seg,
            es: seg,
            ss: seg,
            ip: 0x100,
            sp: 0xFFFE,
            ..Registers::default()
        };
        self.mem.load(seg_off(seg, 0x100), image);
        self.halted = false;
    }

    fn fetch_u8(&mut self) -> u8 {
        let lin = seg_off(self.regs.cs, self.regs.ip);
        let b = self.mem.read_u8(lin);
        self.regs.ip = self.regs.ip.wrapping_add(1);
        b
    }

    fn fetch_u16(&mut self) -> u16 {
        let lo = self.fetch_u8();
        let hi = self.fetch_u8();
        u16::from_le_bytes([lo, hi])
    }

    #[must_use]
    pub fn read_reg8(&self, r: Reg8) -> u8 {
        match r {
            Reg8::Al => self.regs.al(),
            Reg8::Cl => self.regs.cl(),
            Reg8::Dl => self.regs.dl(),
            Reg8::Bl => self.regs.bl(),
            Reg8::Ah => self.regs.ah(),
            Reg8::Ch => self.regs.ch(),
            Reg8::Dh => self.regs.dh(),
            Reg8::Bh => self.regs.bh(),
        }
    }

    pub fn write_reg8(&mut self, r: Reg8, v: u8) {
        match r {
            Reg8::Al => self.regs.set_al(v),
            Reg8::Cl => self.regs.set_cl(v),
            Reg8::Dl => self.regs.set_dl(v),
            Reg8::Bl => self.regs.set_bl(v),
            Reg8::Ah => self.regs.set_ah(v),
            Reg8::Ch => self.regs.set_ch(v),
            Reg8::Dh => self.regs.set_dh(v),
            Reg8::Bh => self.regs.set_bh(v),
        }
    }

    #[must_use]
    pub fn read_reg16(&self, r: Reg16) -> u16 {
        match r {
            Reg16::Ax => self.regs.ax,
            Reg16::Cx => self.regs.cx,
            Reg16::Dx => self.regs.dx,
            Reg16::Bx => self.regs.bx,
            Reg16::Sp => self.regs.sp,
            Reg16::Bp => self.regs.bp,
            Reg16::Si => self.regs.si,
            Reg16::Di => self.regs.di,
        }
    }

    pub fn write_reg16(&mut self, r: Reg16, v: u16) {
        match r {
            Reg16::Ax => self.regs.ax = v,
            Reg16::Cx => self.regs.cx = v,
            Reg16::Dx => self.regs.dx = v,
            Reg16::Bx => self.regs.bx = v,
            Reg16::Sp => self.regs.sp = v,
            Reg16::Bp => self.regs.bp = v,
            Reg16::Si => self.regs.si = v,
            Reg16::Di => self.regs.di = v,
        }
    }

    /// Execute exactly one instruction starting at `cs:ip`.
    ///
    /// Returns a `StepRecord` describing what happened. If the CPU is
    /// halted the record reports it without advancing IP.
    #[allow(clippy::too_many_lines)]
    pub fn step(&mut self) -> StepRecord {
        if self.halted {
            return StepRecord {
                stopped: Some(StopReason::Halted),
                ..Default::default()
            };
        }
        let ip_before = self.regs.ip;
        let op = self.fetch_u8();
        let mut rec = StepRecord::default();

        match op {
            // NOP — XCHG AX,AX
            0x90 => {
                rec.mnemonic = "nop";
            }

            // HLT
            0xF4 => {
                self.halted = true;
                rec.mnemonic = "hlt";
                rec.stopped = Some(StopReason::Halted);
            }

            // Single-byte flag manipulation.
            0xF8 => {
                self.regs.flags.set(Flags::CF, false);
                rec.mnemonic = "clc";
            }
            0xF9 => {
                self.regs.flags.set(Flags::CF, true);
                rec.mnemonic = "stc";
            }
            0xF5 => {
                let cf = self.regs.flags.get(Flags::CF);
                self.regs.flags.set(Flags::CF, !cf);
                rec.mnemonic = "cmc";
            }
            0xFC => {
                self.regs.flags.set(Flags::DF, false);
                rec.mnemonic = "cld";
            }
            0xFD => {
                self.regs.flags.set(Flags::DF, true);
                rec.mnemonic = "std";
            }
            0xFA => {
                self.regs.flags.set(Flags::IF, false);
                rec.mnemonic = "cli";
            }
            0xFB => {
                self.regs.flags.set(Flags::IF, true);
                rec.mnemonic = "sti";
            }

            // MOV reg8, imm8 — opcodes B0..B7
            0xB0..=0xB7 => {
                let r = Reg8::from_code(op - 0xB0);
                let imm = self.fetch_u8();
                self.write_reg8(r, imm);
                rec.mnemonic = "mov";
            }

            // MOV reg16, imm16 — opcodes B8..BF
            0xB8..=0xBF => {
                let r = Reg16::from_code(op - 0xB8);
                let imm = self.fetch_u16();
                self.write_reg16(r, imm);
                rec.mnemonic = "mov";
            }

            // MOV r/m8, r8 (88) and MOV r/m16, r16 (89), register-mode only for now.
            0x88 | 0x89 => {
                let modrm = self.fetch_u8();
                let mode = modrm >> 6;
                let reg = (modrm >> 3) & 0b111;
                let rm = modrm & 0b111;
                if mode != 0b11 {
                    rec.stopped = Some(StopReason::Unimplemented {
                        opcode: op,
                        ip: ip_before,
                    });
                } else if op == 0x88 {
                    let v = self.read_reg8(Reg8::from_code(reg));
                    self.write_reg8(Reg8::from_code(rm), v);
                    rec.mnemonic = "mov";
                } else {
                    let v = self.read_reg16(Reg16::from_code(reg));
                    self.write_reg16(Reg16::from_code(rm), v);
                    rec.mnemonic = "mov";
                }
            }

            // MOV r8, r/m8 (8A) and MOV r16, r/m16 (8B), register-mode only for now.
            0x8A | 0x8B => {
                let modrm = self.fetch_u8();
                let mode = modrm >> 6;
                let reg = (modrm >> 3) & 0b111;
                let rm = modrm & 0b111;
                if mode != 0b11 {
                    rec.stopped = Some(StopReason::Unimplemented {
                        opcode: op,
                        ip: ip_before,
                    });
                } else if op == 0x8A {
                    let v = self.read_reg8(Reg8::from_code(rm));
                    self.write_reg8(Reg8::from_code(reg), v);
                    rec.mnemonic = "mov";
                } else {
                    let v = self.read_reg16(Reg16::from_code(rm));
                    self.write_reg16(Reg16::from_code(reg), v);
                    rec.mnemonic = "mov";
                }
            }

            // MOV r/m, imm — C6 (8-bit) / C7 (16-bit), register form only for now.
            0xC6 | 0xC7 => {
                let modrm = self.fetch_u8();
                let mode = modrm >> 6;
                let rm = modrm & 0b111;
                if mode != 0b11 {
                    rec.stopped = Some(StopReason::Unimplemented {
                        opcode: op,
                        ip: ip_before,
                    });
                } else if op == 0xC6 {
                    let imm = self.fetch_u8();
                    self.write_reg8(Reg8::from_code(rm), imm);
                    rec.mnemonic = "mov";
                } else {
                    let imm = self.fetch_u16();
                    self.write_reg16(Reg16::from_code(rm), imm);
                    rec.mnemonic = "mov";
                }
            }

            other => {
                rec.stopped = Some(StopReason::Unimplemented {
                    opcode: other,
                    ip: ip_before,
                });
            }
        }

        // On Unimplemented we want to leave IP at the start of the offending
        // instruction so a debugger can show what the CPU got stuck on.
        if let Some(StopReason::Unimplemented { .. }) = rec.stopped {
            self.regs.ip = ip_before;
        }
        rec.bytes_consumed = (self.regs.ip.wrapping_sub(ip_before)) as u8;
        rec
    }

    /// Run until the CPU halts, an unimplemented opcode is hit, or `limit`
    /// steps elapse. Returns the number of steps actually taken.
    pub fn run_until_halt(&mut self, limit: usize) -> usize {
        for n in 0..limit {
            let rec = self.step();
            if rec.stopped.is_some() {
                return n + 1;
            }
        }
        limit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(prog: &[u8]) -> Cpu {
        let mut c = Cpu::new();
        c.load_com(prog);
        c.run_until_halt(1024);
        c
    }

    #[test]
    fn nop_then_hlt() {
        // 90 F4 = nop ; hlt
        let c = run(&[0x90, 0xF4]);
        assert!(c.halted);
        // IP advanced past nop (0x100) and hlt (0x101) → 0x102.
        assert_eq!(c.regs.ip, 0x102);
    }

    #[test]
    fn mov_al_imm8() {
        // B0 5A = mov al, 0x5A
        let c = run(&[0xB0, 0x5A, 0xF4]);
        assert_eq!(c.regs.al(), 0x5A);
    }

    #[test]
    fn mov_ax_imm16() {
        // B8 CD AB = mov ax, 0xABCD
        let c = run(&[0xB8, 0xCD, 0xAB, 0xF4]);
        assert_eq!(c.regs.ax, 0xABCD);
    }

    #[test]
    fn mov_reg_to_reg_8bit() {
        // B0 11   = mov al, 0x11
        // 88 C3   = mov bl, al    (88 /r, mod=11, reg=AL(0), rm=BL(3))
        // F4
        let c = run(&[0xB0, 0x11, 0x88, 0xC3, 0xF4]);
        assert_eq!(c.regs.bl(), 0x11);
    }

    #[test]
    fn mov_reg_to_reg_16bit() {
        // B8 34 12 = mov ax, 0x1234
        // 89 C3    = mov bx, ax
        // F4
        let c = run(&[0xB8, 0x34, 0x12, 0x89, 0xC3, 0xF4]);
        assert_eq!(c.regs.bx, 0x1234);
    }

    #[test]
    fn mov_rm_imm_8bit() {
        // C6 C1 7F = mov cl, 0x7F  (C6 /0, mod=11, rm=CL(1))
        let c = run(&[0xC6, 0xC1, 0x7F, 0xF4]);
        assert_eq!(c.regs.cl(), 0x7F);
    }

    #[test]
    fn mov_rm_imm_16bit() {
        // C7 C2 EF BE = mov dx, 0xBEEF
        let c = run(&[0xC7, 0xC2, 0xEF, 0xBE, 0xF4]);
        assert_eq!(c.regs.dx, 0xBEEF);
    }

    #[test]
    fn flag_ops() {
        // F9 = stc, FC = cld, FB = sti, F5 = cmc, F4 = hlt
        let c = run(&[0xF9, 0xFC, 0xFB, 0xF5, 0xF4]);
        assert!(!c.regs.flags.get(Flags::CF), "CMC should clear after STC");
        assert!(!c.regs.flags.get(Flags::DF));
        assert!(c.regs.flags.get(Flags::IF));
    }

    #[test]
    fn unimplemented_opcode_halts_at_ip() {
        // 0x06 is PUSH ES — not implemented yet.
        let mut c = Cpu::new();
        c.load_com(&[0x06]);
        let rec = c.step();
        assert!(matches!(
            rec.stopped,
            Some(StopReason::Unimplemented { .. })
        ));
        // IP must be left at the offending byte so the IDE can point at it.
        assert_eq!(c.regs.ip, 0x100);
    }
}
