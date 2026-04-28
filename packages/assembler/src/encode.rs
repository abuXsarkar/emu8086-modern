//! Encoder: AST → bytes. Two passes — pass 1 sizes each item and lays out
//! labels, pass 2 emits bytes resolving forward label references.

use std::collections::HashMap;
use std::fmt;

use crate::lexer::Span;
use crate::parser::{DataItem, Directive, Instr, Item, MemRef, MemTerm, Operand, Program};

/// Resolved 8086 memory operand: which mod-r/m bits it produces, plus
/// any sign-extended displacement to emit after the mod-r/m byte.
#[derive(Debug, Clone, Copy)]
struct MemEncoded {
    /// 3-bit `rm` field of the mod-r/m byte.
    rm: u8,
    /// 2-bit `mod` field (00, 01, 10).
    mode: u8,
    /// Number of displacement bytes after the mod-r/m (0, 1, or 2).
    disp_bytes: u8,
    /// Sign-extended displacement value to write (low byte first when
    /// `disp_bytes == 2`).
    disp: i32,
}

impl MemEncoded {
    fn modrm_byte(self, reg_field: u8) -> u8 {
        (self.mode << 6) | ((reg_field & 0b111) << 3) | (self.rm & 0b111)
    }

    fn extra_bytes(self) -> u16 {
        u16::from(self.disp_bytes)
    }
}

fn mem_reg_kind(name: &str) -> Option<&'static str> {
    match name.to_ascii_lowercase().as_str() {
        "bx" | "bp" => Some("BASE"),
        "si" | "di" => Some("INDEX"),
        _ => None,
    }
}

fn mem_reg_canonical(name: &str) -> &'static str {
    match name.to_ascii_lowercase().as_str() {
        "bx" => "BX",
        "bp" => "BP",
        "si" => "SI",
        "di" => "DI",
        _ => "?",
    }
}

/// Recognize "this is a register, just not one valid in `[]`" so we
/// can emit a focused diagnostic instead of "undefined label".
fn is_other_reg(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "ax" | "cx"
            | "dx"
            | "sp"
            | "al"
            | "cl"
            | "dl"
            | "bl"
            | "ah"
            | "ch"
            | "dh"
            | "bh"
            | "es"
            | "cs"
            | "ss"
            | "ds"
    )
}

/// Resolve a parsed `[a + b + …]` memory reference into its 8086
/// addressing mode. Resolves label references against `labels` to fold
/// them into the displacement; emits a useful error if the term list
/// doesn't match a valid 8086 base/index pair.
fn classify_mem(
    mem: &MemRef,
    labels: Option<&HashMap<String, u16>>,
) -> Result<MemEncoded, EncodeError> {
    let mut base: Option<&'static str> = None;
    let mut index: Option<&'static str> = None;
    let mut disp: i64 = 0;

    for t in &mem.terms {
        match t {
            MemTerm::Number { value, .. } => {
                disp = disp.wrapping_add(*value);
            }
            MemTerm::Ident { name, sign, span } => {
                if let Some(role) = mem_reg_kind(name) {
                    if *sign != 1 {
                        return Err(EncodeError {
                            span: *span,
                            message: format!("register `{name}` cannot be subtracted in `[]`"),
                        });
                    }
                    let canon = mem_reg_canonical(name);
                    match role {
                        "BASE" => {
                            if let Some(existing) = base {
                                return Err(EncodeError {
                                    span: *span,
                                    message: format!(
                                        "two base registers in `[]` (`{existing}` and `{canon}`); only one of BX or BP is allowed"
                                    ),
                                });
                            }
                            base = Some(canon);
                        }
                        "INDEX" => {
                            if let Some(existing) = index {
                                return Err(EncodeError {
                                    span: *span,
                                    message: format!(
                                        "two index registers in `[]` (`{existing}` and `{canon}`); only one of SI or DI is allowed"
                                    ),
                                });
                            }
                            index = Some(canon);
                        }
                        _ => unreachable!(),
                    }
                } else if is_other_reg(name) {
                    return Err(EncodeError {
                        span: *span,
                        message: format!(
                            "register `{name}` cannot appear in `[]`; only BX, BP, SI, DI are valid 8086 base/index registers"
                        ),
                    });
                } else if let Some(lbls) = labels {
                    let v = lbls.get(name).copied().ok_or(EncodeError {
                        span: *span,
                        message: format!("undefined label `{name}`"),
                    })?;
                    disp = disp.wrapping_add(i64::from(sign.signum()) * i64::from(v));
                } else {
                    // Pass 1 sizing: conservative disp16 contribution.
                    disp = disp.wrapping_add(i64::from(sign.signum()) * 0x1000);
                }
            }
        }
    }

    // Map (base, index) → rm code (and default segment).
    let rm: u8 = match (base, index) {
        (Some("BX"), Some("SI")) => 0b000,
        (Some("BX"), Some("DI")) => 0b001,
        (Some("BP"), Some("SI")) => 0b010,
        (Some("BP"), Some("DI")) => 0b011,
        (None, Some("SI")) => 0b100,
        (None, Some("DI")) => 0b101,
        (Some("BP"), None) => 0b110,
        (Some("BX"), None) => 0b111,
        (None, None) => 0b110, // mod=00 rm=110 disp16 — direct address
        _ => {
            return Err(EncodeError {
                span: mem.span,
                message: format!(
                    "invalid 8086 addressing mode (base={base:?}, index={index:?}); legal pairs are BX+SI, BX+DI, BP+SI, BP+DI, plus single SI / DI / BP / BX"
                ),
            });
        }
    };

    // Pick mode + displacement width.
    let (mode, disp_bytes) = if base.is_none() && index.is_none() {
        (0b00, 2u8) // direct: mod=00 rm=110 disp16
    } else if disp == 0 && rm != 0b110 {
        // [BP] alone uses mod=01 disp8=0 because mod=00 rm=110 means
        // disp16-direct rather than [BP].
        (0b00, 0u8)
    } else if disp == 0 && rm == 0b110 {
        (0b01, 1u8)
    } else if (-128..=127).contains(&disp) {
        (0b01, 1u8)
    } else {
        (0b10, 2u8)
    };

    Ok(MemEncoded {
        rm,
        mode,
        disp_bytes,
        disp: disp as i32,
    })
}

fn emit_disp(out: &mut Vec<u8>, enc: MemEncoded) {
    match enc.disp_bytes {
        0 => {}
        1 => out.push(enc.disp as i8 as u8),
        _ => out.extend_from_slice(&((enc.disp as i16) as u16).to_le_bytes()),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Reg8 {
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
    fn from_name(s: &str) -> Option<Self> {
        Some(match s.to_ascii_lowercase().as_str() {
            "al" => Self::Al,
            "cl" => Self::Cl,
            "dl" => Self::Dl,
            "bl" => Self::Bl,
            "ah" => Self::Ah,
            "ch" => Self::Ch,
            "dh" => Self::Dh,
            "bh" => Self::Bh,
            _ => return None,
        })
    }

    fn code(self) -> u8 {
        match self {
            Self::Al => 0,
            Self::Cl => 1,
            Self::Dl => 2,
            Self::Bl => 3,
            Self::Ah => 4,
            Self::Ch => 5,
            Self::Dh => 6,
            Self::Bh => 7,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Reg16 {
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
    fn from_name(s: &str) -> Option<Self> {
        Some(match s.to_ascii_lowercase().as_str() {
            "ax" => Self::Ax,
            "cx" => Self::Cx,
            "dx" => Self::Dx,
            "bx" => Self::Bx,
            "sp" => Self::Sp,
            "bp" => Self::Bp,
            "si" => Self::Si,
            "di" => Self::Di,
            _ => return None,
        })
    }

    fn code(self) -> u8 {
        match self {
            Self::Ax => 0,
            Self::Cx => 1,
            Self::Dx => 2,
            Self::Bx => 3,
            Self::Sp => 4,
            Self::Bp => 5,
            Self::Si => 6,
            Self::Di => 7,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub struct EncodeError {
    pub span: Span,
    pub message: String,
}

impl fmt::Display for EncodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "encode error at byte {}-{}: {}",
            self.span.start, self.span.end, self.message
        )
    }
}

/// Output of a successful assembly: the raw image plus the symbol table
/// (name → offset within the image, **before** `org` adjustment).
#[derive(Debug, Default)]
pub struct AssembledImage {
    pub bytes: Vec<u8>,
    pub origin: u16,
    pub labels: HashMap<String, u16>,
}

pub fn encode(program: &Program) -> Result<AssembledImage, EncodeError> {
    // Pass 1: lay out items and assign label addresses.
    let mut origin: u16 = 0;
    let mut cursor: u16 = 0;
    let mut labels: HashMap<String, u16> = HashMap::new();
    let mut sizes: Vec<u16> = Vec::with_capacity(program.items.len());

    for item in &program.items {
        let size = match item {
            Item::Label { name, span } => {
                if labels.contains_key(name) {
                    return Err(EncodeError {
                        span: *span,
                        message: format!("duplicate label `{name}`"),
                    });
                }
                labels.insert(name.clone(), cursor);
                0
            }
            Item::Directive(Directive::Org { value, span }) => {
                if u32::from(cursor) != 0 {
                    return Err(EncodeError {
                        span: *span,
                        message: "`org` must come before any code or data".into(),
                    });
                }
                let v = u16::try_from(*value).map_err(|_| EncodeError {
                    span: *span,
                    message: format!("`org {value}` does not fit in u16"),
                })?;
                origin = v;
                cursor = 0;
                0
            }
            Item::Directive(Directive::Db { items, .. }) => data_size(items, 1),
            Item::Directive(Directive::Dw { items, .. }) => data_size(items, 2),
            Item::Directive(Directive::Equ { name, value, span }) => {
                if labels.contains_key(name) {
                    return Err(EncodeError {
                        span: *span,
                        message: format!("`{name}` already defined"),
                    });
                }
                let v = u16::try_from(*value).map_err(|_| EncodeError {
                    span: *span,
                    message: format!("EQU value {value} doesn't fit in u16"),
                })?;
                // EQU values are absolute, not relative to origin — store
                // pre-origin-offset so the post-pass adjustment doesn't
                // shift them. Easiest: insert with `value - origin` so the
                // adjustment lands on the user's literal value.
                labels.insert(name.clone(), v.wrapping_sub(origin));
                0
            }
            Item::Instr(instr) => instr_size(instr)?,
        };
        sizes.push(size);
        cursor = cursor.wrapping_add(size);
    }

    // Adjust label addresses to logical addresses (origin + offset).
    for v in labels.values_mut() {
        *v = origin.wrapping_add(*v);
    }

    // Pass 2: emit bytes.
    let mut bytes: Vec<u8> = Vec::new();
    let mut cursor: u16 = 0;
    for (item, _size) in program.items.iter().zip(sizes.iter()) {
        match item {
            Item::Label { .. } | Item::Directive(Directive::Org { .. } | Directive::Equ { .. }) => {
            }
            Item::Directive(Directive::Db { items, .. }) => {
                emit_data(items, 1, &mut bytes);
            }
            Item::Directive(Directive::Dw { items, .. }) => {
                emit_data(items, 2, &mut bytes);
            }
            Item::Instr(instr) => {
                let here = origin.wrapping_add(cursor);
                emit_instr(instr, here, &labels, &mut bytes)?;
            }
        }
        cursor = cursor.wrapping_add(*_size);
    }

    Ok(AssembledImage {
        bytes,
        origin,
        labels,
    })
}

fn data_size(items: &[DataItem], width: u16) -> u16 {
    let mut s: u16 = 0;
    for it in items {
        let n = match it {
            DataItem::Number(_, _) => width,
            DataItem::String(b, _) => (b.len() as u16) * width,
        };
        s = s.wrapping_add(n);
    }
    s
}

fn emit_data(items: &[DataItem], width: u16, out: &mut Vec<u8>) {
    for it in items {
        match it {
            DataItem::Number(n, _) => {
                if width == 1 {
                    out.push(*n as u8);
                } else {
                    let v = *n as u16;
                    out.extend_from_slice(&v.to_le_bytes());
                }
            }
            DataItem::String(bytes, _) => {
                if width == 1 {
                    out.extend_from_slice(bytes);
                } else {
                    for b in bytes {
                        out.extend_from_slice(&u16::from(*b).to_le_bytes());
                    }
                }
            }
        }
    }
}

fn instr_size(instr: &Instr) -> Result<u16, EncodeError> {
    let m = instr.mnemonic.to_ascii_lowercase();
    let zero = instr.operands.is_empty();
    let one = instr.operands.len() == 1;
    let two = instr.operands.len() == 2;

    Ok(match m.as_str() {
        "nop" | "hlt" | "ret" | "iret" | "cbw" | "cwd" | "lahf" | "sahf" | "xlat" | "xlatb"
        | "clc" | "stc" | "cmc" | "cld" | "std" | "cli" | "sti" | "pushf" | "popf" | "movsb"
        | "movsw" | "cmpsb" | "cmpsw" | "lodsb" | "lodsw" | "stosb" | "stosw" | "scasb"
        | "scasw"
            if zero =>
        {
            1
        }
        "int" if one => 2,
        "push" | "pop" if one => {
            if let Some(name) = ident_name(&instr.operands[0]) {
                if Reg16::from_name(&name).is_some() {
                    1
                } else if matches!(
                    name.to_ascii_lowercase().as_str(),
                    "es" | "cs" | "ss" | "ds"
                ) {
                    1
                } else {
                    return Err(EncodeError {
                        span: instr.span,
                        message: format!("unknown push/pop operand `{name}`"),
                    });
                }
            } else {
                return Err(EncodeError {
                    span: instr.span,
                    message: "push/pop accepts a register operand only in this slice".into(),
                });
            }
        }
        "inc" | "dec" if one => 1, // r16 form
        "mov" if two => mov_size(&instr.operands[0], &instr.operands[1])?,
        "add" | "sub" | "cmp" | "and" | "or" | "xor" | "adc" | "sbb" if two => {
            arith_size(&instr.operands[0], &instr.operands[1])?
        }
        "jmp" if one => 3,  // E9 + rel16 (we always use near for this slice)
        "call" if one => 3, // E8 + rel16
        // shifts / rotates: D0/D1 (count=1), D2/D3 (count=CL).
        // We always use the modrm-on-register form here; r/m=mem comes
        // free if the dst is `[bx]` etc. since we route through classify_mem.
        "shl" | "sal" | "shr" | "sar" | "rol" | "ror" | "rcl" | "rcr" if two => {
            shift_size(&instr.operands[0], &instr.operands[1])?
        }
        "jz" | "je" | "jnz" | "jne" | "jc" | "jb" | "jnae" | "jnc" | "jae" | "jnb" | "ja"
        | "jnbe" | "jbe" | "jna" | "jl" | "jnge" | "jge" | "jnl" | "jle" | "jng" | "jg"
        | "jnle" | "js" | "jns" | "jo" | "jno" | "jp" | "jpe" | "jnp" | "jpo" | "loop"
        | "loope" | "loopz" | "loopne" | "loopnz" | "jcxz"
            if one =>
        {
            2 // rel8
        }
        _ => {
            return Err(EncodeError {
                span: instr.mnemonic_span,
                message: format!("unsupported mnemonic `{m}` in this assembler slice"),
            });
        }
    })
}

/// Sub-op selector for the 8086 shift/rotate group (the reg field of
/// the mod-r/m byte).
fn shift_subop(m: &str) -> Option<u8> {
    match m {
        "rol" => Some(0),
        "ror" => Some(1),
        "rcl" => Some(2),
        "rcr" => Some(3),
        "shl" | "sal" => Some(4),
        "shr" => Some(5),
        "sar" => Some(7),
        _ => None,
    }
}

fn shift_size(dst: &Operand, src: &Operand) -> Result<u16, EncodeError> {
    // Count source must be the literal 1 or the CL register.
    match src {
        Operand::Number { value: 1, .. } => {}
        Operand::Ident { name, .. } if name.eq_ignore_ascii_case("cl") => {}
        _ => {
            return Err(EncodeError {
                span: src.span(),
                message: "shift count must be 1 or CL".into(),
            });
        }
    }
    if let Some(name) = ident_name(dst) {
        if Reg8::from_name(&name).is_some() || Reg16::from_name(&name).is_some() {
            return Ok(2); // opcode + modrm (mod=11)
        }
    }
    if let Operand::Mem(m) = dst {
        let enc = classify_mem(m, None)?;
        return Ok(2 + enc.extra_bytes());
    }
    Err(EncodeError {
        span: combined_span(dst, src),
        message: "unsupported shift/rotate operand".into(),
    })
}

fn mov_size(dst: &Operand, src: &Operand) -> Result<u16, EncodeError> {
    // mov reg16, imm16: B8+r ib ib  (3)
    // mov reg8, imm8:   B0+r ib    (2)
    // mov reg16, label: B8+r ib ib (3)
    // mov reg, reg:     2 bytes
    // mov reg, mem / mem, reg: 2 + disp_bytes
    // mov reg16, [direct]: 2 + 2 (we always use the modrm form for now)
    if let Some(name) = ident_name(dst) {
        if Reg16::from_name(&name).is_some() {
            // reg, reg form first — both are 2 bytes.
            if let Some(s) = ident_name(src) {
                if Reg16::from_name(&s).is_some() {
                    return Ok(2);
                }
            }
            // reg, mem
            if let Operand::Mem(m) = src {
                let enc = classify_mem(m, None)?;
                return Ok(2 + enc.extra_bytes());
            }
            // reg, imm | reg, label — B8+r ib ib (3 bytes)
            if matches!(src, Operand::Number { .. } | Operand::Ident { .. }) {
                return Ok(3);
            }
        }
        if Reg8::from_name(&name).is_some() {
            // reg, reg first
            if let Some(s) = ident_name(src) {
                if Reg8::from_name(&s).is_some() {
                    return Ok(2);
                }
            }
            if let Operand::Mem(m) = src {
                let enc = classify_mem(m, None)?;
                return Ok(2 + enc.extra_bytes());
            }
            if matches!(src, Operand::Number { .. }) {
                return Ok(2);
            }
        }
    }
    if let Operand::Mem(m) = dst {
        // mov mem, r8/r16 or mov mem, imm
        let enc = classify_mem(m, None)?;
        match src {
            Operand::Ident { name, .. } => {
                if Reg8::from_name(&name.to_ascii_lowercase()).is_some()
                    || Reg16::from_name(&name.to_ascii_lowercase()).is_some()
                {
                    return Ok(2 + enc.extra_bytes());
                }
            }
            Operand::Number { .. } => {
                // C6/C7 modrm imm — assume word for now.
                return Ok(3 + enc.extra_bytes());
            }
            _ => {}
        }
    }
    Err(EncodeError {
        span: combined_span(dst, src),
        message: "unsupported mov form in this assembler slice".into(),
    })
}

fn arith_size(dst: &Operand, src: &Operand) -> Result<u16, EncodeError> {
    let dst_name = ident_name(dst);
    let src_name = ident_name(src);

    // reg, reg
    if let (Some(d), Some(s)) = (dst_name.as_deref(), src_name.as_deref()) {
        if Reg16::from_name(d).is_some() && Reg16::from_name(s).is_some() {
            return Ok(2);
        }
        if Reg8::from_name(d).is_some() && Reg8::from_name(s).is_some() {
            return Ok(2);
        }
    }

    // reg, imm and reg8, imm. Treat a non-register Ident the same as a
    // Number for sizing: it will resolve to a constant via the label /
    // EQU table at emit time.
    fn is_imm_like(op: &Operand) -> bool {
        match op {
            Operand::Number { .. } => true,
            Operand::Ident { name, .. } => {
                Reg8::from_name(&name.to_ascii_lowercase()).is_none()
                    && Reg16::from_name(&name.to_ascii_lowercase()).is_none()
            }
            _ => false,
        }
    }
    if let Some(d) = dst_name.as_deref() {
        if Reg16::from_name(d).is_some() && is_imm_like(src) {
            if d.eq_ignore_ascii_case("ax") {
                return Ok(3); // 05 imm16 etc
            }
            return Ok(4); // 81 /op rm imm16
        }
        if Reg8::from_name(d).is_some() && is_imm_like(src) {
            if d.eq_ignore_ascii_case("al") {
                return Ok(2); // 04 imm8 etc
            }
            return Ok(3); // 80 /op rm imm8
        }
    }

    // reg, mem  (form 2 / 3 of the 00..3D group)
    if let Some(d) = dst_name.as_deref() {
        if let Operand::Mem(m) = src {
            let enc = classify_mem(m, None)?;
            if Reg16::from_name(d).is_some() {
                return Ok(2 + enc.extra_bytes());
            }
            if Reg8::from_name(d).is_some() {
                return Ok(2 + enc.extra_bytes());
            }
        }
    }

    // mem, reg  (form 0 / 1)
    if let Operand::Mem(m) = dst {
        let enc = classify_mem(m, None)?;
        if let Some(s) = src_name.as_deref() {
            if Reg16::from_name(s).is_some() || Reg8::from_name(s).is_some() {
                return Ok(2 + enc.extra_bytes());
            }
        }
        // mem, imm — use 81 /op (4 bytes total + disp) for u16, 80 /op for u8.
        // We assume word width for now; later slices will honor `BYTE PTR`.
        if let Operand::Number { .. } = src {
            return Ok(4 + enc.extra_bytes());
        }
    }

    Err(EncodeError {
        span: combined_span(dst, src),
        message: "unsupported arithmetic form in this assembler slice".into(),
    })
}

fn emit_instr(
    instr: &Instr,
    here: u16,
    labels: &HashMap<String, u16>,
    out: &mut Vec<u8>,
) -> Result<(), EncodeError> {
    let m = instr.mnemonic.to_ascii_lowercase();
    let one_byte = match m.as_str() {
        "nop" => Some(0x90u8),
        "hlt" => Some(0xF4),
        "ret" => Some(0xC3),
        "iret" => Some(0xCF),
        "cbw" => Some(0x98),
        "cwd" => Some(0x99),
        "lahf" => Some(0x9F),
        "sahf" => Some(0x9E),
        "xlat" | "xlatb" => Some(0xD7),
        "clc" => Some(0xF8),
        "stc" => Some(0xF9),
        "cmc" => Some(0xF5),
        "cld" => Some(0xFC),
        "std" => Some(0xFD),
        "cli" => Some(0xFA),
        "sti" => Some(0xFB),
        "pushf" => Some(0x9C),
        "popf" => Some(0x9D),
        "movsb" => Some(0xA4),
        "movsw" => Some(0xA5),
        "cmpsb" => Some(0xA6),
        "cmpsw" => Some(0xA7),
        "stosb" => Some(0xAA),
        "stosw" => Some(0xAB),
        "lodsb" => Some(0xAC),
        "lodsw" => Some(0xAD),
        "scasb" => Some(0xAE),
        "scasw" => Some(0xAF),
        _ => None,
    };
    if let Some(b) = one_byte {
        out.push(b);
        return Ok(());
    }

    match m.as_str() {
        "int" => {
            let n = require_number_u8(&instr.operands[0])?;
            out.push(0xCD);
            out.push(n);
            Ok(())
        }
        "push" => {
            let name = ident_name(&instr.operands[0]).ok_or(EncodeError {
                span: instr.span,
                message: "expected register operand".into(),
            })?;
            let lname = name.to_ascii_lowercase();
            if let Some(r) = Reg16::from_name(&lname) {
                out.push(0x50 + r.code());
            } else {
                let op = match lname.as_str() {
                    "es" => 0x06,
                    "cs" => 0x0E,
                    "ss" => 0x16,
                    "ds" => 0x1E,
                    _ => {
                        return Err(EncodeError {
                            span: instr.span,
                            message: format!("cannot push `{name}`"),
                        });
                    }
                };
                out.push(op);
            }
            Ok(())
        }
        "pop" => {
            let name = ident_name(&instr.operands[0]).ok_or(EncodeError {
                span: instr.span,
                message: "expected register operand".into(),
            })?;
            let lname = name.to_ascii_lowercase();
            if let Some(r) = Reg16::from_name(&lname) {
                out.push(0x58 + r.code());
            } else {
                let op = match lname.as_str() {
                    "es" => 0x07,
                    "ss" => 0x17,
                    "ds" => 0x1F,
                    _ => {
                        return Err(EncodeError {
                            span: instr.span,
                            message: format!("cannot pop `{name}`"),
                        });
                    }
                };
                out.push(op);
            }
            Ok(())
        }
        "inc" | "dec" => {
            let name = ident_name(&instr.operands[0]).ok_or(EncodeError {
                span: instr.span,
                message: "expected register operand".into(),
            })?;
            let r = Reg16::from_name(&name.to_ascii_lowercase()).ok_or(EncodeError {
                span: instr.span,
                message: format!(
                    "inc/dec accepts only a 16-bit register in this slice (got `{name}`)"
                ),
            })?;
            let base = if m == "inc" { 0x40 } else { 0x48 };
            out.push(base + r.code());
            Ok(())
        }
        "mov" => emit_mov(
            &instr.operands[0],
            &instr.operands[1],
            labels,
            out,
            instr.span,
        ),
        "add" | "sub" | "cmp" | "and" | "or" | "xor" | "adc" | "sbb" => {
            let kind: u8 = match m.as_str() {
                "add" => 0,
                "or" => 1,
                "adc" => 2,
                "sbb" => 3,
                "and" => 4,
                "sub" => 5,
                "xor" => 6,
                _ => 7, // cmp
            };
            emit_alu(
                kind,
                &instr.operands[0],
                &instr.operands[1],
                labels,
                out,
                instr.span,
            )
        }
        "jmp" => emit_jump(0xE9, &instr.operands[0], here, 3, labels, out, instr.span),
        "call" => emit_jump(0xE8, &instr.operands[0], here, 3, labels, out, instr.span),
        m if jcc_opcode(m).is_some() => {
            let opcode = jcc_opcode(m).unwrap();
            emit_short_jump(opcode, &instr.operands[0], here, labels, out, instr.span)
        }
        m if shift_subop(m).is_some() => {
            let sub = shift_subop(m).unwrap();
            emit_shift(
                sub,
                &instr.operands[0],
                &instr.operands[1],
                labels,
                out,
                instr.span,
            )
        }
        _ => Err(EncodeError {
            span: instr.mnemonic_span,
            message: format!("unsupported mnemonic `{m}`"),
        }),
    }
}

fn emit_shift(
    sub: u8,
    dst: &Operand,
    src: &Operand,
    labels: &HashMap<String, u16>,
    out: &mut Vec<u8>,
    span: Span,
) -> Result<(), EncodeError> {
    // count source: literal 1 → D0/D1 (8/16-bit), CL → D2/D3.
    let by_cl = match src {
        Operand::Number { value: 1, .. } => false,
        Operand::Ident { name, .. } if name.eq_ignore_ascii_case("cl") => true,
        _ => {
            return Err(EncodeError {
                span: src.span(),
                message: "shift count must be 1 or CL".into(),
            });
        }
    };

    // dst is a register or a memory operand. Pick width from dst.
    if let Some(name) = ident_name(dst) {
        let lname = name.to_ascii_lowercase();
        if let Some(r) = Reg8::from_name(&lname) {
            let opcode = if by_cl { 0xD2 } else { 0xD0 };
            out.push(opcode);
            out.push(0xC0 | (sub << 3) | r.code());
            return Ok(());
        }
        if let Some(r) = Reg16::from_name(&lname) {
            let opcode = if by_cl { 0xD3 } else { 0xD1 };
            out.push(opcode);
            out.push(0xC0 | (sub << 3) | r.code());
            return Ok(());
        }
    }
    if let Operand::Mem(m) = dst {
        let enc = classify_mem(m, Some(labels))?;
        // Default to word width for memory; later slices add BYTE PTR.
        let opcode = if by_cl { 0xD3 } else { 0xD1 };
        out.push(opcode);
        out.push(enc.modrm_byte(sub));
        emit_disp(out, enc);
        return Ok(());
    }

    Err(EncodeError {
        span,
        message: "unsupported shift/rotate destination".into(),
    })
}

fn emit_mov(
    dst: &Operand,
    src: &Operand,
    labels: &HashMap<String, u16>,
    out: &mut Vec<u8>,
    span: Span,
) -> Result<(), EncodeError> {
    // mov reg, imm / reg / label
    if let Some(dname) = ident_name(dst) {
        let lname = dname.to_ascii_lowercase();

        if let Some(r) = Reg16::from_name(&lname) {
            match src {
                Operand::Number { value, .. } => {
                    out.push(0xB8 + r.code());
                    out.extend_from_slice(&(*value as u16).to_le_bytes());
                    return Ok(());
                }
                Operand::Ident { name, span } => {
                    if let Some(other) = Reg16::from_name(&name.to_ascii_lowercase()) {
                        out.push(0x89);
                        out.push(0xC0 | (other.code() << 3) | r.code());
                        return Ok(());
                    }
                    let v = labels.get(name).copied().ok_or(EncodeError {
                        span: *span,
                        message: format!("undefined label `{name}`"),
                    })?;
                    out.push(0xB8 + r.code());
                    out.extend_from_slice(&v.to_le_bytes());
                    return Ok(());
                }
                Operand::Mem(m) => {
                    // mov r16, r/m16 = 8B /r
                    let enc = classify_mem(m, Some(labels))?;
                    out.push(0x8B);
                    out.push(enc.modrm_byte(r.code()));
                    emit_disp(out, enc);
                    return Ok(());
                }
            }
        }

        if let Some(r) = Reg8::from_name(&lname) {
            match src {
                Operand::Number { value, .. } => {
                    out.push(0xB0 + r.code());
                    out.push(*value as u8);
                    return Ok(());
                }
                Operand::Ident { name, .. } => {
                    if let Some(other) = Reg8::from_name(&name.to_ascii_lowercase()) {
                        out.push(0x88);
                        out.push(0xC0 | (other.code() << 3) | r.code());
                        return Ok(());
                    }
                }
                Operand::Mem(m) => {
                    // mov r8, r/m8 = 8A /r
                    let enc = classify_mem(m, Some(labels))?;
                    out.push(0x8A);
                    out.push(enc.modrm_byte(r.code()));
                    emit_disp(out, enc);
                    return Ok(());
                }
            }
        }
    }

    // mov mem, src
    if let Operand::Mem(m) = dst {
        let enc = classify_mem(m, Some(labels))?;
        match src {
            Operand::Ident { name, .. } => {
                let lname = name.to_ascii_lowercase();
                if let Some(r) = Reg16::from_name(&lname) {
                    // mov r/m16, r16 = 89 /r
                    out.push(0x89);
                    out.push(enc.modrm_byte(r.code()));
                    emit_disp(out, enc);
                    return Ok(());
                }
                if let Some(r) = Reg8::from_name(&lname) {
                    out.push(0x88);
                    out.push(enc.modrm_byte(r.code()));
                    emit_disp(out, enc);
                    return Ok(());
                }
            }
            Operand::Number { value, .. } => {
                // mov word ptr [mem], imm — we always emit C7 word form for now.
                out.push(0xC7);
                out.push(enc.modrm_byte(0));
                emit_disp(out, enc);
                out.extend_from_slice(&(*value as u16).to_le_bytes());
                return Ok(());
            }
            _ => {}
        }
    }

    Err(EncodeError {
        span,
        message: "unsupported mov form".into(),
    })
}

fn emit_alu(
    kind: u8,
    dst: &Operand,
    src: &Operand,
    labels: &HashMap<String, u16>,
    out: &mut Vec<u8>,
    span: Span,
) -> Result<(), EncodeError> {
    // mem, reg / mem, imm — the destination is in memory, the source
    // is a register or immediate. Form bits 0/1 select the 8/16 width.
    if let Operand::Mem(m) = dst {
        let enc = classify_mem(m, Some(labels))?;
        if let Some(sname) = ident_name(src) {
            let l = sname.to_ascii_lowercase();
            if let Some(rs) = Reg16::from_name(&l) {
                out.push((kind << 3) | 0x01);
                out.push(enc.modrm_byte(rs.code()));
                emit_disp(out, enc);
                return Ok(());
            }
            if let Some(rs) = Reg8::from_name(&l) {
                out.push(kind << 3);
                out.push(enc.modrm_byte(rs.code()));
                emit_disp(out, enc);
                return Ok(());
            }
        }
        if let Operand::Number { value, .. } = src {
            // 81 /op r/m16, imm16 — assume word width; BYTE PTR support arrives later.
            out.push(0x81);
            out.push(enc.modrm_byte(kind));
            emit_disp(out, enc);
            out.extend_from_slice(&(*value as u16).to_le_bytes());
            return Ok(());
        }
        return Err(EncodeError {
            span,
            message: "unsupported `<alu> mem, _` form".into(),
        });
    }

    let dname = ident_name(dst).ok_or(EncodeError {
        span,
        message: "left side must be a register or memory operand here".into(),
    })?;
    let lname = dname.to_ascii_lowercase();

    // reg, mem — form bits 2/3 select the width. Opcode = (kind<<3) | 0x02 or 0x03.
    if let Operand::Mem(m) = src {
        let enc = classify_mem(m, Some(labels))?;
        if let Some(rd) = Reg16::from_name(&lname) {
            out.push((kind << 3) | 0x03);
            out.push(enc.modrm_byte(rd.code()));
            emit_disp(out, enc);
            return Ok(());
        }
        if let Some(rd) = Reg8::from_name(&lname) {
            out.push((kind << 3) | 0x02);
            out.push(enc.modrm_byte(rd.code()));
            emit_disp(out, enc);
            return Ok(());
        }
    }

    if let (Some(rd), Some(s)) = (
        Reg16::from_name(&lname),
        ident_name(src).and_then(|n| Reg16::from_name(&n.to_ascii_lowercase())),
    ) {
        // r/m,r 16-bit form: opcode = (kind << 3) | 1.
        let opcode = (kind << 3) | 0x01;
        out.push(opcode);
        out.push(0xC0 | (s.code() << 3) | rd.code());
        return Ok(());
    }
    if let (Some(rd), Some(s)) = (
        Reg8::from_name(&lname),
        ident_name(src).and_then(|n| Reg8::from_name(&n.to_ascii_lowercase())),
    ) {
        // r/m,r 8-bit form: opcode = (kind << 3) | 0.
        let opcode = kind << 3;
        out.push(opcode);
        out.push(0xC0 | (s.code() << 3) | rd.code());
        return Ok(());
    }
    if let Some(rd) = Reg16::from_name(&lname) {
        if let Some(value) = resolve_imm(src, labels) {
            if lname == "ax" {
                out.push((kind << 3) | 0x05);
                out.extend_from_slice(&value.to_le_bytes());
            } else {
                out.push(0x81);
                out.push(0xC0 | (kind << 3) | rd.code());
                out.extend_from_slice(&value.to_le_bytes());
            }
            return Ok(());
        }
    }
    if let Some(rd) = Reg8::from_name(&lname) {
        if let Some(value) = resolve_imm(src, labels) {
            if lname == "al" {
                out.push((kind << 3) | 0x04);
                out.push(value as u8);
            } else {
                out.push(0x80);
                out.push(0xC0 | (kind << 3) | rd.code());
                out.push(value as u8);
            }
            return Ok(());
        }
    }
    Err(EncodeError {
        span,
        message: "unsupported arithmetic form".into(),
    })
}

fn emit_jump(
    opcode: u8,
    target: &Operand,
    here: u16,
    instr_len: u16,
    labels: &HashMap<String, u16>,
    out: &mut Vec<u8>,
    span: Span,
) -> Result<(), EncodeError> {
    let target_addr = resolve_label(target, labels)?;
    let next_ip = here.wrapping_add(instr_len);
    let rel = target_addr.wrapping_sub(next_ip);
    out.push(opcode);
    out.extend_from_slice(&rel.to_le_bytes());
    let _ = span;
    Ok(())
}

fn emit_short_jump(
    opcode: u8,
    target: &Operand,
    here: u16,
    labels: &HashMap<String, u16>,
    out: &mut Vec<u8>,
    span: Span,
) -> Result<(), EncodeError> {
    let target_addr = resolve_label(target, labels)?;
    let next_ip = here.wrapping_add(2);
    let rel32 = (i32::from(target_addr as i16)) - (i32::from(next_ip as i16));
    if !(-128..=127).contains(&rel32) {
        return Err(EncodeError {
            span,
            message: format!("short branch out of range: {rel32} bytes (must be -128..=127)"),
        });
    }
    out.push(opcode);
    out.push(rel32 as i8 as u8);
    Ok(())
}

/// Resolve an operand that should evaluate to an immediate. Numbers and
/// identifiers (label / EQU references) both qualify; anything else
/// returns `None` so callers can fall through to other forms.
fn resolve_imm(op: &Operand, labels: &HashMap<String, u16>) -> Option<u16> {
    match op {
        Operand::Number { value, .. } => Some(*value as u16),
        Operand::Ident { name, .. } => {
            // A bare register identifier in immediate position is rejected
            // upstream; here we just translate label / EQU values.
            if Reg8::from_name(&name.to_ascii_lowercase()).is_some()
                || Reg16::from_name(&name.to_ascii_lowercase()).is_some()
            {
                None
            } else {
                labels.get(name).copied()
            }
        }
        _ => None,
    }
}

fn resolve_label(op: &Operand, labels: &HashMap<String, u16>) -> Result<u16, EncodeError> {
    match op {
        Operand::Number { value, .. } => Ok(*value as u16),
        Operand::Ident { name, span } => labels.get(name).copied().ok_or(EncodeError {
            span: *span,
            message: format!("undefined label `{name}`"),
        }),
        _ => Err(EncodeError {
            span: op.span(),
            message: "expected label or immediate target".into(),
        }),
    }
}

fn jcc_opcode(m: &str) -> Option<u8> {
    Some(match m {
        "jo" => 0x70,
        "jno" => 0x71,
        "jb" | "jc" | "jnae" => 0x72,
        "jnb" | "jnc" | "jae" => 0x73,
        "jz" | "je" => 0x74,
        "jnz" | "jne" => 0x75,
        "jbe" | "jna" => 0x76,
        "ja" | "jnbe" => 0x77,
        "js" => 0x78,
        "jns" => 0x79,
        "jp" | "jpe" => 0x7A,
        "jnp" | "jpo" => 0x7B,
        "jl" | "jnge" => 0x7C,
        "jge" | "jnl" => 0x7D,
        "jle" | "jng" => 0x7E,
        "jg" | "jnle" => 0x7F,
        "loopnz" | "loopne" => 0xE0,
        "loopz" | "loope" => 0xE1,
        "loop" => 0xE2,
        "jcxz" => 0xE3,
        _ => return None,
    })
}

fn ident_name(op: &Operand) -> Option<String> {
    match op {
        Operand::Ident { name, .. } => Some(name.clone()),
        _ => None,
    }
}

fn require_number_u8(op: &Operand) -> Result<u8, EncodeError> {
    match op {
        Operand::Number { value, span } => {
            if *value > 0xFF {
                Err(EncodeError {
                    span: *span,
                    message: format!("value {value} doesn't fit in u8"),
                })
            } else {
                Ok(*value as u8)
            }
        }
        _ => Err(EncodeError {
            span: op.span(),
            message: "expected an 8-bit immediate".into(),
        }),
    }
}

fn combined_span(a: &Operand, b: &Operand) -> Span {
    let s1 = a.span();
    let s2 = b.span();
    Span::new(s1.start.min(s2.start), s1.end.max(s2.end))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::tokenize;
    use crate::parser::parse;

    fn asm(src: &str) -> Vec<u8> {
        let toks = tokenize(src).unwrap();
        let prog = parse(&toks).unwrap();
        encode(&prog).unwrap().bytes
    }

    #[test]
    fn simple_mov_imm_hlt() {
        let bytes = asm("mov ax, 0x1234\nhlt\n");
        assert_eq!(bytes, vec![0xB8, 0x34, 0x12, 0xF4]);
    }

    #[test]
    fn db_string() {
        let bytes = asm("db \"Hi\"\n");
        assert_eq!(bytes, b"Hi");
    }

    #[test]
    fn label_resolves_to_offset_with_org() {
        // org 100h ; mov dx, msg ; hlt ; msg: db "x"
        // mov dx, msg should be encoded as BA <addr-of-msg> low high.
        // After org=0x100, instr is 3+1=4 bytes; msg offset = 0x100+4=0x104.
        let bytes = asm("org 100h\nmov dx, msg\nhlt\nmsg: db \"x\"\n");
        assert_eq!(bytes[0], 0xBA); // mov dx, imm16
        assert_eq!(u16::from_le_bytes([bytes[1], bytes[2]]), 0x104);
        assert_eq!(bytes[3], 0xF4);
        assert_eq!(bytes[4], b'x');
    }

    #[test]
    fn jcc_short_jump_back() {
        // start: nop ; jne start ; hlt
        // nop=0x100, jne at 0x101 (size 2), end at 0x103. rel = 0x100 - 0x103 = -3.
        let bytes = asm("org 100h\nstart: nop\njne start\nhlt\n");
        assert_eq!(bytes, vec![0x90, 0x75, 0xFD, 0xF4]);
    }

    #[test]
    fn arith_reg_reg() {
        let bytes = asm("add ax, bx\n");
        // ADD r/m16, r16  → 01 /r ; mod=11 reg=BX(3) rm=AX(0) → 01 D8.
        assert_eq!(bytes, vec![0x01, 0xD8]);
    }

    #[test]
    fn full_hello_world() {
        let src = "\
            org 100h\n\
            mov dx, msg\n\
            mov ah, 9\n\
            int 21h\n\
            mov ax, 0x4C00\n\
            int 21h\n\
            msg: db \"Hello, world!$\"\n\
        ";
        let bytes = asm(src);
        let mut cpu = emu8086_core::Cpu::new();
        cpu.load_com(&bytes);
        cpu.run_until_halt(1024);
        assert!(cpu.halted);
        assert_eq!(cpu.stdout, b"Hello, world!");
    }

    // ---- memory operands (M2.2) ----

    #[test]
    fn mov_reg_mem_via_bx() {
        // mov al, [bx]   →  8A /r mod=00 reg=AL(0) rm=[BX](7)  → 8A 07
        let bytes = asm("mov al, [bx]\n");
        assert_eq!(bytes, vec![0x8A, 0x07]);
    }

    #[test]
    fn mov_mem_reg_with_disp8() {
        // mov [bx+4], al → 88 /r mod=01 reg=AL(0) rm=[BX](7) disp8=4  → 88 47 04
        let bytes = asm("mov [bx+4], al\n");
        assert_eq!(bytes, vec![0x88, 0x47, 0x04]);
    }

    #[test]
    fn mov_reg_mem_bx_si_pair_with_disp16() {
        // mov ax, [bx+si+0x1234] → 8B /r mod=10 reg=AX(0) rm=[BX+SI](0)
        // disp16=0x1234 → 8B 80 34 12
        let bytes = asm("mov ax, [bx+si+0x1234]\n");
        assert_eq!(bytes, vec![0x8B, 0x80, 0x34, 0x12]);
    }

    #[test]
    fn mov_mem_direct_address() {
        // mov ax, [0x0234] → 8B /r mod=00 reg=AX(0) rm=110 disp16=0x0234
        // → 8B 06 34 02
        let bytes = asm("mov ax, [0x0234]\n");
        assert_eq!(bytes, vec![0x8B, 0x06, 0x34, 0x02]);
    }

    #[test]
    fn mov_word_ptr_imm_to_memory() {
        // mov [bx], 0x0042 → C7 /0 mod=00 rm=[BX](7) imm16  → C7 07 42 00
        let bytes = asm("mov [bx], 0x42\n");
        assert_eq!(bytes, vec![0xC7, 0x07, 0x42, 0x00]);
    }

    #[test]
    fn bp_alone_uses_disp8_zero() {
        // mov al, [bp]    must encode as mod=01 rm=110 disp8=0  →  8A 46 00
        let bytes = asm("mov al, [bp]\n");
        assert_eq!(bytes, vec![0x8A, 0x46, 0x00]);
    }

    #[test]
    fn bx_minus_one_is_signed_disp() {
        // mov al, [bx-1]  →  8A 47 FF  (mod=01 rm=BX disp8=-1)
        let bytes = asm("mov al, [bx-1]\n");
        assert_eq!(bytes, vec![0x8A, 0x47, 0xFF]);
    }

    #[test]
    fn shl_al_by_1() {
        // shl al, 1 → D0 /4 mod=11 rm=AL(0) → D0 E0
        let bytes = asm("shl al, 1\n");
        assert_eq!(bytes, vec![0xD0, 0xE0]);
    }

    #[test]
    fn shr_ax_by_cl() {
        // shr ax, cl → D3 /5 mod=11 rm=AX(0) → D3 E8
        let bytes = asm("shr ax, cl\n");
        assert_eq!(bytes, vec![0xD3, 0xE8]);
    }

    #[test]
    fn rol_byte_at_bx_by_1() {
        // rol [bx], 1 → D1 /0 mod=00 rm=[BX](7) → D1 07 (word width default)
        let bytes = asm("rol [bx], 1\n");
        assert_eq!(bytes, vec![0xD1, 0x07]);
    }

    #[test]
    fn equ_resolves_in_immediate_position() {
        // FOO EQU 0x1234 ; mov ax, FOO ; hlt
        let bytes = asm("FOO equ 0x1234\nmov ax, FOO\nhlt\n");
        // mov ax, imm16 = B8 lo hi ; then F4
        assert_eq!(bytes, vec![0xB8, 0x34, 0x12, 0xF4]);
    }

    #[test]
    fn equ_reused_in_arithmetic() {
        // SHIFT EQU 4 ; mov al, 1 ; add al, SHIFT ; hlt
        // 04 (add al, imm8) — should accept SHIFT as imm.
        let bytes = asm("SHIFT equ 4\nmov al, 1\nadd al, SHIFT\nhlt\n");
        // mov al, 1 = B0 01
        // add al, 4 = 04 04
        // hlt = F4
        assert_eq!(bytes, vec![0xB0, 0x01, 0x04, 0x04, 0xF4]);
    }

    #[test]
    fn add_reg_mem() {
        // add ax, [bx]  →  03 /r mod=00 reg=AX(0) rm=[BX](7) → 03 07
        let bytes = asm("add ax, [bx]\n");
        assert_eq!(bytes, vec![0x03, 0x07]);
    }

    #[test]
    fn cmp_mem_reg_8bit() {
        // cmp [bx+si], al → 38 /r reg=AL(0) rm=[BX+SI](0) mod=00 → 38 00
        // 38 = (kind=7=cmp << 3) | 0 = 0x38
        let bytes = asm("cmp [bx+si], al\n");
        assert_eq!(bytes, vec![0x38, 0x00]);
    }

    #[test]
    fn add_mem_imm16() {
        // add [bx], 1 → 81 /0 mod=00 rm=[BX](7) imm16  → 81 07 01 00
        let bytes = asm("add [bx], 1\n");
        assert_eq!(bytes, vec![0x81, 0x07, 0x01, 0x00]);
    }

    #[test]
    fn invalid_register_pair_diagnoses() {
        let toks = crate::lexer::tokenize("mov ax, [bx+bp]\n").unwrap();
        let prog = crate::parser::parse(&toks).unwrap();
        let err = encode(&prog).unwrap_err();
        assert!(err.message.contains("two base registers"), "got: {err}");
    }
}
