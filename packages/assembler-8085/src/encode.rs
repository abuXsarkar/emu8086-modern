//! AST → bytes. Two passes: pass 1 sizes each statement and records
//! every label's address; pass 2 walks again and emits bytes, resolving
//! label references against the symbol table built in pass 1.

use std::collections::HashMap;

use crate::parser::{DbValue, Operand, Program, Stmt};
use crate::{Error, Output, DEFAULT_ORG};

/// Run the encoder.
pub fn encode(program: &Program) -> Result<Output, Error> {
    let symbols = build_symbol_table(program)?;
    emit(program, &symbols)
}

/// Pass 1: compute the address of each label by walking statements and
/// summing instruction sizes. Also resolves `EQU` constants.
fn build_symbol_table(program: &Program) -> Result<HashMap<String, i64>, Error> {
    let mut symbols: HashMap<String, i64> = HashMap::new();
    let mut origin_seen = false;
    let mut pc: u32 = DEFAULT_ORG.into();
    let mut first_line: HashMap<String, u32> = HashMap::new();

    for stmt in program {
        match stmt {
            Stmt::Org { value, .. } => {
                pc = u32::from(*value);
                origin_seen = true;
            }
            Stmt::Label { name, line } => {
                let key = name.to_ascii_uppercase();
                if let Some(prev) = first_line.get(&key) {
                    return Err(Error::DuplicateLabel {
                        name: name.clone(),
                        line: *line,
                        first_line: *prev,
                    });
                }
                if pc > 0xFFFF {
                    return Err(Error::Encode {
                        line: *line,
                        msg: format!("label `{name}` resolves past 0xFFFF"),
                    });
                }
                symbols.insert(key.clone(), pc as i64);
                first_line.insert(key, *line);
            }
            Stmt::Equ { name, value, line } => {
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
                        DbValue::Byte(_) => 1,
                        DbValue::Str(s) => s.len() as u32,
                    };
                }
            }
            Stmt::Dw { values, .. } => {
                pc += (values.len() * 2) as u32;
            }
            Stmt::Ds { count, .. } => {
                pc += u32::from(*count);
            }
            Stmt::End { .. } => break,
            Stmt::Instr { mnem, operands, line } => {
                pc += instruction_size(mnem, operands, *line)?;
            }
        }
    }
    let _ = origin_seen; // currently informational
    Ok(symbols)
}

/// Pass 2: emit bytes. An `ORG` later in the stream pads forward with
/// zero bytes (mirrors most real assemblers); moving backward into
/// already-emitted code is an error.
fn emit(program: &Program, symbols: &HashMap<String, i64>) -> Result<Output, Error> {
    let mut bytes: Vec<u8> = Vec::new();
    let mut source_map: Vec<u32> = Vec::new();
    let mut origin: Option<u16> = None;

    for stmt in program {
        match stmt {
            Stmt::Org { value, line } => {
                if origin.is_none() {
                    origin = Some(*value);
                } else {
                    let new = u32::from(*value);
                    let base = u32::from(origin.unwrap());
                    if new < base + bytes.len() as u32 {
                        return Err(Error::Encode {
                            line: *line,
                            msg: format!(
                                "ORG {new:#06X} moves backward into already-emitted code"
                            ),
                        });
                    }
                    let gap = new - (base + bytes.len() as u32);
                    bytes.extend(std::iter::repeat(0u8).take(gap as usize));
                    source_map.extend(std::iter::repeat(*line).take(gap as usize));
                }
            }
            Stmt::Label { .. } | Stmt::Equ { .. } => {
                // already in symbol table
            }
            Stmt::End { .. } => break,
            Stmt::Db { values, line } => {
                for v in values {
                    match v {
                        DbValue::Byte(b) => {
                            let byte = byte_value(*b, *line, "DB")?;
                            bytes.push(byte);
                            source_map.push(*line);
                        }
                        DbValue::Str(s) => {
                            for ch in s.bytes() {
                                bytes.push(ch);
                                source_map.push(*line);
                            }
                        }
                    }
                }
            }
            Stmt::Dw { values, line } => {
                for v in values {
                    let w = word_value(*v, *line, "DW")?;
                    bytes.push((w & 0xFF) as u8);
                    bytes.push((w >> 8) as u8);
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
            Stmt::Instr { mnem, operands, line } => {
                emit_instr(mnem, operands, *line, symbols, &mut bytes, &mut source_map)?;
            }
        }
    }

    let symbols_out: Vec<(String, u16)> = symbols
        .iter()
        .filter_map(|(name, v)| u16::try_from(*v).ok().map(|w| (name.clone(), w)))
        .collect();

    Ok(Output {
        origin: origin.unwrap_or(DEFAULT_ORG),
        bytes,
        source_map,
        hints: Vec::new(),
        symbols: symbols_out,
    })
}

fn byte_value(v: i64, line: u32, kind: &'static str) -> Result<u8, Error> {
    if !(-0x80..=0xFF).contains(&v) {
        return Err(Error::ValueOutOfRange { line, kind, value: v });
    }
    Ok((v & 0xFF) as u8)
}

fn word_value(v: i64, line: u32, kind: &'static str) -> Result<u16, Error> {
    if !(-0x8000..=0xFFFF).contains(&v) {
        return Err(Error::ValueOutOfRange { line, kind, value: v });
    }
    Ok((v & 0xFFFF) as u16)
}

fn reg_code(r: char) -> Option<u8> {
    Some(match r {
        'B' => 0,
        'C' => 1,
        'D' => 2,
        'E' => 3,
        'H' => 4,
        'L' => 5,
        'A' => 7,
        _ => return None,
    })
}

fn r_or_m(op: &Operand) -> Option<u8> {
    match op {
        Operand::Reg(c) => reg_code(*c),
        Operand::M => Some(6),
        _ => None,
    }
}

/// `BC=0, DE=1, HL=2, SP=3`. Used by LXI/DAD/INX/DCX.
///
/// 8085 assembly convention writes the *first* register of the pair
/// as the operand: `LXI B, 1234H` loads BC, `DAD H` adds HL to HL.
/// We accept both the abbreviated form (`B`/`D`/`H`/`SP`) and the
/// explicit-pair form (`BC`/`DE`/`HL`/`SP`).
fn pair_op_to_sp(op: &Operand) -> Option<u8> {
    Some(match op {
        Operand::Reg('B') | Operand::Pair("BC") => 0,
        Operand::Reg('D') | Operand::Pair("DE") => 1,
        Operand::Reg('H') | Operand::Pair("HL") => 2,
        Operand::Pair("SP") => 3,
        _ => return None,
    })
}

/// `BC=0, DE=1, HL=2, PSW=3`. Used by PUSH/POP.
fn pair_code_psw(op: &Operand) -> Option<u8> {
    Some(match op {
        Operand::Reg('B') | Operand::Pair("BC") => 0,
        Operand::Reg('D') | Operand::Pair("DE") => 1,
        Operand::Reg('H') | Operand::Pair("HL") => 2,
        Operand::Psw => 3,
        _ => return None,
    })
}

/// Condition codes for conditional jump/call/ret.
/// NZ=0, Z=1, NC=2, C=3, PO=4, PE=5, P=6, M=7
fn cond_for_jump(mnem: &str) -> Option<u8> {
    Some(match mnem {
        "JNZ" | "CNZ" | "RNZ" => 0,
        "JZ"  | "CZ"  | "RZ"  => 1,
        "JNC" | "CNC" | "RNC" => 2,
        "JC"  | "CC"  | "RC"  => 3,
        "JPO" | "CPO" | "RPO" => 4,
        "JPE" | "CPE" | "RPE" => 5,
        "JP"  | "CP"  | "RP"  => 6,
        "JM"  | "CM"  | "RM"  => 7,
        _ => return None,
    })
}

fn instruction_size(mnem: &str, operands: &[Operand], line: u32) -> Result<u32, Error> {
    Ok(match mnem {
        // 1-byte instructions
        "HLT" | "NOP" | "EI" | "DI" | "RIM" | "SIM" | "RLC" | "RRC" | "RAL" | "RAR" | "CMA"
        | "CMC" | "STC" | "DAA" | "XCHG" | "XTHL" | "SPHL" | "PCHL" | "RET" | "RNZ" | "RZ"
        | "RNC" | "RC" | "RPO" | "RPE" | "RP" | "RM" => 1,
        "MOV" => 1,
        "ADD" | "ADC" | "SUB" | "SBB" | "ANA" | "XRA" | "ORA" | "CMP" => 1,
        "INR" | "DCR" => 1,
        "INX" | "DCX" | "DAD" => 1,
        "LDAX" | "STAX" => 1,
        "PUSH" | "POP" => 1,
        // RST n — 1 byte
        "RST" => 1,
        // 2-byte instructions
        "MVI" | "ADI" | "ACI" | "SUI" | "SBI" | "ANI" | "XRI" | "ORI" | "CPI" | "IN" | "OUT" => 2,
        // 3-byte instructions (LXI + LDA/STA/LHLD/SHLD + JMP-family + CALL-family)
        "LXI" | "LDA" | "STA" | "LHLD" | "SHLD" => 3,
        "JMP" | "JNZ" | "JZ" | "JNC" | "JC" | "JPO" | "JPE" | "JP" | "JM" => 3,
        "CALL" | "CNZ" | "CZ" | "CNC" | "CC" | "CPO" | "CPE" | "CP" | "CM" => 3,
        other => {
            let _ = operands;
            return Err(Error::Encode {
                line,
                msg: format!("unknown mnemonic `{other}`"),
            });
        }
    })
}

#[allow(clippy::too_many_lines)]
fn emit_instr(
    mnem: &str,
    operands: &[Operand],
    line: u32,
    symbols: &HashMap<String, i64>,
    bytes: &mut Vec<u8>,
    source_map: &mut Vec<u32>,
) -> Result<(), Error> {
    let push = |buf: &mut Vec<u8>, smap: &mut Vec<u32>, b: u8| {
        buf.push(b);
        smap.push(line);
    };

    let resolve_addr = |op: &Operand| -> Result<u16, Error> {
        match op {
            Operand::Imm(n) => word_value(*n, line, "address"),
            Operand::Label(name) => {
                let key = name.to_ascii_uppercase();
                symbols
                    .get(&key)
                    .copied()
                    .ok_or_else(|| Error::UndefinedLabel { name: name.clone(), line })
                    .and_then(|v| word_value(v, line, "address"))
            }
            _ => Err(Error::Encode {
                line,
                msg: format!("expected address operand for {mnem}"),
            }),
        }
    };

    let resolve_imm8 = |op: &Operand| -> Result<u8, Error> {
        match op {
            Operand::Imm(n) => byte_value(*n, line, "immediate"),
            Operand::Label(name) => {
                let v = symbols
                    .get(&name.to_ascii_uppercase())
                    .copied()
                    .ok_or_else(|| Error::UndefinedLabel { name: name.clone(), line })?;
                byte_value(v, line, "immediate")
            }
            _ => Err(Error::Encode {
                line,
                msg: format!("expected immediate operand for {mnem}"),
            }),
        }
    };

    let resolve_imm16 = |op: &Operand| -> Result<u16, Error> {
        match op {
            Operand::Imm(n) => word_value(*n, line, "16-bit immediate"),
            Operand::Label(name) => {
                let v = symbols
                    .get(&name.to_ascii_uppercase())
                    .copied()
                    .ok_or_else(|| Error::UndefinedLabel { name: name.clone(), line })?;
                word_value(v, line, "16-bit immediate")
            }
            _ => Err(Error::Encode {
                line,
                msg: format!("expected 16-bit immediate operand for {mnem}"),
            }),
        }
    };

    let expect_n_operands = |n: usize| -> Result<(), Error> {
        if operands.len() == n {
            Ok(())
        } else {
            Err(Error::Encode {
                line,
                msg: format!("{mnem} expects {n} operand(s), got {}", operands.len()),
            })
        }
    };

    match mnem {
        // ───── Control ─────────────────────────────────────────────
        "NOP" => {
            expect_n_operands(0)?;
            push(bytes, source_map, 0x00);
        }
        "HLT" => {
            expect_n_operands(0)?;
            push(bytes, source_map, 0x76);
        }
        "EI" => {
            expect_n_operands(0)?;
            push(bytes, source_map, 0xFB);
        }
        "DI" => {
            expect_n_operands(0)?;
            push(bytes, source_map, 0xF3);
        }
        "RIM" => {
            expect_n_operands(0)?;
            push(bytes, source_map, 0x20);
        }
        "SIM" => {
            expect_n_operands(0)?;
            push(bytes, source_map, 0x30);
        }

        // ───── Rotate / single-byte ALU ────────────────────────────
        "RLC" => { expect_n_operands(0)?; push(bytes, source_map, 0x07); }
        "RRC" => { expect_n_operands(0)?; push(bytes, source_map, 0x0F); }
        "RAL" => { expect_n_operands(0)?; push(bytes, source_map, 0x17); }
        "RAR" => { expect_n_operands(0)?; push(bytes, source_map, 0x1F); }
        "CMA" => { expect_n_operands(0)?; push(bytes, source_map, 0x2F); }
        "CMC" => { expect_n_operands(0)?; push(bytes, source_map, 0x3F); }
        "STC" => { expect_n_operands(0)?; push(bytes, source_map, 0x37); }
        "DAA" => { expect_n_operands(0)?; push(bytes, source_map, 0x27); }
        "XCHG" => { expect_n_operands(0)?; push(bytes, source_map, 0xEB); }
        "XTHL" => { expect_n_operands(0)?; push(bytes, source_map, 0xE3); }
        "SPHL" => { expect_n_operands(0)?; push(bytes, source_map, 0xF9); }
        "PCHL" => { expect_n_operands(0)?; push(bytes, source_map, 0xE9); }

        // ───── MOV r1, r2  (HLT collides with MOV M,M — that
        // collision is the canonical 8085 quirk and we honor it by
        // emitting 0x76 for MOV M, M as well; the executor decodes
        // 0x76 as HLT regardless.) ────────────────────────────────
        "MOV" => {
            expect_n_operands(2)?;
            let d = r_or_m(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: "MOV destination must be a register or M".into(),
            })?;
            let s = r_or_m(&operands[1]).ok_or_else(|| Error::Encode {
                line,
                msg: "MOV source must be a register or M".into(),
            })?;
            push(bytes, source_map, 0x40 | (d << 3) | s);
        }

        // ───── MVI r, d8 ────────────────────────────────────────────
        "MVI" => {
            expect_n_operands(2)?;
            let d = r_or_m(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: "MVI destination must be a register or M".into(),
            })?;
            push(bytes, source_map, 0x06 | (d << 3));
            push(bytes, source_map, resolve_imm8(&operands[1])?);
        }

        // ───── LXI rp, d16 ──────────────────────────────────────────
        "LXI" => {
            expect_n_operands(2)?;
            let p = pair_op_to_sp(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: "LXI requires register pair B, D, H, or SP".into(),
            })?;
            let w = resolve_imm16(&operands[1])?;
            push(bytes, source_map, 0x01 | (p << 4));
            push(bytes, source_map, (w & 0xFF) as u8);
            push(bytes, source_map, (w >> 8) as u8);
        }

        // ───── LDA / STA / LHLD / SHLD ──────────────────────────────
        "LDA" => {
            expect_n_operands(1)?;
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0x3A);
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }
        "STA" => {
            expect_n_operands(1)?;
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0x32);
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }
        "LHLD" => {
            expect_n_operands(1)?;
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0x2A);
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }
        "SHLD" => {
            expect_n_operands(1)?;
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0x22);
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }

        // ───── LDAX / STAX (BC / DE only) ───────────────────────────
        "LDAX" => {
            expect_n_operands(1)?;
            let op = match &operands[0] {
                Operand::Reg('B') | Operand::Pair("BC") => 0x0A,
                Operand::Reg('D') | Operand::Pair("DE") => 0x1A,
                _ => {
                    return Err(Error::Encode {
                        line,
                        msg: "LDAX requires B or D (the pair's first register)".into(),
                    })
                }
            };
            push(bytes, source_map, op);
        }
        "STAX" => {
            expect_n_operands(1)?;
            let op = match &operands[0] {
                Operand::Reg('B') | Operand::Pair("BC") => 0x02,
                Operand::Reg('D') | Operand::Pair("DE") => 0x12,
                _ => {
                    return Err(Error::Encode {
                        line,
                        msg: "STAX requires B or D (the pair's first register)".into(),
                    })
                }
            };
            push(bytes, source_map, op);
        }

        // ───── ADD / ADC / SUB / SBB / ANA / XRA / ORA / CMP r ─────
        m @ ("ADD" | "ADC" | "SUB" | "SBB" | "ANA" | "XRA" | "ORA" | "CMP") => {
            expect_n_operands(1)?;
            let base: u8 = match m {
                "ADD" => 0x80,
                "ADC" => 0x88,
                "SUB" => 0x90,
                "SBB" => 0x98,
                "ANA" => 0xA0,
                "XRA" => 0xA8,
                "ORA" => 0xB0,
                "CMP" => 0xB8,
                _ => unreachable!(),
            };
            let s = r_or_m(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: format!("{m} requires a register or M"),
            })?;
            push(bytes, source_map, base | s);
        }

        // ───── ADI / ACI / SUI / SBI / ANI / XRI / ORI / CPI ───────
        m @ ("ADI" | "ACI" | "SUI" | "SBI" | "ANI" | "XRI" | "ORI" | "CPI") => {
            expect_n_operands(1)?;
            let opc: u8 = match m {
                "ADI" => 0xC6,
                "ACI" => 0xCE,
                "SUI" => 0xD6,
                "SBI" => 0xDE,
                "ANI" => 0xE6,
                "XRI" => 0xEE,
                "ORI" => 0xF6,
                "CPI" => 0xFE,
                _ => unreachable!(),
            };
            push(bytes, source_map, opc);
            push(bytes, source_map, resolve_imm8(&operands[0])?);
        }

        // ───── INR / DCR r ──────────────────────────────────────────
        "INR" => {
            expect_n_operands(1)?;
            let r = r_or_m(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: "INR requires register or M".into(),
            })?;
            push(bytes, source_map, 0x04 | (r << 3));
        }
        "DCR" => {
            expect_n_operands(1)?;
            let r = r_or_m(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: "DCR requires register or M".into(),
            })?;
            push(bytes, source_map, 0x05 | (r << 3));
        }

        // ───── INX / DCX / DAD rp ───────────────────────────────────
        "INX" => {
            expect_n_operands(1)?;
            let p = pair_op_to_sp_code(&operands[0], line, "INX")?;
            push(bytes, source_map, 0x03 | (p << 4));
        }
        "DCX" => {
            expect_n_operands(1)?;
            let p = pair_op_to_sp_code(&operands[0], line, "DCX")?;
            push(bytes, source_map, 0x0B | (p << 4));
        }
        "DAD" => {
            expect_n_operands(1)?;
            let p = pair_op_to_sp_code(&operands[0], line, "DAD")?;
            push(bytes, source_map, 0x09 | (p << 4));
        }

        // ───── JMP / conditional jumps ──────────────────────────────
        "JMP" => {
            expect_n_operands(1)?;
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0xC3);
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }
        m @ ("JNZ" | "JZ" | "JNC" | "JC" | "JPO" | "JPE" | "JP" | "JM") => {
            expect_n_operands(1)?;
            let cc = cond_for_jump(m).unwrap();
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0xC2 | (cc << 3));
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }

        // ───── CALL / conditional calls ────────────────────────────
        "CALL" => {
            expect_n_operands(1)?;
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0xCD);
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }
        m @ ("CNZ" | "CZ" | "CNC" | "CC" | "CPO" | "CPE" | "CP" | "CM") => {
            expect_n_operands(1)?;
            let cc = cond_for_jump(m).unwrap();
            let a = resolve_addr(&operands[0])?;
            push(bytes, source_map, 0xC4 | (cc << 3));
            push(bytes, source_map, (a & 0xFF) as u8);
            push(bytes, source_map, (a >> 8) as u8);
        }

        // ───── RET / conditional returns ───────────────────────────
        "RET" => {
            expect_n_operands(0)?;
            push(bytes, source_map, 0xC9);
        }
        m @ ("RNZ" | "RZ" | "RNC" | "RC" | "RPO" | "RPE" | "RP" | "RM") => {
            expect_n_operands(0)?;
            let cc = cond_for_jump(m).unwrap();
            push(bytes, source_map, 0xC0 | (cc << 3));
        }

        // ───── RST n ───────────────────────────────────────────────
        "RST" => {
            expect_n_operands(1)?;
            let n = match &operands[0] {
                Operand::Imm(n) if (0..=7).contains(n) => *n as u8,
                _ => {
                    return Err(Error::Encode {
                        line,
                        msg: "RST takes a number 0..7".into(),
                    })
                }
            };
            push(bytes, source_map, 0xC7 | (n << 3));
        }

        // ───── PUSH / POP rp (rp in {B,D,H,PSW}) ───────────────────
        "PUSH" => {
            expect_n_operands(1)?;
            let p = pair_code_psw(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: "PUSH requires B, D, H, or PSW".into(),
            })?;
            push(bytes, source_map, 0xC5 | (p << 4));
        }
        "POP" => {
            expect_n_operands(1)?;
            let p = pair_code_psw(&operands[0]).ok_or_else(|| Error::Encode {
                line,
                msg: "POP requires B, D, H, or PSW".into(),
            })?;
            push(bytes, source_map, 0xC1 | (p << 4));
        }

        // ───── IN / OUT port ───────────────────────────────────────
        "IN" => {
            expect_n_operands(1)?;
            push(bytes, source_map, 0xDB);
            push(bytes, source_map, resolve_imm8(&operands[0])?);
        }
        "OUT" => {
            expect_n_operands(1)?;
            push(bytes, source_map, 0xD3);
            push(bytes, source_map, resolve_imm8(&operands[0])?);
        }

        other => {
            return Err(Error::Encode {
                line,
                msg: format!("unknown mnemonic `{other}`"),
            });
        }
    }
    Ok(())
}

fn pair_op_to_sp_code(op: &Operand, line: u32, mnem: &str) -> Result<u8, Error> {
    pair_op_to_sp(op).ok_or_else(|| Error::Encode {
        line,
        msg: format!("{mnem} requires register pair B, D, H, or SP"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assemble;

    fn asm(src: &str) -> Vec<u8> {
        assemble(src).unwrap().bytes
    }

    #[test]
    fn mov_a_b_is_0x78() {
        assert_eq!(asm("MOV A, B"), vec![0x78]);
    }

    #[test]
    fn mov_m_b_is_0x70() {
        assert_eq!(asm("MOV M, B"), vec![0x70]);
    }

    #[test]
    fn mvi_each_register() {
        // MVI A,01H = 3E 01; MVI B = 06; MVI C = 0E; ... MVI L = 2E; MVI M = 36
        assert_eq!(asm("MVI A, 1"), vec![0x3E, 0x01]);
        assert_eq!(asm("MVI B, 1"), vec![0x06, 0x01]);
        assert_eq!(asm("MVI C, 1"), vec![0x0E, 0x01]);
        assert_eq!(asm("MVI D, 1"), vec![0x16, 0x01]);
        assert_eq!(asm("MVI E, 1"), vec![0x1E, 0x01]);
        assert_eq!(asm("MVI H, 1"), vec![0x26, 0x01]);
        assert_eq!(asm("MVI L, 1"), vec![0x2E, 0x01]);
        assert_eq!(asm("MVI M, 1"), vec![0x36, 0x01]);
    }

    #[test]
    fn lxi_all_pairs() {
        // LXI B = 01, LXI D = 11, LXI H = 21, LXI SP = 31; payload LE
        assert_eq!(asm("LXI B, 1234H"), vec![0x01, 0x34, 0x12]);
        assert_eq!(asm("LXI D, 1234H"), vec![0x11, 0x34, 0x12]);
        assert_eq!(asm("LXI H, 1234H"), vec![0x21, 0x34, 0x12]);
        assert_eq!(asm("LXI SP, 1234H"), vec![0x31, 0x34, 0x12]);
    }

    #[test]
    fn lda_sta_lhld_shld() {
        assert_eq!(asm("LDA 2050H"), vec![0x3A, 0x50, 0x20]);
        assert_eq!(asm("STA 3050H"), vec![0x32, 0x50, 0x30]);
        assert_eq!(asm("LHLD 2050H"), vec![0x2A, 0x50, 0x20]);
        assert_eq!(asm("SHLD 3050H"), vec![0x22, 0x50, 0x30]);
    }

    #[test]
    fn add_each_register() {
        assert_eq!(asm("ADD B"), vec![0x80]);
        assert_eq!(asm("ADD C"), vec![0x81]);
        assert_eq!(asm("ADD M"), vec![0x86]);
        assert_eq!(asm("ADD A"), vec![0x87]);
    }

    #[test]
    fn arith_immediate_family() {
        assert_eq!(asm("ADI 0FFH"), vec![0xC6, 0xFF]);
        assert_eq!(asm("ACI 1"), vec![0xCE, 0x01]);
        assert_eq!(asm("SUI 1"), vec![0xD6, 0x01]);
        assert_eq!(asm("SBI 1"), vec![0xDE, 0x01]);
        assert_eq!(asm("ANI 0FH"), vec![0xE6, 0x0F]);
        assert_eq!(asm("XRI 1"), vec![0xEE, 0x01]);
        assert_eq!(asm("ORI 1"), vec![0xF6, 0x01]);
        assert_eq!(asm("CPI 5"), vec![0xFE, 0x05]);
    }

    #[test]
    fn inr_dcr_inx_dcx_dad() {
        assert_eq!(asm("INR A"), vec![0x3C]);
        assert_eq!(asm("DCR C"), vec![0x0D]);
        assert_eq!(asm("INX H"), vec![0x23]);
        assert_eq!(asm("DCX SP"), vec![0x3B]);
        assert_eq!(asm("DAD B"), vec![0x09]);
        assert_eq!(asm("DAD D"), vec![0x19]);
        assert_eq!(asm("DAD H"), vec![0x29]);
    }

    #[test]
    fn jumps_calls_returns() {
        // Numeric jump address
        assert_eq!(asm("JMP 2010H"), vec![0xC3, 0x10, 0x20]);
        assert_eq!(asm("JNZ 2010H"), vec![0xC2, 0x10, 0x20]);
        assert_eq!(asm("JZ 2010H"), vec![0xCA, 0x10, 0x20]);
        assert_eq!(asm("CALL 1234H"), vec![0xCD, 0x34, 0x12]);
        assert_eq!(asm("RET"), vec![0xC9]);
        assert_eq!(asm("RNZ"), vec![0xC0]);
        assert_eq!(asm("RZ"), vec![0xC8]);
    }

    #[test]
    fn push_pop_each_pair() {
        assert_eq!(asm("PUSH B"), vec![0xC5]);
        assert_eq!(asm("PUSH D"), vec![0xD5]);
        assert_eq!(asm("PUSH H"), vec![0xE5]);
        assert_eq!(asm("PUSH PSW"), vec![0xF5]);
        assert_eq!(asm("POP PSW"), vec![0xF1]);
    }

    #[test]
    fn rst_table() {
        for n in 0..=7 {
            let asm_src = format!("RST {n}");
            assert_eq!(asm(&asm_src), vec![0xC7 | ((n as u8) << 3)]);
        }
    }

    #[test]
    fn db_emits_bytes_and_strings() {
        let out = assemble("DB 1, 2, 3, 'AB'").unwrap();
        assert_eq!(out.bytes, vec![0x01, 0x02, 0x03, 0x41, 0x42]);
    }

    #[test]
    fn dw_little_endian() {
        let out = assemble("DW 1234H, 0BEEFH").unwrap();
        assert_eq!(out.bytes, vec![0x34, 0x12, 0xEF, 0xBE]);
    }

    #[test]
    fn ds_pads_with_zeros() {
        let out = assemble("DS 4").unwrap();
        assert_eq!(out.bytes, vec![0, 0, 0, 0]);
    }

    #[test]
    fn equ_resolves_to_value() {
        let out = assemble("BUF EQU 2050H\nLDA BUF\nHLT").unwrap();
        assert_eq!(out.bytes, vec![0x3A, 0x50, 0x20, 0x76]);
    }

    #[test]
    fn undefined_label_errors_cleanly() {
        let err = assemble("JMP NOWHERE").unwrap_err();
        assert!(matches!(err, Error::UndefinedLabel { .. }));
    }

    #[test]
    fn ldax_stax_pair_check() {
        assert_eq!(asm("LDAX B"), vec![0x0A]);
        assert_eq!(asm("LDAX D"), vec![0x1A]);
        assert_eq!(asm("STAX B"), vec![0x02]);
        assert_eq!(asm("STAX D"), vec![0x12]);
    }

    #[test]
    fn rotates_and_misc() {
        assert_eq!(asm("RLC"), vec![0x07]);
        assert_eq!(asm("RRC"), vec![0x0F]);
        assert_eq!(asm("RAL"), vec![0x17]);
        assert_eq!(asm("RAR"), vec![0x1F]);
        assert_eq!(asm("CMA"), vec![0x2F]);
        assert_eq!(asm("CMC"), vec![0x3F]);
        assert_eq!(asm("STC"), vec![0x37]);
        assert_eq!(asm("DAA"), vec![0x27]);
        assert_eq!(asm("XCHG"), vec![0xEB]);
        assert_eq!(asm("XTHL"), vec![0xE3]);
        assert_eq!(asm("SPHL"), vec![0xF9]);
        assert_eq!(asm("PCHL"), vec![0xE9]);
    }

    #[test]
    fn in_out_port() {
        assert_eq!(asm("IN 5"), vec![0xDB, 0x05]);
        assert_eq!(asm("OUT 0FFH"), vec![0xD3, 0xFF]);
    }
}
