//! AST → bytes. Two passes: pass 1 sizes each statement and builds
//! the symbol table; pass 2 walks again and emits bytes, resolving
//! label and symbol references.
//!
//! Covers the canonical lab-program mnemonic set (see
//! `docs/plans/8051-port-research.md` §3). Extended SFR-specific
//! ops and the rarer addressing forms can follow.

use std::collections::HashMap;

use crate::parser::{DbValue, Operand, Program, Stmt};
use crate::{Error, Output, DEFAULT_ORG};

pub fn encode(program: &Program) -> Result<Output, Error> {
    let symbols = build_symbol_table(program)?;
    emit(program, &symbols)
}

fn build_symbol_table(program: &Program) -> Result<HashMap<String, i64>, Error> {
    let mut symbols: HashMap<String, i64> = HashMap::new();
    let mut first_line: HashMap<String, u32> = HashMap::new();
    let mut pc: u32 = u32::from(DEFAULT_ORG);

    for stmt in program {
        match stmt {
            Stmt::Org { value, .. } => pc = u32::from(*value),
            Stmt::Label { name, line } => {
                let key = name.to_ascii_uppercase();
                if let Some(prev) = first_line.get(&key) {
                    return Err(Error::DuplicateLabel {
                        name: name.clone(),
                        line: *line,
                        first_line: *prev,
                    });
                }
                symbols.insert(key.clone(), pc as i64);
                first_line.insert(key, *line);
            }
            Stmt::Equ { name, value, line }
            | Stmt::Bit { name, value, line }
            | Stmt::Data { name, value, line } => {
                let key = name.to_ascii_uppercase();
                if let Some(prev) = first_line.get(&key) {
                    return Err(Error::DuplicateLabel {
                        name: name.clone(),
                        line: *line,
                        first_line: *prev,
                    });
                }
                symbols.insert(key.clone(), *value);
                first_line.insert(key, *line);
            }
            Stmt::Db { values, .. } => {
                for v in values {
                    pc += match v {
                        DbValue::Byte(_) | DbValue::Sym(_) => 1,
                        DbValue::Str(s) => s.len() as u32,
                    };
                }
            }
            Stmt::Dw { values, .. } => pc += (values.len() * 2) as u32,
            Stmt::Ds { count, .. } => pc += u32::from(*count),
            Stmt::End { .. } => break,
            Stmt::Instr {
                mnem,
                operands,
                line,
            } => {
                pc += instr_size(mnem, operands, *line)?;
            }
        }
    }
    Ok(symbols)
}

fn emit(program: &Program, symbols: &HashMap<String, i64>) -> Result<Output, Error> {
    let mut bytes: Vec<u8> = Vec::new();
    let mut source_map: Vec<u32> = Vec::new();
    let mut origin: Option<u16> = None;

    for stmt in program {
        match stmt {
            Stmt::Org { value, line } => {
                if let Some(base_origin) = origin {
                    let new = u32::from(*value);
                    let base = u32::from(base_origin);
                    if new < base + bytes.len() as u32 {
                        return Err(Error::Encode {
                            line: *line,
                            msg: format!("ORG {new:#06X} moves backward"),
                        });
                    }
                    let gap = new - (base + bytes.len() as u32);
                    bytes.extend(std::iter::repeat(0u8).take(gap as usize));
                    source_map.extend(std::iter::repeat(*line).take(gap as usize));
                } else {
                    origin = Some(*value);
                }
            }
            Stmt::Label { .. } | Stmt::Equ { .. } | Stmt::Bit { .. } | Stmt::Data { .. } => {}
            Stmt::End { .. } => break,
            Stmt::Db { values, line } => {
                for v in values {
                    match v {
                        DbValue::Byte(b) => {
                            bytes.push(byte_val(*b, *line)?);
                            source_map.push(*line);
                        }
                        DbValue::Str(s) => {
                            for ch in s.bytes() {
                                bytes.push(ch);
                                source_map.push(*line);
                            }
                        }
                        DbValue::Sym(name) => {
                            let v = symbols
                                .get(&name.to_ascii_uppercase())
                                .copied()
                                .ok_or_else(|| Error::UndefinedLabel {
                                    name: name.clone(),
                                    line: *line,
                                })?;
                            bytes.push(byte_val(v, *line)?);
                            source_map.push(*line);
                        }
                    }
                }
            }
            Stmt::Dw { values, line } => {
                for v in values {
                    let w = word_val(*v, *line)?;
                    bytes.push((w >> 8) as u8); // 8051 is big-endian for DPTR-style words
                    bytes.push((w & 0xFF) as u8);
                    source_map.push(*line);
                    source_map.push(*line);
                }
            }
            Stmt::Ds { count, line } => {
                for _ in 0..*count {
                    bytes.push(0);
                    source_map.push(*line);
                }
            }
            Stmt::Instr {
                mnem,
                operands,
                line,
            } => {
                let pc_after_instr = origin.unwrap_or(DEFAULT_ORG) as u32
                    + bytes.len() as u32
                    + instr_size(mnem, operands, *line)?;
                emit_instr(
                    mnem,
                    operands,
                    *line,
                    symbols,
                    pc_after_instr as u16,
                    &mut bytes,
                    &mut source_map,
                )?;
            }
        }
    }

    let symbols_out: Vec<(String, u16)> = symbols
        .iter()
        .filter_map(|(n, v)| u16::try_from(*v).ok().map(|w| (n.clone(), w)))
        .collect();

    Ok(Output {
        origin: origin.unwrap_or(DEFAULT_ORG),
        bytes,
        source_map,
        hints: Vec::new(),
        symbols: symbols_out,
    })
}

fn byte_val(v: i64, line: u32) -> Result<u8, Error> {
    if !(-0x80..=0xFF).contains(&v) {
        return Err(Error::ValueOutOfRange {
            line,
            kind: "byte",
            value: v,
        });
    }
    Ok((v & 0xFF) as u8)
}

fn word_val(v: i64, line: u32) -> Result<u16, Error> {
    if !(-0x8000..=0xFFFF).contains(&v) {
        return Err(Error::ValueOutOfRange {
            line,
            kind: "word",
            value: v,
        });
    }
    Ok((v & 0xFFFF) as u16)
}

/// Compute the instruction size in bytes (1, 2, or 3).
fn instr_size(mnem: &str, operands: &[Operand], line: u32) -> Result<u32, Error> {
    use Operand::{
        Acc, AtAplusDptr, AtAplusPc, AtDptr, AtRi, Bit, Carry, Direct, Dptr, Imm, Label, Rn,
    };
    Ok(match (mnem, operands) {
        ("NOP" | "RET" | "RETI", _) => 1,
        ("RR" | "RL" | "RRC" | "RLC" | "SWAP" | "DA" | "CPL", _)
            if matches!(operands.first(), Some(Acc)) =>
        {
            1
        }
        ("CPL" | "CLR" | "SETB", [Carry]) => 1,
        ("CLR", [Acc]) => 1,
        ("INC" | "DEC", [Acc]) => 1,
        ("INC" | "DEC", [Rn(_)]) => 1,
        ("INC", [Dptr]) => 1,
        ("INC" | "DEC", [AtRi(_)]) => 1,
        ("INC" | "DEC", [Direct(_) | Label(_)]) => 2,
        ("ADD" | "ADDC" | "SUBB" | "ORL" | "ANL" | "XRL", [Acc, Rn(_)]) => 1,
        ("ADD" | "ADDC" | "SUBB" | "ORL" | "ANL" | "XRL", [Acc, AtRi(_)]) => 1,
        ("ADD" | "ADDC" | "SUBB" | "ORL" | "ANL" | "XRL", [Acc, Direct(_) | Label(_)]) => 2,
        ("ADD" | "ADDC" | "SUBB" | "ORL" | "ANL" | "XRL", [Acc, Imm(_)]) => 2,
        ("ORL" | "ANL" | "XRL", [Direct(_) | Label(_), Acc]) => 2,
        ("ORL" | "ANL" | "XRL", [Direct(_) | Label(_), Imm(_)]) => 3,
        ("ORL" | "ANL", [Carry, Bit(_) | Label(_)]) => 2,
        ("MUL" | "DIV", _) => 1,
        ("MOV", [Acc, Rn(_)] | [Rn(_), Acc]) => 1,
        ("MOV", [Acc, AtRi(_)] | [AtRi(_), Acc]) => 1,
        ("MOV", [Acc, Direct(_) | Label(_)]) => 2,
        ("MOV", [Direct(_) | Label(_), Acc]) => 2,
        ("MOV", [Acc, Imm(_)]) => 2,
        ("MOV", [Rn(_), Imm(_)]) => 2,
        ("MOV", [AtRi(_), Imm(_)]) => 2,
        ("MOV", [Rn(_), Direct(_) | Label(_)]) => 2,
        ("MOV", [Direct(_) | Label(_), Rn(_)]) => 2,
        ("MOV", [AtRi(_), Direct(_) | Label(_)]) => 2,
        ("MOV", [Direct(_) | Label(_), AtRi(_)]) => 2,
        ("MOV", [Direct(_) | Label(_), Direct(_) | Label(_)]) => 3,
        ("MOV", [Direct(_) | Label(_), Imm(_)]) => 3,
        ("MOV", [Dptr, Imm(_) | Label(_)]) => 3,
        ("MOV", [Carry, Bit(_) | Label(_)] | [Bit(_) | Label(_), Carry]) => 2,
        ("CLR" | "SETB" | "CPL", [Bit(_) | Label(_)]) => 2,
        ("MOVC", [Acc, AtAplusDptr | AtAplusPc]) => 1,
        ("MOVX", [Acc, AtDptr] | [AtDptr, Acc]) => 1,
        ("MOVX", [Acc, AtRi(_)] | [AtRi(_), Acc]) => 1,
        ("PUSH" | "POP", _) => 2,
        ("XCH", [Acc, Rn(_) | AtRi(_)]) => 1,
        ("XCH", [Acc, Direct(_) | Label(_)]) => 2,
        ("XCHD", [Acc, AtRi(_)]) => 1,
        ("LJMP" | "LCALL", _) => 3,
        ("AJMP" | "ACALL", _) => 2,
        ("SJMP", _) => 2,
        ("JMP", [AtAplusDptr]) => 1,
        ("JC" | "JNC" | "JZ" | "JNZ", _) => 2,
        ("JB" | "JNB" | "JBC", _) => 3,
        ("DJNZ", [Rn(_), _]) => 2,
        ("DJNZ", [Direct(_) | Label(_), _]) => 3,
        ("CJNE", [Acc, Imm(_), _]) => 3,
        ("CJNE", [Acc, Direct(_) | Label(_), _]) => 3,
        ("CJNE", [Rn(_), Imm(_), _]) => 3,
        ("CJNE", [AtRi(_), Imm(_), _]) => 3,
        ("END", _) => 0,
        _ => {
            return Err(Error::Encode {
                line,
                msg: format!("don't know how to size `{mnem}` with operands {operands:?}"),
            })
        }
    })
}

#[allow(clippy::too_many_arguments)]
fn emit_instr(
    mnem: &str,
    operands: &[Operand],
    line: u32,
    symbols: &HashMap<String, i64>,
    pc_after: u16,
    bytes: &mut Vec<u8>,
    source_map: &mut Vec<u32>,
) -> Result<(), Error> {
    use Operand::{
        Acc, AtAplusDptr, AtAplusPc, AtDptr, AtRi, Bit, Carry, Direct, Dptr, Imm, Label, Rn,
    };
    let emit = |buf: &mut Vec<u8>, smap: &mut Vec<u32>, b: u8| {
        buf.push(b);
        smap.push(line);
    };

    let resolve_imm = |op: &Operand| -> Result<u8, Error> {
        match op {
            Imm(n) => byte_val(*n, line),
            Label(name) => {
                let v = symbols
                    .get(&name.to_ascii_uppercase())
                    .copied()
                    .ok_or_else(|| Error::UndefinedLabel {
                        name: name.clone(),
                        line,
                    })?;
                byte_val(v, line)
            }
            _ => Err(Error::Encode {
                line,
                msg: "expected immediate".into(),
            }),
        }
    };

    let resolve_word = |op: &Operand| -> Result<u16, Error> {
        match op {
            Imm(n) => word_val(*n, line),
            Label(name) => {
                let v = symbols
                    .get(&name.to_ascii_uppercase())
                    .copied()
                    .ok_or_else(|| Error::UndefinedLabel {
                        name: name.clone(),
                        line,
                    })?;
                word_val(v, line)
            }
            _ => Err(Error::Encode {
                line,
                msg: "expected 16-bit immediate".into(),
            }),
        }
    };

    let resolve_direct = |op: &Operand| -> Result<u8, Error> {
        match op {
            Direct(n) => byte_val(*n, line),
            Label(name) => {
                let v = symbols
                    .get(&name.to_ascii_uppercase())
                    .copied()
                    .ok_or_else(|| Error::UndefinedLabel {
                        name: name.clone(),
                        line,
                    })?;
                byte_val(v, line)
            }
            _ => Err(Error::Encode {
                line,
                msg: "expected direct address".into(),
            }),
        }
    };

    let resolve_bit = |op: &Operand| -> Result<u8, Error> {
        match op {
            Bit(n) => byte_val(*n, line),
            Label(name) => {
                let v = symbols
                    .get(&name.to_ascii_uppercase())
                    .copied()
                    .ok_or_else(|| Error::UndefinedLabel {
                        name: name.clone(),
                        line,
                    })?;
                byte_val(v, line)
            }
            _ => Err(Error::Encode {
                line,
                msg: "expected bit address".into(),
            }),
        }
    };

    // pc_before is the address of THIS instruction (= pc_after minus
    // the instruction's own size). `$` resolves to pc_before per the
    // 8051 convention.
    let instr_sz = instr_size(mnem, operands, line)? as u16;
    let pc_before = pc_after.wrapping_sub(instr_sz);

    let resolve_rel = |op: &Operand| -> Result<u8, Error> {
        let target = match op {
            Label(name) if name == "$" => pc_before,
            Label(name) => symbols
                .get(&name.to_ascii_uppercase())
                .copied()
                .ok_or_else(|| Error::UndefinedLabel {
                    name: name.clone(),
                    line,
                })? as u16,
            Imm(n) => *n as u16,
            _ => {
                return Err(Error::Encode {
                    line,
                    msg: "expected jump target".into(),
                })
            }
        };
        let off = target as i32 - pc_after as i32;
        if !(-128..=127).contains(&off) {
            return Err(Error::Encode {
                line,
                msg: format!("relative jump out of range: {off}"),
            });
        }
        Ok((off & 0xFF) as u8)
    };

    let resolve_addr = |op: &Operand| -> Result<u16, Error> {
        match op {
            Label(name) if name == "$" => Ok(pc_before),
            Label(name) => Ok(symbols
                .get(&name.to_ascii_uppercase())
                .copied()
                .ok_or_else(|| Error::UndefinedLabel {
                    name: name.clone(),
                    line,
                })? as u16),
            Imm(n) => Ok(*n as u16),
            Direct(n) => Ok(*n as u16),
            _ => Err(Error::Encode {
                line,
                msg: "expected address".into(),
            }),
        }
    };

    match (mnem, operands) {
        ("NOP", _) => emit(bytes, source_map, 0x00),
        ("RET", _) => emit(bytes, source_map, 0x22),
        ("RETI", _) => emit(bytes, source_map, 0x32),
        ("RR", [Acc]) => emit(bytes, source_map, 0x03),
        ("RRC", [Acc]) => emit(bytes, source_map, 0x13),
        ("RL", [Acc]) => emit(bytes, source_map, 0x23),
        ("RLC", [Acc]) => emit(bytes, source_map, 0x33),
        ("DA", [Acc]) => emit(bytes, source_map, 0xD4),
        ("SWAP", [Acc]) => emit(bytes, source_map, 0xC4),
        ("CPL", [Acc]) => emit(bytes, source_map, 0xF4),
        ("CPL", [Carry]) => emit(bytes, source_map, 0xB3),
        ("CLR", [Acc]) => emit(bytes, source_map, 0xE4),
        ("CLR", [Carry]) => emit(bytes, source_map, 0xC3),
        ("SETB", [Carry]) => emit(bytes, source_map, 0xD3),
        ("MUL", _) => emit(bytes, source_map, 0xA4),
        ("DIV", _) => emit(bytes, source_map, 0x84),
        ("JMP", [AtAplusDptr]) => emit(bytes, source_map, 0x73),

        ("INC", [Acc]) => emit(bytes, source_map, 0x04),
        ("INC", [Rn(n)]) => emit(bytes, source_map, 0x08 | (n & 7)),
        ("INC", [Dptr]) => emit(bytes, source_map, 0xA3),
        ("INC", [AtRi(r)]) => emit(bytes, source_map, 0x06 | (r & 1)),
        ("INC", [d @ (Direct(_) | Label(_))]) => {
            emit(bytes, source_map, 0x05);
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("DEC", [Acc]) => emit(bytes, source_map, 0x14),
        ("DEC", [Rn(n)]) => emit(bytes, source_map, 0x18 | (n & 7)),
        ("DEC", [AtRi(r)]) => emit(bytes, source_map, 0x16 | (r & 1)),
        ("DEC", [d @ (Direct(_) | Label(_))]) => {
            emit(bytes, source_map, 0x15);
            emit(bytes, source_map, resolve_direct(d)?);
        }

        // ADD / ADDC / SUBB / ORL / ANL / XRL A, …
        (m @ ("ADD" | "ADDC" | "SUBB" | "ORL" | "ANL" | "XRL"), [Acc, src]) => {
            let base: u8 = match m {
                "ADD" => 0x20,
                "ADDC" => 0x30,
                "SUBB" => 0x90,
                "ORL" => 0x40,
                "ANL" => 0x50,
                "XRL" => 0x60,
                _ => unreachable!(),
            };
            match src {
                Rn(n) => emit(bytes, source_map, base | 0x08 | (n & 7)),
                AtRi(r) => emit(bytes, source_map, base | 0x06 | (r & 1)),
                Direct(_) | Label(_) => {
                    emit(bytes, source_map, base | 0x05);
                    emit(bytes, source_map, resolve_direct(src)?);
                }
                Imm(_) => {
                    emit(bytes, source_map, base | 0x04);
                    emit(bytes, source_map, resolve_imm(src)?);
                }
                _ => {
                    return Err(Error::Encode {
                        line,
                        msg: format!("bad src for {m} A: {src:?}"),
                    })
                }
            }
        }

        // ORL / ANL / XRL direct, A | #imm
        (m @ ("ORL" | "ANL" | "XRL"), [d @ (Direct(_) | Label(_)), Acc]) => {
            let base: u8 = match m {
                "ORL" => 0x42,
                "ANL" => 0x52,
                "XRL" => 0x62,
                _ => unreachable!(),
            };
            emit(bytes, source_map, base);
            emit(bytes, source_map, resolve_direct(d)?);
        }
        (m @ ("ORL" | "ANL" | "XRL"), [d @ (Direct(_) | Label(_)), imm]) => {
            let base: u8 = match m {
                "ORL" => 0x43,
                "ANL" => 0x53,
                "XRL" => 0x63,
                _ => unreachable!(),
            };
            emit(bytes, source_map, base);
            emit(bytes, source_map, resolve_direct(d)?);
            emit(bytes, source_map, resolve_imm(imm)?);
        }

        // ORL/ANL C, bit
        ("ORL", [Carry, bit]) => {
            emit(bytes, source_map, 0x72);
            emit(bytes, source_map, resolve_bit(bit)?);
        }
        ("ANL", [Carry, bit]) => {
            emit(bytes, source_map, 0x82);
            emit(bytes, source_map, resolve_bit(bit)?);
        }

        // MOV forms (a lot)
        ("MOV", [Acc, Rn(n)]) => emit(bytes, source_map, 0xE8 | (n & 7)),
        ("MOV", [Acc, AtRi(r)]) => emit(bytes, source_map, 0xE6 | (r & 1)),
        ("MOV", [Acc, Imm(_)]) => {
            emit(bytes, source_map, 0x74);
            emit(bytes, source_map, resolve_imm(&operands[1])?);
        }
        ("MOV", [Acc, d @ (Direct(_) | Label(_))]) => {
            emit(bytes, source_map, 0xE5);
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("MOV", [Rn(n), Acc]) => emit(bytes, source_map, 0xF8 | (n & 7)),
        ("MOV", [Rn(n), Imm(_)]) => {
            emit(bytes, source_map, 0x78 | (n & 7));
            emit(bytes, source_map, resolve_imm(&operands[1])?);
        }
        ("MOV", [Rn(n), d @ (Direct(_) | Label(_))]) => {
            emit(bytes, source_map, 0xA8 | (n & 7));
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("MOV", [AtRi(r), Acc]) => emit(bytes, source_map, 0xF6 | (r & 1)),
        ("MOV", [AtRi(r), Imm(_)]) => {
            emit(bytes, source_map, 0x76 | (r & 1));
            emit(bytes, source_map, resolve_imm(&operands[1])?);
        }
        ("MOV", [AtRi(r), d @ (Direct(_) | Label(_))]) => {
            emit(bytes, source_map, 0xA6 | (r & 1));
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("MOV", [d @ (Direct(_) | Label(_)), Acc]) => {
            emit(bytes, source_map, 0xF5);
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("MOV", [d @ (Direct(_) | Label(_)), Rn(n)]) => {
            emit(bytes, source_map, 0x88 | (n & 7));
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("MOV", [d @ (Direct(_) | Label(_)), AtRi(r)]) => {
            emit(bytes, source_map, 0x86 | (r & 1));
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("MOV", [dst @ (Direct(_) | Label(_)), src @ (Direct(_) | Label(_))]) => {
            // MOV direct, direct: opcode 85, src direct, dst direct (note operand order in opcode is src then dst per the datasheet)
            emit(bytes, source_map, 0x85);
            emit(bytes, source_map, resolve_direct(src)?);
            emit(bytes, source_map, resolve_direct(dst)?);
        }
        ("MOV", [d @ (Direct(_) | Label(_)), Imm(_)]) => {
            emit(bytes, source_map, 0x75);
            emit(bytes, source_map, resolve_direct(d)?);
            emit(bytes, source_map, resolve_imm(&operands[1])?);
        }
        ("MOV", [Dptr, imm]) => {
            emit(bytes, source_map, 0x90);
            let w = resolve_word(imm)?;
            emit(bytes, source_map, (w >> 8) as u8);
            emit(bytes, source_map, (w & 0xFF) as u8);
        }
        ("MOV", [Carry, bit]) => {
            emit(bytes, source_map, 0xA2);
            emit(bytes, source_map, resolve_bit(bit)?);
        }
        ("MOV", [bit, Carry]) => {
            emit(bytes, source_map, 0x92);
            emit(bytes, source_map, resolve_bit(bit)?);
        }

        // CLR / SETB / CPL bit
        ("CLR", [bit]) => {
            emit(bytes, source_map, 0xC2);
            emit(bytes, source_map, resolve_bit(bit)?);
        }
        ("SETB", [bit]) => {
            emit(bytes, source_map, 0xD2);
            emit(bytes, source_map, resolve_bit(bit)?);
        }
        ("CPL", [bit]) => {
            emit(bytes, source_map, 0xB2);
            emit(bytes, source_map, resolve_bit(bit)?);
        }

        // MOVC
        ("MOVC", [Acc, AtAplusDptr]) => emit(bytes, source_map, 0x93),
        ("MOVC", [Acc, AtAplusPc]) => emit(bytes, source_map, 0x83),

        // MOVX
        ("MOVX", [Acc, AtDptr]) => emit(bytes, source_map, 0xE0),
        ("MOVX", [Acc, AtRi(r)]) => emit(bytes, source_map, 0xE2 | (r & 1)),
        ("MOVX", [AtDptr, Acc]) => emit(bytes, source_map, 0xF0),
        ("MOVX", [AtRi(r), Acc]) => emit(bytes, source_map, 0xF2 | (r & 1)),

        // PUSH / POP
        ("PUSH", [d]) => {
            emit(bytes, source_map, 0xC0);
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("POP", [d]) => {
            emit(bytes, source_map, 0xD0);
            emit(bytes, source_map, resolve_direct(d)?);
        }

        // XCH
        ("XCH", [Acc, Rn(n)]) => emit(bytes, source_map, 0xC8 | (n & 7)),
        ("XCH", [Acc, AtRi(r)]) => emit(bytes, source_map, 0xC6 | (r & 1)),
        ("XCH", [Acc, d @ (Direct(_) | Label(_))]) => {
            emit(bytes, source_map, 0xC5);
            emit(bytes, source_map, resolve_direct(d)?);
        }
        ("XCHD", [Acc, AtRi(r)]) => emit(bytes, source_map, 0xD6 | (r & 1)),

        // LJMP / LCALL / SJMP / AJMP / ACALL
        ("LJMP", [t]) => {
            emit(bytes, source_map, 0x02);
            let a = resolve_addr(t)?;
            emit(bytes, source_map, (a >> 8) as u8);
            emit(bytes, source_map, (a & 0xFF) as u8);
        }
        ("LCALL", [t]) => {
            emit(bytes, source_map, 0x12);
            let a = resolve_addr(t)?;
            emit(bytes, source_map, (a >> 8) as u8);
            emit(bytes, source_map, (a & 0xFF) as u8);
        }
        ("SJMP", [t]) => {
            emit(bytes, source_map, 0x80);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("AJMP", [t]) => {
            let a = resolve_addr(t)?;
            let page = ((a >> 8) & 0x7) as u8;
            emit(bytes, source_map, 0x01 | (page << 5));
            emit(bytes, source_map, (a & 0xFF) as u8);
        }
        ("ACALL", [t]) => {
            let a = resolve_addr(t)?;
            let page = ((a >> 8) & 0x7) as u8;
            emit(bytes, source_map, 0x11 | (page << 5));
            emit(bytes, source_map, (a & 0xFF) as u8);
        }

        // Conditional jumps
        ("JC", [t]) => {
            emit(bytes, source_map, 0x40);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("JNC", [t]) => {
            emit(bytes, source_map, 0x50);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("JZ", [t]) => {
            emit(bytes, source_map, 0x60);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("JNZ", [t]) => {
            emit(bytes, source_map, 0x70);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("JB", [bit, t]) => {
            emit(bytes, source_map, 0x20);
            emit(bytes, source_map, resolve_bit(bit)?);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("JNB", [bit, t]) => {
            emit(bytes, source_map, 0x30);
            emit(bytes, source_map, resolve_bit(bit)?);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("JBC", [bit, t]) => {
            emit(bytes, source_map, 0x10);
            emit(bytes, source_map, resolve_bit(bit)?);
            emit(bytes, source_map, resolve_rel(t)?);
        }

        // DJNZ
        ("DJNZ", [Rn(n), t]) => {
            emit(bytes, source_map, 0xD8 | (n & 7));
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("DJNZ", [d @ (Direct(_) | Label(_)), t]) => {
            emit(bytes, source_map, 0xD5);
            emit(bytes, source_map, resolve_direct(d)?);
            emit(bytes, source_map, resolve_rel(t)?);
        }

        // CJNE
        ("CJNE", [Acc, Imm(_), t]) => {
            emit(bytes, source_map, 0xB4);
            emit(bytes, source_map, resolve_imm(&operands[1])?);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("CJNE", [Acc, d @ (Direct(_) | Label(_)), t]) => {
            emit(bytes, source_map, 0xB5);
            emit(bytes, source_map, resolve_direct(d)?);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("CJNE", [Rn(n), Imm(_), t]) => {
            emit(bytes, source_map, 0xB8 | (n & 7));
            emit(bytes, source_map, resolve_imm(&operands[1])?);
            emit(bytes, source_map, resolve_rel(t)?);
        }
        ("CJNE", [AtRi(r), Imm(_), t]) => {
            emit(bytes, source_map, 0xB6 | (r & 1));
            emit(bytes, source_map, resolve_imm(&operands[1])?);
            emit(bytes, source_map, resolve_rel(t)?);
        }

        _ => {
            return Err(Error::Encode {
                line,
                msg: format!("don't know how to encode `{mnem}` with operands {operands:?}"),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::assemble;

    fn asm(src: &str) -> Vec<u8> {
        assemble(src).unwrap().bytes
    }

    #[test]
    fn nop_is_zero() {
        assert_eq!(asm("NOP"), vec![0x00]);
    }
    #[test]
    fn mov_a_imm_is_74_imm() {
        assert_eq!(asm("MOV A, #42H"), vec![0x74, 0x42]);
    }
    #[test]
    fn mov_a_rn() {
        assert_eq!(asm("MOV A, R3"), vec![0xEB]);
    }
    #[test]
    fn mov_rn_imm() {
        assert_eq!(asm("MOV R5, #0AH"), vec![0x7D, 0x0A]);
    }
    #[test]
    fn add_subb_basic() {
        assert_eq!(asm("ADD A, R1"), vec![0x29]);
        assert_eq!(asm("ADD A, #10"), vec![0x24, 0x0A]);
        assert_eq!(asm("SUBB A, R0"), vec![0x98]);
    }
    #[test]
    fn mul_div() {
        assert_eq!(asm("MUL AB"), vec![0xA4]);
        assert_eq!(asm("DIV AB"), vec![0x84]);
    }
    #[test]
    fn djnz_label_back() {
        let src = "ORG 0\nMOV R0, #5\nLOOP: INC A\nDJNZ R0, LOOP\nSJMP $";
        // MOV R0,#5 = 78 05 ; INC A = 04 ; DJNZ R0, rel ; SJMP $
        let out = asm(src);
        // 78 05 04 D8 FD 80 FE
        assert_eq!(out, vec![0x78, 0x05, 0x04, 0xD8, 0xFD, 0x80, 0xFE]);
    }
    #[test]
    fn ljmp_to_label() {
        let src = "LJMP MAIN\nORG 100H\nMAIN: SJMP $";
        let out = assemble(src).unwrap();
        // LJMP 100H = 02 01 00 ; then gap to 100H ; then SJMP $ = 80 FE
        assert_eq!(out.bytes[0], 0x02);
        assert_eq!(out.bytes[1], 0x01);
        assert_eq!(out.bytes[2], 0x00);
        // Last two bytes are SJMP $
        let n = out.bytes.len();
        assert_eq!(&out.bytes[n - 2..n], &[0x80, 0xFE]);
    }
    #[test]
    fn setb_clr_p1() {
        // SETB P1.0 → D2 90 ; CLR P1.7 → C2 97
        assert_eq!(asm("SETB P1.0"), vec![0xD2, 0x90]);
        assert_eq!(asm("CLR P1.7"), vec![0xC2, 0x97]);
    }
    #[test]
    fn mov_dptr_imm16() {
        assert_eq!(asm("MOV DPTR, #1234H"), vec![0x90, 0x12, 0x34]);
    }
    #[test]
    fn movx_a_dptr() {
        assert_eq!(asm("MOVX A, @DPTR"), vec![0xE0]);
        assert_eq!(asm("MOVX @DPTR, A"), vec![0xF0]);
    }
    #[test]
    fn movc_a_at_a_plus_dptr() {
        assert_eq!(asm("MOVC A, @A+DPTR"), vec![0x93]);
        assert_eq!(asm("MOVC A, @A+PC"), vec![0x83]);
    }
}
