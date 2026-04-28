//! 8086 CPU loop. M1 slices 1-2: full register file + memory addressing,
//! the MOV family (including segment registers and `LEA`), single-byte
//! flag/halt/no-op opcodes. Arithmetic, logical, control flow, stack, and
//! string ops arrive in later slices.
//!
//! The decoder is intentionally table-light and explicit: each branch is
//! a self-contained read that pulls bytes through `fetch_*`, so we can
//! later snapshot every fetched byte for the trace log.

use crate::alu;
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

/// Segment register codes (3-bit; bit-2 ignored on 8086).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegReg {
    Es,
    Cs,
    Ss,
    Ds,
}

impl SegReg {
    #[must_use]
    pub const fn from_code(code: u8) -> Self {
        match code & 0b11 {
            0 => Self::Es,
            1 => Self::Cs,
            2 => Self::Ss,
            _ => Self::Ds,
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

/// Decoded mod-r/m memory operand: which segment register defaults apply
/// and what 16-bit offset to use within that segment.
#[derive(Debug, Clone, Copy)]
struct EffAddr {
    default_seg: SegReg,
    off: u16,
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

    #[must_use]
    pub fn read_seg(&self, s: SegReg) -> u16 {
        match s {
            SegReg::Es => self.regs.es,
            SegReg::Cs => self.regs.cs,
            SegReg::Ss => self.regs.ss,
            SegReg::Ds => self.regs.ds,
        }
    }

    pub fn write_seg(&mut self, s: SegReg, v: u16) {
        match s {
            SegReg::Es => self.regs.es = v,
            SegReg::Cs => self.regs.cs = v,
            SegReg::Ss => self.regs.ss = v,
            SegReg::Ds => self.regs.ds = v,
        }
    }

    /// Decode the memory operand selected by mod-r/m bits, fetching any
    /// trailing displacement bytes. Caller has already taken the modrm byte.
    /// Returns the (default segment, offset). Returns None for register
    /// form (mod=11).
    fn decode_ea(&mut self, modrm: u8) -> Option<EffAddr> {
        let mode = modrm >> 6;
        let rm = modrm & 0b111;
        if mode == 0b11 {
            return None;
        }

        // Special case: mod=00 rm=110 → 16-bit absolute address (no register base).
        if mode == 0b00 && rm == 0b110 {
            let abs = self.fetch_u16();
            return Some(EffAddr {
                default_seg: SegReg::Ds,
                off: abs,
            });
        }

        // Base/index pattern by rm.
        let (base, default_seg) = match rm {
            0b000 => (self.regs.bx.wrapping_add(self.regs.si), SegReg::Ds),
            0b001 => (self.regs.bx.wrapping_add(self.regs.di), SegReg::Ds),
            0b010 => (self.regs.bp.wrapping_add(self.regs.si), SegReg::Ss),
            0b011 => (self.regs.bp.wrapping_add(self.regs.di), SegReg::Ss),
            0b100 => (self.regs.si, SegReg::Ds),
            0b101 => (self.regs.di, SegReg::Ds),
            0b110 => (self.regs.bp, SegReg::Ss),
            _ => (self.regs.bx, SegReg::Ds),
        };

        let disp: u16 = match mode {
            0b00 => 0,
            // Sign-extend disp8 to 16 bits.
            0b01 => self.fetch_u8() as i8 as i16 as u16,
            _ => self.fetch_u16(),
        };

        Some(EffAddr {
            default_seg,
            off: base.wrapping_add(disp),
        })
    }

    fn linear_for(&self, ea: EffAddr, override_seg: Option<SegReg>) -> usize {
        let seg = self.read_seg(override_seg.unwrap_or(ea.default_seg));
        seg_off(seg, ea.off)
    }

    /// Read an 8-bit operand selected by mod-r/m. `reg_field` of modrm is
    /// not consulted here; caller passes the rm pattern as `modrm`.
    fn read_rm8(&mut self, modrm: u8, override_seg: Option<SegReg>) -> u8 {
        if let Some(ea) = self.decode_ea(modrm) {
            self.mem.read_u8(self.linear_for(ea, override_seg))
        } else {
            self.read_reg8(Reg8::from_code(modrm & 0b111))
        }
    }

    fn read_rm16(&mut self, modrm: u8, override_seg: Option<SegReg>) -> u16 {
        if let Some(ea) = self.decode_ea(modrm) {
            self.mem.read_u16(self.linear_for(ea, override_seg))
        } else {
            self.read_reg16(Reg16::from_code(modrm & 0b111))
        }
    }

    fn write_rm8(&mut self, modrm: u8, override_seg: Option<SegReg>, value: u8) {
        if let Some(ea) = self.decode_ea(modrm) {
            let lin = self.linear_for(ea, override_seg);
            self.mem.write_u8(lin, value);
        } else {
            self.write_reg8(Reg8::from_code(modrm & 0b111), value);
        }
    }

    fn write_rm16(&mut self, modrm: u8, override_seg: Option<SegReg>, value: u16) {
        if let Some(ea) = self.decode_ea(modrm) {
            let lin = self.linear_for(ea, override_seg);
            self.mem.write_u16(lin, value);
        } else {
            self.write_reg16(Reg16::from_code(modrm & 0b111), value);
        }
    }

    /// Apply one of the eight ALU operations selected by `kind` (0..7) to
    /// `(a, b)` at 8-bit width. Returns `(result, flags, writes_back)`.
    /// `writes_back` is `false` for `CMP`, which computes flags and
    /// discards the result.
    fn alu_apply8(&self, kind: u8, a: u8, b: u8) -> (u8, Flags, bool) {
        let cf = self.regs.flags.get(Flags::CF);
        match kind & 7 {
            0 => {
                let (r, f) = alu::add8(a, b, false);
                (r, f, true)
            }
            1 => {
                let (r, f) = alu::or8(a, b);
                (r, f, true)
            }
            2 => {
                let (r, f) = alu::add8(a, b, cf);
                (r, f, true)
            }
            3 => {
                let (r, f) = alu::sub8(a, b, cf);
                (r, f, true)
            }
            4 => {
                let (r, f) = alu::and8(a, b);
                (r, f, true)
            }
            5 => {
                let (r, f) = alu::sub8(a, b, false);
                (r, f, true)
            }
            6 => {
                let (r, f) = alu::xor8(a, b);
                (r, f, true)
            }
            _ => {
                // CMP — same as SUB without store.
                let (r, f) = alu::sub8(a, b, false);
                (r, f, false)
            }
        }
    }

    fn alu_apply16(&self, kind: u8, a: u8, av: u16, bv: u16) -> (u16, Flags, bool) {
        let _ = a;
        let cf = self.regs.flags.get(Flags::CF);
        match kind & 7 {
            0 => {
                let (r, f) = alu::add16(av, bv, false);
                (r, f, true)
            }
            1 => {
                let (r, f) = alu::or16(av, bv);
                (r, f, true)
            }
            2 => {
                let (r, f) = alu::add16(av, bv, cf);
                (r, f, true)
            }
            3 => {
                let (r, f) = alu::sub16(av, bv, cf);
                (r, f, true)
            }
            4 => {
                let (r, f) = alu::and16(av, bv);
                (r, f, true)
            }
            5 => {
                let (r, f) = alu::sub16(av, bv, false);
                (r, f, true)
            }
            6 => {
                let (r, f) = alu::xor16(av, bv);
                (r, f, true)
            }
            _ => {
                let (r, f) = alu::sub16(av, bv, false);
                (r, f, false)
            }
        }
    }

    /// Mnemonic name for the eight ALU kinds, used to populate `StepRecord`.
    const fn alu_mnemonic(kind: u8) -> &'static str {
        match kind & 7 {
            0 => "add",
            1 => "or",
            2 => "adc",
            3 => "sbb",
            4 => "and",
            5 => "sub",
            6 => "xor",
            _ => "cmp",
        }
    }

    /// Execute exactly one instruction starting at `cs:ip`.
    ///
    /// Returns a `StepRecord` describing what happened. If the CPU is
    /// halted the record reports it without advancing IP.
    #[allow(clippy::too_many_lines, clippy::match_same_arms)]
    pub fn step(&mut self) -> StepRecord {
        if self.halted {
            return StepRecord {
                stopped: Some(StopReason::Halted),
                ..Default::default()
            };
        }
        let ip_before = self.regs.ip;
        let mut rec = StepRecord::default();

        // Consume any segment-override prefixes (LOCK and REP land in their
        // own slices; on 8086 multiple prefixes are accepted with the last
        // override winning).
        let mut override_seg: Option<SegReg> = None;
        let op = loop {
            let b = self.fetch_u8();
            match b {
                0x26 => override_seg = Some(SegReg::Es),
                0x2E => override_seg = Some(SegReg::Cs),
                0x36 => override_seg = Some(SegReg::Ss),
                0x3E => override_seg = Some(SegReg::Ds),
                _ => break b,
            }
        };

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

            // MOV r/m8, r8 (88) and MOV r/m16, r16 (89). Memory or register dest.
            0x88 | 0x89 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if op == 0x88 {
                    let v = self.read_reg8(Reg8::from_code(reg));
                    self.write_rm8(modrm, override_seg, v);
                } else {
                    let v = self.read_reg16(Reg16::from_code(reg));
                    self.write_rm16(modrm, override_seg, v);
                }
                rec.mnemonic = "mov";
            }

            // MOV r8, r/m8 (8A) and MOV r16, r/m16 (8B). Memory or register source.
            0x8A | 0x8B => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if op == 0x8A {
                    let v = self.read_rm8(modrm, override_seg);
                    self.write_reg8(Reg8::from_code(reg), v);
                } else {
                    let v = self.read_rm16(modrm, override_seg);
                    self.write_reg16(Reg16::from_code(reg), v);
                }
                rec.mnemonic = "mov";
            }

            // MOV r/m, imm — C6 (8-bit) / C7 (16-bit).
            0xC6 => {
                let modrm = self.fetch_u8();
                let imm = self.fetch_u8();
                self.write_rm8(modrm, override_seg, imm);
                rec.mnemonic = "mov";
            }
            0xC7 => {
                let modrm = self.fetch_u8();
                let imm = self.fetch_u16();
                self.write_rm16(modrm, override_seg, imm);
                rec.mnemonic = "mov";
            }

            // MOV AL, [moffs8] / MOV AX, [moffs16]
            0xA0 | 0xA1 => {
                let off = self.fetch_u16();
                let lin = seg_off(self.read_seg(override_seg.unwrap_or(SegReg::Ds)), off);
                if op == 0xA0 {
                    self.regs.set_al(self.mem.read_u8(lin));
                } else {
                    self.regs.ax = self.mem.read_u16(lin);
                }
                rec.mnemonic = "mov";
            }

            // MOV [moffs8], AL / MOV [moffs16], AX
            0xA2 | 0xA3 => {
                let off = self.fetch_u16();
                let lin = seg_off(self.read_seg(override_seg.unwrap_or(SegReg::Ds)), off);
                if op == 0xA2 {
                    self.mem.write_u8(lin, self.regs.al());
                } else {
                    self.mem.write_u16(lin, self.regs.ax);
                }
                rec.mnemonic = "mov";
            }

            // MOV r/m16, sreg (8C) / MOV sreg, r/m16 (8E)
            0x8C => {
                let modrm = self.fetch_u8();
                let s = SegReg::from_code((modrm >> 3) & 0b11);
                let v = self.read_seg(s);
                self.write_rm16(modrm, override_seg, v);
                rec.mnemonic = "mov";
            }
            0x8E => {
                let modrm = self.fetch_u8();
                let s = SegReg::from_code((modrm >> 3) & 0b11);
                let v = self.read_rm16(modrm, override_seg);
                self.write_seg(s, v);
                rec.mnemonic = "mov";
            }

            // LEA r16, m (8D) — load effective address; only memory form is valid.
            0x8D => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if let Some(ea) = self.decode_ea(modrm) {
                    self.write_reg16(Reg16::from_code(reg), ea.off);
                    rec.mnemonic = "lea";
                } else {
                    rec.stopped = Some(StopReason::Unimplemented {
                        opcode: op,
                        ip: ip_before,
                    });
                }
            }

            // XCHG AX, r16 — opcodes 91..97 (90 is NOP since AX,AX).
            0x91..=0x97 => {
                let r = Reg16::from_code(op - 0x90);
                let tmp = self.read_reg16(r);
                self.write_reg16(r, self.regs.ax);
                self.regs.ax = tmp;
                rec.mnemonic = "xchg";
            }

            // XCHG r/m, r — 86 (8-bit) / 87 (16-bit)
            0x86 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let r = Reg8::from_code(reg);
                let a = self.read_reg8(r);
                let b = self.read_rm8(modrm, override_seg);
                self.write_reg8(r, b);
                self.write_rm8(modrm, override_seg, a);
                rec.mnemonic = "xchg";
            }
            0x87 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let r = Reg16::from_code(reg);
                let a = self.read_reg16(r);
                let b = self.read_rm16(modrm, override_seg);
                self.write_reg16(r, b);
                self.write_rm16(modrm, override_seg, a);
                rec.mnemonic = "xchg";
            }

            // Regular ALU group 00..3D — eight operations × six forms each.
            // op = (kind << 3) | form
            //   kind: 0 ADD | 1 OR | 2 ADC | 3 SBB | 4 AND | 5 SUB | 6 XOR | 7 CMP
            //   form: 0 r/m,r 8 | 1 r/m,r 16 | 2 r,r/m 8 | 3 r,r/m 16
            //         4 AL,imm8 | 5 AX,imm16
            // Forms 6/7 inside these ranges are seg push/pop or BCD ops and
            // fall through to the unimplemented arm for now.
            0x00..=0x3D if (op & 0b111) < 6 => {
                let kind = op >> 3;
                let form = op & 0b111;
                rec.mnemonic = Self::alu_mnemonic(kind);
                match form {
                    0 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_rm8(modrm, override_seg);
                        let b = self.read_reg8(Reg8::from_code(reg));
                        let (r, f, w) = self.alu_apply8(kind, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_rm8(modrm, override_seg, r);
                        }
                    }
                    1 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_rm16(modrm, override_seg);
                        let b = self.read_reg16(Reg16::from_code(reg));
                        let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_rm16(modrm, override_seg, r);
                        }
                    }
                    2 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_reg8(Reg8::from_code(reg));
                        let b = self.read_rm8(modrm, override_seg);
                        let (r, f, w) = self.alu_apply8(kind, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_reg8(Reg8::from_code(reg), r);
                        }
                    }
                    3 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_reg16(Reg16::from_code(reg));
                        let b = self.read_rm16(modrm, override_seg);
                        let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_reg16(Reg16::from_code(reg), r);
                        }
                    }
                    4 => {
                        let imm = self.fetch_u8();
                        let a = self.regs.al();
                        let (r, f, w) = self.alu_apply8(kind, a, imm);
                        self.regs.flags = f;
                        if w {
                            self.regs.set_al(r);
                        }
                    }
                    _ /* 5 */ => {
                        let imm = self.fetch_u16();
                        let a = self.regs.ax;
                        let (r, f, w) = self.alu_apply16(kind, 0, a, imm);
                        self.regs.flags = f;
                        if w {
                            self.regs.ax = r;
                        }
                    }
                }
            }

            // ALU r/m, imm — 80 (r/m8, imm8), 81 (r/m16, imm16),
            // 82 (alias of 80), 83 (r/m16, sign-extended imm8).
            // Operation selected by reg field of mod-r/m.
            0x80 | 0x82 => {
                let modrm = self.fetch_u8();
                let kind = (modrm >> 3) & 0b111;
                let a = self.read_rm8(modrm, override_seg);
                let b = self.fetch_u8();
                rec.mnemonic = Self::alu_mnemonic(kind);
                let (r, f, w) = self.alu_apply8(kind, a, b);
                self.regs.flags = f;
                if w {
                    self.write_rm8(modrm, override_seg, r);
                }
            }
            0x81 => {
                let modrm = self.fetch_u8();
                let kind = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                let b = self.fetch_u16();
                rec.mnemonic = Self::alu_mnemonic(kind);
                let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                self.regs.flags = f;
                if w {
                    self.write_rm16(modrm, override_seg, r);
                }
            }
            0x83 => {
                let modrm = self.fetch_u8();
                let kind = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                // Sign-extend imm8 to 16 bits.
                let b = self.fetch_u8() as i8 as i16 as u16;
                rec.mnemonic = Self::alu_mnemonic(kind);
                let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                self.regs.flags = f;
                if w {
                    self.write_rm16(modrm, override_seg, r);
                }
            }

            // TEST r/m, r — 84 (8-bit), 85 (16-bit). AND-without-store.
            0x84 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let a = self.read_rm8(modrm, override_seg);
                let b = self.read_reg8(Reg8::from_code(reg));
                let (_, f) = alu::and8(a, b);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }
            0x85 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                let b = self.read_reg16(Reg16::from_code(reg));
                let (_, f) = alu::and16(a, b);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }

            // TEST AL/AX, imm — A8/A9.
            0xA8 => {
                let imm = self.fetch_u8();
                let (_, f) = alu::and8(self.regs.al(), imm);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }
            0xA9 => {
                let imm = self.fetch_u16();
                let (_, f) = alu::and16(self.regs.ax, imm);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }

            // INC reg16 — 40..47.
            0x40..=0x47 => {
                let r = Reg16::from_code(op - 0x40);
                let cf = self.regs.flags.get(Flags::CF);
                let (v, f) = alu::inc16(self.read_reg16(r), cf);
                self.regs.flags = f;
                self.write_reg16(r, v);
                rec.mnemonic = "inc";
            }

            // DEC reg16 — 48..4F.
            0x48..=0x4F => {
                let r = Reg16::from_code(op - 0x48);
                let cf = self.regs.flags.get(Flags::CF);
                let (v, f) = alu::dec16(self.read_reg16(r), cf);
                self.regs.flags = f;
                self.write_reg16(r, v);
                rec.mnemonic = "dec";
            }

            // FE / FF — unary group on r/m. Reg field selects:
            // 0 INC, 1 DEC. Other variants of FF (CALL/JMP/PUSH) arrive
            // with control flow in the next slice.
            0xFE => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let cf = self.regs.flags.get(Flags::CF);
                let a = self.read_rm8(modrm, override_seg);
                let (v, f, name) = match sub {
                    0 => {
                        let (v, f) = alu::inc8(a, cf);
                        (v, f, "inc")
                    }
                    1 => {
                        let (v, f) = alu::dec8(a, cf);
                        (v, f, "dec")
                    }
                    _ => {
                        rec.stopped = Some(StopReason::Unimplemented {
                            opcode: op,
                            ip: ip_before,
                        });
                        (0u8, self.regs.flags, "")
                    }
                };
                if rec.stopped.is_none() {
                    self.regs.flags = f;
                    self.write_rm8(modrm, override_seg, v);
                    rec.mnemonic = name;
                }
            }
            0xFF => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let cf = self.regs.flags.get(Flags::CF);
                let a = self.read_rm16(modrm, override_seg);
                let (v, f, name) = match sub {
                    0 => {
                        let (v, f) = alu::inc16(a, cf);
                        (v, f, "inc")
                    }
                    1 => {
                        let (v, f) = alu::dec16(a, cf);
                        (v, f, "dec")
                    }
                    _ => {
                        rec.stopped = Some(StopReason::Unimplemented {
                            opcode: op,
                            ip: ip_before,
                        });
                        (0u16, self.regs.flags, "")
                    }
                };
                if rec.stopped.is_none() {
                    self.regs.flags = f;
                    self.write_rm16(modrm, override_seg, v);
                    rec.mnemonic = name;
                }
            }

            // F6 / F7 — unary group: 0 TEST imm, 2 NOT, 3 NEG.
            // 4..7 (MUL/IMUL/DIV/IDIV) arrive in a later slice.
            0xF6 => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let a = self.read_rm8(modrm, override_seg);
                match sub {
                    0 | 1 => {
                        let imm = self.fetch_u8();
                        let (_, f) = alu::and8(a, imm);
                        self.regs.flags = f;
                        rec.mnemonic = "test";
                    }
                    2 => {
                        let v = alu::not8(a);
                        self.write_rm8(modrm, override_seg, v);
                        rec.mnemonic = "not";
                    }
                    3 => {
                        let (v, f) = alu::neg8(a);
                        self.regs.flags = f;
                        self.write_rm8(modrm, override_seg, v);
                        rec.mnemonic = "neg";
                    }
                    _ => {
                        rec.stopped = Some(StopReason::Unimplemented {
                            opcode: op,
                            ip: ip_before,
                        });
                    }
                }
            }
            0xF7 => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                match sub {
                    0 | 1 => {
                        let imm = self.fetch_u16();
                        let (_, f) = alu::and16(a, imm);
                        self.regs.flags = f;
                        rec.mnemonic = "test";
                    }
                    2 => {
                        let v = alu::not16(a);
                        self.write_rm16(modrm, override_seg, v);
                        rec.mnemonic = "not";
                    }
                    3 => {
                        let (v, f) = alu::neg16(a);
                        self.regs.flags = f;
                        self.write_rm16(modrm, override_seg, v);
                        rec.mnemonic = "neg";
                    }
                    _ => {
                        rec.stopped = Some(StopReason::Unimplemented {
                            opcode: op,
                            ip: ip_before,
                        });
                    }
                }
            }

            other => {
                rec.stopped = Some(StopReason::Unimplemented {
                    opcode: other,
                    ip: ip_before,
                });
            }
        }

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
        // 0xF6 with reg=110 is DIV (not yet implemented at the time of writing).
        let mut c = Cpu::new();
        c.load_com(&[0xF6, 0xF0]);
        let rec = c.step();
        assert!(matches!(
            rec.stopped,
            Some(StopReason::Unimplemented { .. })
        ));
        assert_eq!(c.regs.ip, 0x100);
    }

    #[test]
    fn mov_to_memory_via_bx() {
        // mov bx, 0x0200 ; mov al, 0xAA ; mov [bx], al ; hlt
        // BB 00 02   88 07   F4
        // 88 /reg=AL(0)/rm=[BX](7) → modrm = 0b00000111 = 0x07
        let c = run(&[0xBB, 0x00, 0x02, 0xB0, 0xAA, 0x88, 0x07, 0xF4]);
        assert_eq!(c.regs.bx, 0x0200);
        let lin = seg_off(c.regs.ds, 0x0200);
        assert_eq!(c.mem.read_u8(lin), 0xAA);
    }

    #[test]
    fn mov_from_memory_with_disp8() {
        // Set ds:[bx+4] = 0x42 directly, then read it via mov al, [bx+4].
        let mut c = Cpu::new();
        c.load_com(&[
            0xBB, 0x10, 0x00, // mov bx, 0x0010
            0x8A, 0x47, 0x04, // mov al, [bx+4]   (mod=01, reg=AL, rm=[BX])
            0xF4,
        ]);
        c.mem.write_u8(seg_off(c.regs.ds, 0x14), 0x42);
        c.run_until_halt(64);
        assert_eq!(c.regs.al(), 0x42);
    }

    #[test]
    fn mov_via_direct_address() {
        // mov ax, [0x0234]  →  A1 34 02 ; we pre-place 0xC0DE at DS:0x0234.
        let mut c = Cpu::new();
        c.load_com(&[0xA1, 0x34, 0x02, 0xF4]);
        c.mem.write_u16(seg_off(c.regs.ds, 0x0234), 0xC0DE);
        c.run_until_halt(64);
        assert_eq!(c.regs.ax, 0xC0DE);
    }

    #[test]
    fn bp_addressing_uses_ss_by_default() {
        // mov bp, 0x0050 ; mov al, [bp]  → reads from SS:0x0050, not DS:0x0050.
        let mut c = Cpu::new();
        c.load_com(&[
            0xBD, 0x50, 0x00, // mov bp, 0x0050
            0x8A, 0x46, 0x00, // mov al, [bp+0]  (mod=01, rm=[BP])
            0xF4,
        ]);
        // SS = DS = 0x0700 at load_com, so write at DS to confirm we read from SS.
        // Actually since SS == DS here, plant the byte at SS:0x0050 explicitly.
        c.mem.write_u8(seg_off(c.regs.ss, 0x0050), 0x77);
        c.run_until_halt(64);
        assert_eq!(c.regs.al(), 0x77);
    }

    #[test]
    fn segment_override_es_changes_target() {
        // ES = 0x0900, DS = 0x0700 (default for load_com).
        // Plant a sentinel at DS:0x0040 and a different one at ES:0x0040.
        // mov al, es:[bx]  with bx=0x0040 should pick up the ES sentinel.
        let mut c = Cpu::new();
        c.load_com(&[
            0xBB, 0x40, 0x00, // mov bx, 0x0040
            0x26, 0x8A, 0x07, // es: mov al, [bx]
            0xF4,
        ]);
        c.regs.es = 0x0900;
        c.mem.write_u8(seg_off(c.regs.ds, 0x0040), 0x11);
        c.mem.write_u8(seg_off(c.regs.es, 0x0040), 0x99);
        c.run_until_halt(64);
        assert_eq!(c.regs.al(), 0x99);
    }

    #[test]
    fn lea_computes_offset_only() {
        // mov bx, 0x0020 ; mov si, 0x0003 ; lea ax, [bx+si+0x10] ; hlt
        // LEA opcode 8D, reg=AX(0), mod=01, rm=[BX+SI](0) → modrm = 0x40, disp8=0x10
        let c = run(&[0xBB, 0x20, 0x00, 0xBE, 0x03, 0x00, 0x8D, 0x40, 0x10, 0xF4]);
        assert_eq!(c.regs.ax, 0x0033);
    }

    #[test]
    fn xchg_ax_with_reg() {
        // mov ax, 0x1111 ; mov bx, 0x2222 ; xchg ax, bx (93) ; hlt
        let c = run(&[0xB8, 0x11, 0x11, 0xBB, 0x22, 0x22, 0x93, 0xF4]);
        assert_eq!(c.regs.ax, 0x2222);
        assert_eq!(c.regs.bx, 0x1111);
    }

    #[test]
    fn mov_segreg_round_trip() {
        // mov ax, 0x1234 ; mov es, ax ; mov bx, es ; hlt
        // 8E /reg=ES(0)/rm=AX(0,mod=11) → 8E C0
        // 8C /reg=ES(0)/rm=BX(3,mod=11) → 8C C3
        let c = run(&[0xB8, 0x34, 0x12, 0x8E, 0xC0, 0x8C, 0xC3, 0xF4]);
        assert_eq!(c.regs.es, 0x1234);
        assert_eq!(c.regs.bx, 0x1234);
    }

    // ---- arithmetic opcodes (M1.3) ----

    #[test]
    fn add_al_imm8() {
        // 04 22 = add al, 0x22
        let c = run(&[0xB0, 0x10, 0x04, 0x22, 0xF4]);
        assert_eq!(c.regs.al(), 0x32);
        // 0x32 = 0b00110010 → 3 ones → odd → PF=0; ZF=SF=CF=OF=0.
        assert!(!c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn add_ax_imm16_carries() {
        // mov ax, 0xFFFF ; add ax, 1 ; hlt → AX=0, ZF=1, CF=1
        let c = run(&[0xB8, 0xFF, 0xFF, 0x05, 0x01, 0x00, 0xF4]);
        assert_eq!(c.regs.ax, 0);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn sub_reg_reg_borrows() {
        // mov al, 5 ; sub al, 6 (28 /reg=Bl(3)/rm=AL(0)?) — easier: 2C imm form.
        // 2C 06 = sub al, 6
        let c = run(&[0xB0, 0x05, 0x2C, 0x06, 0xF4]);
        assert_eq!(c.regs.al(), 0xFF);
        assert!(c.regs.flags.get(Flags::CF));
        assert!(c.regs.flags.get(Flags::SF));
    }

    #[test]
    fn cmp_does_not_write_back() {
        // mov ax, 5 ; cmp ax, 5 ; hlt → AX still 5, ZF set, CF clear.
        let c = run(&[0xB8, 0x05, 0x00, 0x3D, 0x05, 0x00, 0xF4]);
        assert_eq!(c.regs.ax, 5);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn and_clears_cf_of_and_sets_zf_when_zero() {
        // mov al, 0xF0 ; and al, 0x0F ; hlt
        // and al, imm8 → 24 0F
        let c = run(&[0xB0, 0xF0, 0x24, 0x0F, 0xF4]);
        assert_eq!(c.regs.al(), 0);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
        assert!(!c.regs.flags.get(Flags::OF));
    }

    #[test]
    fn or_xor_set_correct_result() {
        // mov al, 0xAA ; or al, 0x55 → 0xFF ; xor al, 0x0F → 0xF0
        // OR al,imm8 = 0C ; XOR al,imm8 = 34
        let c = run(&[0xB0, 0xAA, 0x0C, 0x55, 0x34, 0x0F, 0xF4]);
        assert_eq!(c.regs.al(), 0xF0);
    }

    #[test]
    fn inc_reg_preserves_cf() {
        // stc ; mov ax, 0x7FFF ; inc ax ; hlt → AX=0x8000, OF=1, SF=1, CF preserved.
        let c = run(&[0xF9, 0xB8, 0xFF, 0x7F, 0x40, 0xF4]);
        assert_eq!(c.regs.ax, 0x8000);
        assert!(c.regs.flags.get(Flags::OF));
        assert!(c.regs.flags.get(Flags::SF));
        assert!(c.regs.flags.get(Flags::CF), "INC must not clobber CF");
    }

    #[test]
    fn dec_reg_preserves_cf() {
        // stc ; mov ax, 1 ; dec ax ; hlt → AX=0, ZF=1, CF still 1.
        let c = run(&[0xF9, 0xB8, 0x01, 0x00, 0x48, 0xF4]);
        assert_eq!(c.regs.ax, 0);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn neg_nonzero_sets_cf() {
        // mov al, 5 ; neg al ; hlt → AL=0xFB, CF=1
        // F6 /3 mod=11 rm=AL(0) → F6 D8
        let c = run(&[0xB0, 0x05, 0xF6, 0xD8, 0xF4]);
        assert_eq!(c.regs.al(), 0xFB);
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn not_does_not_touch_flags() {
        // stc ; mov al, 0xAA ; not al ; hlt → AL=0x55, CF still 1.
        // F6 /2 mod=11 rm=AL(0) → F6 D0
        let c = run(&[0xF9, 0xB0, 0xAA, 0xF6, 0xD0, 0xF4]);
        assert_eq!(c.regs.al(), 0x55);
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn alu_imm_form_with_sign_extension() {
        // 83 /5 (SUB r/m16, imm8 sign-extended) — sub bx, -1 → bx + 1.
        // mov bx, 0x1000 ; sub bx, 0xFF (−1) ; hlt → bx = 0x1001
        // 83 EB FF: 83 /5 rm=BX(3) mod=11 → modrm 0xEB
        let c = run(&[0xBB, 0x00, 0x10, 0x83, 0xEB, 0xFF, 0xF4]);
        assert_eq!(c.regs.bx, 0x1001);
    }

    #[test]
    fn test_does_not_modify_operand() {
        // mov al, 0x80 ; test al, 0x80 ; hlt → SF=1, ZF=0, CF=0.
        let c = run(&[0xB0, 0x80, 0xA8, 0x80, 0xF4]);
        assert_eq!(c.regs.al(), 0x80);
        assert!(c.regs.flags.get(Flags::SF));
        assert!(!c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn add_with_carry_chain() {
        // 32-bit add via two 16-bit adds:
        //   mov ax, 0xFFFF ; mov bx, 0x0001
        //   add ax, 0x0001  (CF=1, AX=0)
        //   adc bx, 0x0000  (BX=2 because of CF)
        // 05 imm16 ADD ; 81 /2 imm16 ADC bx → 81 D3 imm
        let c = run(&[
            0xB8, 0xFF, 0xFF, 0xBB, 0x01, 0x00, 0x05, 0x01, 0x00, 0x81, 0xD3, 0x00, 0x00, 0xF4,
        ]);
        assert_eq!(c.regs.ax, 0);
        assert_eq!(c.regs.bx, 0x0002);
    }
}
