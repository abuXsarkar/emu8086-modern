//! Encoder: AST → bytes. Two passes — pass 1 sizes each item and lays out
//! labels, pass 2 emits bytes resolving forward label references.

use std::collections::HashMap;
use std::fmt;

use crate::lexer::Span;
use crate::parser::{DataItem, Directive, Instr, Item, Operand, Program};

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
            Item::Label { .. } | Item::Directive(Directive::Org { .. }) => {}
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
        | "clc" | "stc" | "cmc" | "cld" | "std" | "cli" | "sti" | "pushf" | "popf"
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

fn mov_size(dst: &Operand, src: &Operand) -> Result<u16, EncodeError> {
    // mov reg16, imm16: B8+r ib ib  (3)
    // mov reg8, imm8:   B0+r ib    (2)
    // mov reg16, label: B8+r ib ib (3)
    // mov reg, reg:     2 bytes
    if let Some(name) = ident_name(dst) {
        if Reg16::from_name(&name).is_some() {
            if matches!(src, Operand::Number { .. } | Operand::Ident { .. }) {
                return Ok(3);
            }
            if let Some(s) = ident_name(src) {
                if Reg16::from_name(&s).is_some() {
                    return Ok(2);
                }
            }
        }
        if Reg8::from_name(&name).is_some() {
            if matches!(src, Operand::Number { .. }) {
                return Ok(2);
            }
            if let Some(s) = ident_name(src) {
                if Reg8::from_name(&s).is_some() {
                    return Ok(2);
                }
            }
        }
    }
    Err(EncodeError {
        span: combined_span(dst, src),
        message: "unsupported mov form in this assembler slice".into(),
    })
}

fn arith_size(dst: &Operand, src: &Operand) -> Result<u16, EncodeError> {
    // r/r 16: 2 bytes ; r/r 8: 2 bytes ; r16, imm: 3-4 ; r8, imm: 2-3.
    // For M2.1 we support `add reg, reg` (2) and `add r16, imm16` via 81 (4).
    let dst_name = ident_name(dst);
    let src_name = ident_name(src);
    if let (Some(d), Some(s)) = (dst_name.as_deref(), src_name.as_deref()) {
        if Reg16::from_name(d).is_some() && Reg16::from_name(s).is_some() {
            return Ok(2);
        }
        if Reg8::from_name(d).is_some() && Reg8::from_name(s).is_some() {
            return Ok(2);
        }
    }
    if let Some(d) = dst_name.as_deref() {
        if Reg16::from_name(d).is_some() && matches!(src, Operand::Number { .. }) {
            // Special-case AL/AX accumulator forms to keep size minimal:
            if d.eq_ignore_ascii_case("ax") {
                return Ok(3); // 05 imm16 etc
            }
            return Ok(4); // 81 /op rm imm16
        }
        if Reg8::from_name(d).is_some() && matches!(src, Operand::Number { .. }) {
            if d.eq_ignore_ascii_case("al") {
                return Ok(2); // 04 imm8 etc
            }
            return Ok(3); // 80 /op rm imm8
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
        _ => Err(EncodeError {
            span: instr.mnemonic_span,
            message: format!("unsupported mnemonic `{m}`"),
        }),
    }
}

fn emit_mov(
    dst: &Operand,
    src: &Operand,
    labels: &HashMap<String, u16>,
    out: &mut Vec<u8>,
    span: Span,
) -> Result<(), EncodeError> {
    let dname = ident_name(dst).ok_or(EncodeError {
        span,
        message: "left side of mov must be a register here".into(),
    })?;
    let lname = dname.to_ascii_lowercase();

    // mov reg16, imm16 / label
    if let Some(r) = Reg16::from_name(&lname) {
        match src {
            Operand::Number { value, .. } => {
                out.push(0xB8 + r.code());
                let v = *value as u16;
                out.extend_from_slice(&v.to_le_bytes());
                return Ok(());
            }
            Operand::Ident { name, span } => {
                if let Some(other) = Reg16::from_name(&name.to_ascii_lowercase()) {
                    // mov r16, r16 — encode as 89 /reg=src/rm=dst,mod=11.
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
            _ => {}
        }
    }

    // mov reg8, imm8 / reg8
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
    out: &mut Vec<u8>,
    span: Span,
) -> Result<(), EncodeError> {
    let dname = ident_name(dst).ok_or(EncodeError {
        span,
        message: "left side must be a register here".into(),
    })?;
    let lname = dname.to_ascii_lowercase();

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
    if let (Some(rd), Operand::Number { value, .. }) = (Reg16::from_name(&lname), src) {
        if lname == "ax" {
            // 05 imm16 (ADD AX,imm16) etc — accumulator short form.
            out.push((kind << 3) | 0x05);
            out.extend_from_slice(&(*value as u16).to_le_bytes());
        } else {
            // 81 /kind rm imm16.
            out.push(0x81);
            out.push(0xC0 | (kind << 3) | rd.code());
            out.extend_from_slice(&(*value as u16).to_le_bytes());
        }
        return Ok(());
    }
    if let (Some(rd), Operand::Number { value, .. }) = (Reg8::from_name(&lname), src) {
        if lname == "al" {
            out.push((kind << 3) | 0x04);
            out.push(*value as u8);
        } else {
            out.push(0x80);
            out.push(0xC0 | (kind << 3) | rd.code());
            out.push(*value as u8);
        }
        return Ok(());
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
        // The same hand-assembled sequence the M1.6 CLI test uses, modulo
        // the `pad` we used there: the assembler's layout puts msg right
        // after the second `int 21h`, so msg offset = 0x100 + size(prog).
        // We just assert that the program runs and prints the string.
        let mut cpu = emu8086_core::Cpu::new();
        cpu.load_com(&bytes);
        cpu.run_until_halt(1024);
        assert!(cpu.halted);
        assert_eq!(cpu.stdout, b"Hello, world!");
    }
}
