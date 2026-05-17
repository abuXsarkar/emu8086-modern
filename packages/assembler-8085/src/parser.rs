//! Token stream → AST.
//!
//! The grammar is one statement per line:
//!
//!   stmt   := label? (directive | instruction)? EOL
//!   label  := IDENT ':'
//!   directive := ORG num | EQU IDENT,num | DB <values> | DW <values>
//!              | DS num | END
//!   instruction := MNEMONIC operands?
//!   operands := operand (',' operand)*
//!   operand := reg | regpair | 'M' | 'PSW' | num | IDENT
//!
//! We don't enforce mnemonic-correctness here — the encoder is the
//! single source of truth for what operand shapes each mnemonic
//! accepts. The parser just shovels tokens into AST nodes.

use crate::lexer::{Tok, Token};
use crate::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operand {
    /// A 1-byte register `A`/`B`/`C`/`D`/`E`/`H`/`L`. Stored as the
    /// canonical uppercase letter for the encoder to pattern-match.
    Reg(char),
    /// A 16-bit register pair: `BC` / `DE` / `HL` / `SP`.
    Pair(&'static str),
    /// `M` — the `[HL]` pseudo-register.
    M,
    /// `PSW` — only valid for `PUSH` / `POP`.
    Psw,
    /// A literal number (could be 8- or 16-bit; encoder validates).
    Imm(i64),
    /// A reference to a yet-unresolved label. Pass 1 sees the name,
    /// pass 2 resolves to an address.
    Label(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Stmt {
    /// `LABEL:` on its own line, or preceding an instruction.
    Label { name: String, line: u32 },
    Org { value: u16, line: u32 },
    Equ { name: String, value: i64, line: u32 },
    Db { values: Vec<DbValue>, line: u32 },
    Dw { values: Vec<i64>, line: u32 },
    Ds { count: u16, line: u32 },
    End { line: u32 },
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
}

pub type Program = Vec<Stmt>;

pub fn parse(tokens: &[Token]) -> Result<Program, Error> {
    let mut p = Parser { toks: tokens, i: 0 };
    let mut out = Vec::new();
    while !p.eof() {
        // Skip blank lines.
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

impl<'a> Parser<'a> {
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

    fn current_line(&self) -> u32 {
        self.peek().map_or(0, |t| t.line)
    }

    fn parse_line(&mut self, out: &mut Program) -> Result<(), Error> {
        let line = self.current_line();

        // A line may begin with `LABEL:` — peek 2 ahead.
        if let (Some(t1), Some(t2)) = (self.toks.get(self.i), self.toks.get(self.i + 1)) {
            if matches!(&t1.tok, Tok::Ident(_)) && matches!(&t2.tok, Tok::Colon) {
                if let Tok::Ident(name) = &t1.tok {
                    out.push(Stmt::Label { name: name.clone(), line: t1.line });
                }
                self.i += 2;
            }
        }

        // Possibly nothing else on the line.
        if self.peek_is(&Tok::Eol) {
            self.i += 1;
            return Ok(());
        }

        // First token of the body must be an Ident.
        let head_line;
        let head_name = match self.peek() {
            Some(Token { tok: Tok::Ident(s), line }) => {
                head_line = *line;
                s.clone()
            }
            Some(other) => {
                return Err(Error::Parse {
                    line: other.line,
                    msg: format!("expected instruction or directive, got `{:?}`", other.tok),
                });
            }
            None => return Ok(()),
        };
        self.i += 1;

        match head_name.to_ascii_uppercase().as_str() {
            "ORG" => {
                let value = self.expect_number(head_line)?;
                if !(0..=0xFFFF).contains(&value) {
                    return Err(Error::Parse {
                        line: head_line,
                        msg: format!("ORG address out of range: {value:#X}"),
                    });
                }
                self.expect_eol_or_end(head_line)?;
                out.push(Stmt::Org { value: value as u16, line: head_line });
            }
            "EQU" => {
                return Err(Error::Parse {
                    line: head_line,
                    msg: "EQU directive should be: `NAME EQU value`, not `EQU NAME, value`".into(),
                });
            }
            "DB" => {
                let values = self.parse_db_list(head_line)?;
                out.push(Stmt::Db { values, line: head_line });
            }
            "DW" => {
                let mut values = Vec::new();
                values.push(self.expect_number(head_line)?);
                while self.peek_is(&Tok::Comma) {
                    self.i += 1;
                    values.push(self.expect_number(head_line)?);
                }
                self.expect_eol_or_end(head_line)?;
                out.push(Stmt::Dw { values, line: head_line });
            }
            "DS" => {
                let count = self.expect_number(head_line)?;
                if !(0..=0xFFFF).contains(&count) {
                    return Err(Error::Parse {
                        line: head_line,
                        msg: format!("DS count out of range: {count}"),
                    });
                }
                self.expect_eol_or_end(head_line)?;
                out.push(Stmt::Ds { count: count as u16, line: head_line });
            }
            "END" => {
                self.skip_to_eol_or_end();
                out.push(Stmt::End { line: head_line });
            }
            _ => {
                // Detect the `NAME EQU value` form: head_name was the
                // label, next token is `EQU`.
                if let Some(Token { tok: Tok::Ident(maybe_equ), .. }) = self.peek() {
                    if maybe_equ.eq_ignore_ascii_case("EQU") {
                        self.i += 1;
                        let value = self.expect_number(head_line)?;
                        self.expect_eol_or_end(head_line)?;
                        out.push(Stmt::Equ { name: head_name, value, line: head_line });
                        return Ok(());
                    }
                }

                let mut operands = Vec::new();
                if !self.peek_is(&Tok::Eol) {
                    operands.push(self.parse_operand(head_line)?);
                    while self.peek_is(&Tok::Comma) {
                        self.i += 1;
                        operands.push(self.parse_operand(head_line)?);
                    }
                }
                self.expect_eol_or_end(head_line)?;
                out.push(Stmt::Instr {
                    mnem: head_name.to_ascii_uppercase(),
                    operands,
                    line: head_line,
                });
            }
        }

        let _ = line;
        Ok(())
    }

    fn parse_operand(&mut self, line: u32) -> Result<Operand, Error> {
        match self.peek() {
            Some(Token { tok: Tok::Number(n), .. }) => {
                let n = *n;
                self.i += 1;
                Ok(Operand::Imm(n))
            }
            Some(Token { tok: Tok::Minus, .. }) => {
                // `-NUMBER` allowed for DB / immediate values.
                self.i += 1;
                let n = self.expect_number(line)?;
                Ok(Operand::Imm(-n))
            }
            Some(Token { tok: Tok::Ident(name), .. }) => {
                let upper = name.to_ascii_uppercase();
                let name_clone = name.clone();
                self.i += 1;
                Ok(match upper.as_str() {
                    "A" => Operand::Reg('A'),
                    "B" => Operand::Reg('B'),
                    "C" => Operand::Reg('C'),
                    "D" => Operand::Reg('D'),
                    "E" => Operand::Reg('E'),
                    "H" => Operand::Reg('H'),
                    "L" => Operand::Reg('L'),
                    "M" => Operand::M,
                    "BC" => Operand::Pair("BC"),
                    "DE" => Operand::Pair("DE"),
                    "HL" => Operand::Pair("HL"),
                    "SP" => Operand::Pair("SP"),
                    "PSW" => Operand::Psw,
                    _ => Operand::Label(name_clone),
                })
            }
            Some(other) => Err(Error::Parse {
                line: other.line,
                msg: format!("expected operand, got `{:?}`", other.tok),
            }),
            None => Err(Error::Parse { line, msg: "unexpected end of input".into() }),
        }
    }

    fn parse_db_list(&mut self, line: u32) -> Result<Vec<DbValue>, Error> {
        let mut out = Vec::new();
        out.push(self.parse_db_item(line)?);
        while self.peek_is(&Tok::Comma) {
            self.i += 1;
            out.push(self.parse_db_item(line)?);
        }
        self.expect_eol_or_end(line)?;
        Ok(out)
    }

    fn parse_db_item(&mut self, line: u32) -> Result<DbValue, Error> {
        match self.peek() {
            Some(Token { tok: Tok::Str(s), .. }) => {
                let s = s.clone();
                self.i += 1;
                Ok(DbValue::Str(s))
            }
            Some(Token { tok: Tok::Number(n), .. }) => {
                let n = *n;
                self.i += 1;
                Ok(DbValue::Byte(n))
            }
            _ => Err(Error::Parse {
                line,
                msg: "DB items must be byte literals or strings".into(),
            }),
        }
    }

    fn expect_number(&mut self, line: u32) -> Result<i64, Error> {
        match self.bump() {
            Some(Token { tok: Tok::Number(n), .. }) => Ok(*n),
            Some(other) => Err(Error::Parse {
                line: other.line,
                msg: format!("expected number, got `{:?}`", other.tok),
            }),
            None => Err(Error::Parse { line, msg: "expected number, got EOF".into() }),
        }
    }

    fn expect_eol_or_end(&mut self, line: u32) -> Result<(), Error> {
        match self.peek() {
            Some(Token { tok: Tok::Eol, .. }) => {
                self.i += 1;
                Ok(())
            }
            None => Ok(()),
            Some(other) => Err(Error::Parse {
                line: other.line,
                msg: format!("expected end of line, got `{:?}`", other.tok),
            }),
        }
        .map(|_| {
            let _ = line;
        })
    }

    fn skip_to_eol_or_end(&mut self) {
        while let Some(t) = self.peek() {
            if matches!(t.tok, Tok::Eol) {
                self.i += 1;
                break;
            }
            self.i += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::lex;

    fn parse_str(src: &str) -> Program {
        parse(&lex(src).unwrap()).unwrap()
    }

    #[test]
    fn empty_yields_empty() {
        assert!(parse_str("").is_empty());
    }

    #[test]
    fn label_then_hlt() {
        let p = parse_str("LOOP: HLT");
        assert_eq!(p.len(), 2);
        assert!(matches!(p[0], Stmt::Label { ref name, .. } if name == "LOOP"));
        assert!(matches!(&p[1], Stmt::Instr { mnem, .. } if mnem == "HLT"));
    }

    #[test]
    fn org_directive() {
        let p = parse_str("ORG 4200H");
        assert!(matches!(p[0], Stmt::Org { value: 0x4200, .. }));
    }

    #[test]
    fn mvi_a_42h() {
        let p = parse_str("MVI A, 42H");
        match &p[0] {
            Stmt::Instr { mnem, operands, .. } => {
                assert_eq!(mnem, "MVI");
                assert_eq!(operands.len(), 2);
                assert_eq!(operands[0], Operand::Reg('A'));
                assert_eq!(operands[1], Operand::Imm(0x42));
            }
            other => panic!("expected Instr, got {other:?}"),
        }
    }

    #[test]
    fn mov_a_b() {
        let p = parse_str("MOV A, B");
        match &p[0] {
            Stmt::Instr { mnem, operands, .. } => {
                assert_eq!(mnem, "MOV");
                assert_eq!(operands, &vec![Operand::Reg('A'), Operand::Reg('B')]);
            }
            other => panic!("expected Instr, got {other:?}"),
        }
    }

    #[test]
    fn jmp_label() {
        let p = parse_str("JMP LOOP");
        match &p[0] {
            Stmt::Instr { mnem, operands, .. } => {
                assert_eq!(mnem, "JMP");
                assert!(matches!(&operands[0], Operand::Label(s) if s == "LOOP"));
            }
            _ => panic!(),
        }
    }

    #[test]
    fn equ_form() {
        let p = parse_str("BUF EQU 2050H");
        assert!(matches!(&p[0], Stmt::Equ { name, value: 0x2050, .. } if name == "BUF"));
    }

    #[test]
    fn db_mixed() {
        let p = parse_str("DB 1, 2, 'Hi'");
        match &p[0] {
            Stmt::Db { values, .. } => {
                assert_eq!(values.len(), 3);
            }
            _ => panic!(),
        }
    }
}
