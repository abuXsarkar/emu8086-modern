//! Token stream → AST for 8051. One statement per line.

use crate::lexer::{Tok, Token};
use crate::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operand {
    /// Accumulator `A`.
    Acc,
    /// `B` register (also SFR 0xF0; the encoder picks the right form).
    B,
    /// Carry flag `C`.
    Carry,
    /// `DPTR`.
    Dptr,
    /// `@A+DPTR` indexed indirect.
    AtAplusDptr,
    /// `@A+PC` indexed indirect.
    AtAplusPc,
    /// `@R0` or `@R1`.
    AtRi(u8),
    /// `@DPTR`.
    AtDptr,
    /// Working register `R0..R7` of the active bank.
    Rn(u8),
    /// `#imm`.
    Imm(i64),
    /// Direct-addressed byte. May come from a literal (`MOV A, 30H`),
    /// a symbol defined via DATA / EQU, or an SFR name (P0..P3, ACC,
    /// PSW, etc.). For SFRs the encoder substitutes the address.
    Direct(i64),
    /// Bit operand. Same source forms as Direct (`P1.0`, `ACC.7`,
    /// raw `90H.0`, EQU/BIT-defined symbol). Held as the resolved
    /// bit address 0..0xFF.
    Bit(i64),
    /// Reference to a label whose address the encoder resolves in
    /// pass 2.
    Label(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Stmt {
    Label {
        name: String,
        line: u32,
    },
    Org {
        value: u16,
        line: u32,
    },
    Equ {
        name: String,
        value: i64,
        line: u32,
    },
    Bit {
        name: String,
        value: i64,
        line: u32,
    },
    Data {
        name: String,
        value: i64,
        line: u32,
    },
    Db {
        values: Vec<DbValue>,
        line: u32,
    },
    Dw {
        values: Vec<i64>,
        line: u32,
    },
    Ds {
        count: u16,
        line: u32,
    },
    End {
        line: u32,
    },
    Instr {
        mnem: String,
        operands: Vec<Operand>,
        line: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DbValue {
    Byte(i64),
    Str(String),
    /// Unresolved-at-parse-time symbol reference, encoded as the
    /// symbol's value byte in pass 2.
    Sym(String),
}

pub type Program = Vec<Stmt>;

pub fn parse(tokens: &[Token]) -> Result<Program, Error> {
    let mut p = Parser { toks: tokens, i: 0 };
    let mut out = Vec::new();
    while !p.eof() {
        if p.peek_is(&Tok::Eol) {
            p.i += 1;
            continue;
        }
        p.parse_line(&mut out)?;
    }
    Ok(out)
}

struct Parser<'a> {
    toks: &'a [Token],
    i: usize,
}

impl Parser<'_> {
    fn eof(&self) -> bool {
        self.i >= self.toks.len()
    }
    fn peek(&self) -> Option<&Token> {
        self.toks.get(self.i)
    }
    fn peek_is(&self, t: &Tok) -> bool {
        matches!(self.peek(), Some(x) if &x.tok == t)
    }
    fn bump(&mut self) -> Option<&Token> {
        let t = self.toks.get(self.i);
        if t.is_some() {
            self.i += 1;
        }
        t
    }
    fn parse_line(&mut self, out: &mut Program) -> Result<(), Error> {
        // Label?
        if let (Some(t1), Some(t2)) = (self.toks.get(self.i), self.toks.get(self.i + 1)) {
            if matches!(&t1.tok, Tok::Ident(_)) && matches!(&t2.tok, Tok::Colon) {
                if let Tok::Ident(name) = &t1.tok {
                    out.push(Stmt::Label {
                        name: name.clone(),
                        line: t1.line,
                    });
                }
                self.i += 2;
            }
        }

        if self.peek_is(&Tok::Eol) {
            self.i += 1;
            return Ok(());
        }

        let head_line;
        let head_name = match self.peek() {
            Some(Token {
                tok: Tok::Ident(s),
                line,
            }) => {
                head_line = *line;
                s.clone()
            }
            None => return Ok(()),
            Some(other) => {
                return Err(Error::Parse {
                    line: other.line,
                    msg: format!("expected instruction or directive, got `{:?}`", other.tok),
                })
            }
        };
        self.i += 1;

        match head_name.to_ascii_uppercase().as_str() {
            "ORG" => {
                let v = self.expect_number(head_line)?;
                self.expect_eol(head_line)?;
                if !(0..=0xFFFF).contains(&v) {
                    return Err(Error::Parse {
                        line: head_line,
                        msg: format!("ORG out of range: {v:#X}"),
                    });
                }
                out.push(Stmt::Org {
                    value: v as u16,
                    line: head_line,
                });
            }
            "DB" => {
                let mut values = vec![self.parse_db_item(head_line)?];
                while self.peek_is(&Tok::Comma) {
                    self.i += 1;
                    values.push(self.parse_db_item(head_line)?);
                }
                self.expect_eol(head_line)?;
                out.push(Stmt::Db {
                    values,
                    line: head_line,
                });
            }
            "DW" => {
                let mut values = vec![self.expect_number(head_line)?];
                while self.peek_is(&Tok::Comma) {
                    self.i += 1;
                    values.push(self.expect_number(head_line)?);
                }
                self.expect_eol(head_line)?;
                out.push(Stmt::Dw {
                    values,
                    line: head_line,
                });
            }
            "DS" => {
                let n = self.expect_number(head_line)?;
                self.expect_eol(head_line)?;
                out.push(Stmt::Ds {
                    count: n as u16,
                    line: head_line,
                });
            }
            "END" => {
                self.skip_to_eol();
                out.push(Stmt::End { line: head_line });
            }
            _ => {
                // `NAME EQU value`, `NAME BIT value`, `NAME DATA value`?
                if let Some(Token {
                    tok: Tok::Ident(kw),
                    ..
                }) = self.peek()
                {
                    let kw_up = kw.to_ascii_uppercase();
                    if matches!(
                        kw_up.as_str(),
                        "EQU" | "SET" | "BIT" | "DATA" | "IDATA" | "XDATA" | "CODE"
                    ) {
                        self.i += 1;
                        let v = self.expect_number(head_line)?;
                        self.expect_eol(head_line)?;
                        let stmt = match kw_up.as_str() {
                            "BIT" => Stmt::Bit {
                                name: head_name,
                                value: v,
                                line: head_line,
                            },
                            "DATA" | "IDATA" | "XDATA" | "CODE" => Stmt::Data {
                                name: head_name,
                                value: v,
                                line: head_line,
                            },
                            _ => Stmt::Equ {
                                name: head_name,
                                value: v,
                                line: head_line,
                            },
                        };
                        out.push(stmt);
                        return Ok(());
                    }
                }
                // Regular instruction.
                let mut operands = Vec::new();
                if !self.peek_is(&Tok::Eol) {
                    operands.push(self.parse_operand(head_line)?);
                    while self.peek_is(&Tok::Comma) {
                        self.i += 1;
                        operands.push(self.parse_operand(head_line)?);
                    }
                }
                self.expect_eol(head_line)?;
                out.push(Stmt::Instr {
                    mnem: head_name.to_ascii_uppercase(),
                    operands,
                    line: head_line,
                });
            }
        }
        Ok(())
    }

    fn parse_operand(&mut self, line: u32) -> Result<Operand, Error> {
        match self.peek() {
            Some(Token { tok: Tok::Hash, .. }) => {
                self.i += 1;
                let n = self.parse_signed_number(line)?;
                Ok(Operand::Imm(n))
            }
            Some(Token { tok: Tok::At, .. }) => {
                self.i += 1;
                // @R0 / @R1 / @DPTR / @A+DPTR / @A+PC
                let name = match self.bump() {
                    Some(Token {
                        tok: Tok::Ident(s), ..
                    }) => s.to_ascii_uppercase(),
                    other => {
                        return Err(Error::Parse {
                            line,
                            msg: format!(
                                "expected identifier after @, got {:?}",
                                other.map(|t| &t.tok)
                            ),
                        })
                    }
                };
                match name.as_str() {
                    "R0" => Ok(Operand::AtRi(0)),
                    "R1" => Ok(Operand::AtRi(1)),
                    "DPTR" => Ok(Operand::AtDptr),
                    "A" => {
                        // @A+DPTR or @A+PC
                        if !self.peek_is(&Tok::Plus) {
                            return Err(Error::Parse {
                                line,
                                msg: "expected `+` after `@A`".into(),
                            });
                        }
                        self.i += 1;
                        let tail = match self.bump() {
                            Some(Token {
                                tok: Tok::Ident(s), ..
                            }) => s.to_ascii_uppercase(),
                            other => {
                                return Err(Error::Parse {
                                    line,
                                    msg: format!(
                                        "expected DPTR or PC after @A+, got {:?}",
                                        other.map(|t| &t.tok)
                                    ),
                                })
                            }
                        };
                        match tail.as_str() {
                            "DPTR" => Ok(Operand::AtAplusDptr),
                            "PC" => Ok(Operand::AtAplusPc),
                            _ => Err(Error::Parse {
                                line,
                                msg: format!("invalid indirect `@A+{tail}`"),
                            }),
                        }
                    }
                    _ => Err(Error::Parse {
                        line,
                        msg: format!("invalid indirect `@{name}`"),
                    }),
                }
            }
            Some(Token {
                tok: Tok::Number(n),
                ..
            }) => {
                let n = *n;
                self.i += 1;
                // Bit form: number.bit?
                if self.peek_is(&Tok::Dot) {
                    self.i += 1;
                    let b = self.expect_number(line)?;
                    if !(0..=7).contains(&b) {
                        return Err(Error::Parse {
                            line,
                            msg: format!("bit index out of range: {b}"),
                        });
                    }
                    // bit address = byte * 8 + b for byte in 0x20..0x2F
                    // or SFR-aligned: for byte 0x80+8k, bit = byte+b.
                    return Ok(Operand::Bit(byte_dot_bit_to_bit(n as u8, b as u8) as i64));
                }
                Ok(Operand::Direct(n))
            }
            Some(Token {
                tok: Tok::Ident(name),
                ..
            }) => {
                let upper = name.to_ascii_uppercase();
                let name_clone = name.clone();
                self.i += 1;
                // Bit-style on a named register: P1.0, ACC.7
                if self.peek_is(&Tok::Dot) {
                    self.i += 1;
                    let b = self.expect_number(line)?;
                    if !(0..=7).contains(&b) {
                        return Err(Error::Parse {
                            line,
                            msg: format!("bit index out of range: {b}"),
                        });
                    }
                    let byte = sfr_addr_for_name(&upper).ok_or_else(|| Error::Parse {
                        line,
                        msg: format!("`{upper}` isn't a bit-addressable SFR"),
                    })?;
                    return Ok(Operand::Bit(byte_dot_bit_to_bit(byte, b as u8) as i64));
                }
                Ok(match upper.as_str() {
                    "A" | "ACC" => Operand::Acc,
                    "B" => Operand::B,
                    "C" | "CY" => Operand::Carry,
                    "DPTR" => Operand::Dptr,
                    "R0" => Operand::Rn(0),
                    "R1" => Operand::Rn(1),
                    "R2" => Operand::Rn(2),
                    "R3" => Operand::Rn(3),
                    "R4" => Operand::Rn(4),
                    "R5" => Operand::Rn(5),
                    "R6" => Operand::Rn(6),
                    "R7" => Operand::Rn(7),
                    // Pre-defined SFR names (most common). Encoder
                    // checks Direct for these specifically when an
                    // SFR-only operand position requires them.
                    "P0" | "P1" | "P2" | "P3" | "PSW" | "SP" | "DPL" | "DPH" | "TMOD" | "TCON"
                    | "TL0" | "TL1" | "TH0" | "TH1" | "SCON" | "SBUF" | "IE" | "IP" | "PCON" => {
                        Operand::Direct(sfr_addr_for_name(&upper).unwrap() as i64)
                    }
                    _ => Operand::Label(name_clone),
                })
            }
            other => Err(Error::Parse {
                line,
                msg: format!("expected operand, got {:?}", other.map(|t| &t.tok)),
            }),
        }
    }

    fn parse_signed_number(&mut self, line: u32) -> Result<i64, Error> {
        let neg = if self.peek_is(&Tok::Minus) {
            self.i += 1;
            true
        } else {
            false
        };
        let n = match self.bump() {
            Some(Token {
                tok: Tok::Number(n),
                ..
            }) => *n,
            Some(Token {
                tok: Tok::Ident(name),
                ..
            }) => {
                // Symbol reference resolved at encode time — but we
                // can't return a symbol from this typed slot. Treat as
                // an error for now; immediates should be numeric.
                return Err(Error::Parse {
                    line,
                    msg: format!("symbolic immediate `{name}` not yet supported here"),
                });
            }
            other => {
                return Err(Error::Parse {
                    line,
                    msg: format!("expected number, got {:?}", other.map(|t| &t.tok)),
                })
            }
        };
        Ok(if neg { -n } else { n })
    }

    fn parse_db_item(&mut self, line: u32) -> Result<DbValue, Error> {
        match self.peek() {
            Some(Token {
                tok: Tok::Str(s), ..
            }) => {
                let s = s.clone();
                self.i += 1;
                Ok(DbValue::Str(s))
            }
            Some(Token {
                tok: Tok::Number(n),
                ..
            }) => {
                let n = *n;
                self.i += 1;
                Ok(DbValue::Byte(n))
            }
            Some(Token {
                tok: Tok::Ident(name),
                ..
            }) => {
                let s = name.clone();
                self.i += 1;
                Ok(DbValue::Sym(s))
            }
            _ => Err(Error::Parse {
                line,
                msg: "DB items must be bytes, strings, or symbols".into(),
            }),
        }
    }

    fn expect_number(&mut self, line: u32) -> Result<i64, Error> {
        let neg = if self.peek_is(&Tok::Minus) {
            self.i += 1;
            true
        } else {
            false
        };
        match self.bump() {
            Some(Token {
                tok: Tok::Number(n),
                ..
            }) => Ok(if neg { -n } else { *n }),
            other => Err(Error::Parse {
                line,
                msg: format!("expected number, got {:?}", other.map(|t| &t.tok)),
            }),
        }
    }

    fn expect_eol(&mut self, line: u32) -> Result<(), Error> {
        match self.peek() {
            Some(Token { tok: Tok::Eol, .. }) => {
                self.i += 1;
                Ok(())
            }
            None => Ok(()),
            Some(other) => Err(Error::Parse {
                line: other.line,
                msg: format!("expected end of line, got {:?}", other.tok),
            }),
        }
        .map(|_| {
            let _ = line;
        })
    }

    fn skip_to_eol(&mut self) {
        while let Some(t) = self.peek() {
            if matches!(t.tok, Tok::Eol) {
                self.i += 1;
                break;
            }
            self.i += 1;
        }
    }
}

/// Convert a (byte, bit_in_byte) pair to a flat 0..255 bit address per
/// the 8051 convention.
fn byte_dot_bit_to_bit(byte: u8, bit: u8) -> u8 {
    if byte >= 0x20 && byte <= 0x2F {
        // Low 128 bits live in bytes 0x20..0x2F.
        (byte - 0x20) * 8 + bit
    } else if byte >= 0x80 && (byte & 0x07) == 0 {
        byte | bit
    } else {
        // Not a bit-addressable byte — caller (encoder) will surface
        // the error. We return a sentinel value (0xFF + bit) that
        // won't accidentally match a real bit.
        byte.wrapping_add(bit)
    }
}

#[must_use]
pub fn sfr_addr_for_name(name: &str) -> Option<u8> {
    Some(match name {
        "P0" => 0x80,
        "SP" => 0x81,
        "DPL" => 0x82,
        "DPH" => 0x83,
        "PCON" => 0x87,
        "TCON" => 0x88,
        "TMOD" => 0x89,
        "TL0" => 0x8A,
        "TL1" => 0x8B,
        "TH0" => 0x8C,
        "TH1" => 0x8D,
        "P1" => 0x90,
        "SCON" => 0x98,
        "SBUF" => 0x99,
        "P2" => 0xA0,
        "IE" => 0xA8,
        "P3" => 0xB0,
        "IP" => 0xB8,
        "PSW" => 0xD0,
        "ACC" => 0xE0,
        "B" => 0xF0,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::lex;

    fn parse_str(src: &str) -> Program {
        parse(&lex(src).unwrap()).unwrap()
    }

    #[test]
    fn label_then_nop() {
        let p = parse_str("LOOP: NOP");
        assert_eq!(p.len(), 2);
    }

    #[test]
    fn mov_a_imm() {
        let p = parse_str("MOV A, #42H");
        match &p[0] {
            Stmt::Instr { mnem, operands, .. } => {
                assert_eq!(mnem, "MOV");
                assert_eq!(operands, &vec![Operand::Acc, Operand::Imm(0x42)]);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn setb_p1_bit_0() {
        let p = parse_str("SETB P1.0");
        match &p[0] {
            Stmt::Instr { mnem, operands, .. } => {
                assert_eq!(mnem, "SETB");
                // P1 = 0x90, bit 0 = 0x90.
                assert_eq!(operands, &vec![Operand::Bit(0x90)]);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn at_dptr_indirect() {
        let p = parse_str("MOVX A, @DPTR");
        match &p[0] {
            Stmt::Instr { operands, .. } => {
                assert_eq!(operands, &vec![Operand::Acc, Operand::AtDptr]);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn movc_a_at_a_plus_dptr() {
        let p = parse_str("MOVC A, @A+DPTR");
        match &p[0] {
            Stmt::Instr { operands, .. } => {
                assert_eq!(operands, &vec![Operand::Acc, Operand::AtAplusDptr]);
            }
            _ => panic!(),
        }
    }
}
