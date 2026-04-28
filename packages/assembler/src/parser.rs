//! Parser for the M2.1 assembler subset.
//!
//! Accepts the syntax needed for emu8086 hello-world and growing from there.

use std::fmt;

use crate::lexer::{Span, Spanned, Token};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Program {
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Item {
    Label { name: String, span: Span },
    Instr(Instr),
    Directive(Directive),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instr {
    pub mnemonic: String,
    pub mnemonic_span: Span,
    pub operands: Vec<Operand>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Directive {
    Org { value: u32, span: Span },
    Db { items: Vec<DataItem>, span: Span },
    Dw { items: Vec<DataItem>, span: Span },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataItem {
    Number(u32, Span),
    String(Vec<u8>, Span),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operand {
    /// A bare identifier — could be a register name (resolved by the encoder)
    /// or a label reference.
    Ident {
        name: String,
        span: Span,
    },
    Number {
        value: u32,
        span: Span,
    },
    /// `[expr]` — memory operand. For M2.1 we accept only a bare immediate
    /// (i.e. `[0x100]`) or a single register/identifier inside the brackets;
    /// full mod-r/m parsing arrives in M2.3.
    Mem {
        inner: Box<Operand>,
        span: Span,
    },
}

impl Operand {
    #[must_use]
    pub fn span(&self) -> Span {
        match self {
            Self::Ident { span, .. } | Self::Number { span, .. } | Self::Mem { span, .. } => *span,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub struct ParseError {
    pub span: Span,
    pub message: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "parse error at byte {}-{}: {}",
            self.span.start, self.span.end, self.message
        )
    }
}

struct Parser<'a> {
    toks: &'a [Spanned],
    pos: usize,
}

impl Parser<'_> {
    fn peek(&self) -> &Spanned {
        &self.toks[self.pos]
    }

    fn bump(&mut self) -> Spanned {
        let t = self.toks[self.pos].clone();
        if !matches!(t.tok, Token::Eof) {
            self.pos += 1;
        }
        t
    }

    fn expect(&mut self, tok: &Token) -> Result<Spanned, ParseError> {
        let cur = self.peek().clone();
        if std::mem::discriminant(&cur.tok) == std::mem::discriminant(tok) {
            self.bump();
            Ok(cur)
        } else {
            Err(ParseError {
                span: cur.span,
                message: format!("expected {tok}, found {}", cur.tok),
            })
        }
    }

    /// Skip blank lines / leading newlines.
    fn skip_blanklines(&mut self) {
        while matches!(self.peek().tok, Token::Newline) {
            self.bump();
        }
    }

    fn parse_program(&mut self) -> Result<Program, ParseError> {
        let mut items = Vec::new();
        loop {
            self.skip_blanklines();
            if matches!(self.peek().tok, Token::Eof) {
                break;
            }
            self.parse_line_into(&mut items)?;
        }
        Ok(Program { items })
    }

    fn parse_line_into(&mut self, items: &mut Vec<Item>) -> Result<(), ParseError> {
        // A line is: [label `:`]? [instr-or-directive]? newline.
        // Multiple labels can stack ("foo: bar: nop") in real assemblers,
        // but we keep it to one for now.
        if let Token::Ident(name) = &self.peek().tok.clone() {
            // Look ahead two tokens for `:`.
            let saved = self.pos;
            let lab = self.bump();
            if matches!(self.peek().tok, Token::Colon) {
                let _colon = self.bump();
                items.push(Item::Label {
                    name: name.clone(),
                    span: lab.span,
                });
                // Fall through to parse the rest of the line below.
                self.skip_blanklines_no_advance();
            } else {
                self.pos = saved;
            }
        }

        if matches!(self.peek().tok, Token::Eof | Token::Newline) {
            // Bare label line; nothing else to do.
            if matches!(self.peek().tok, Token::Newline) {
                self.bump();
            }
            return Ok(());
        }

        // Directive or instruction begins with an identifier.
        let head = match self.peek().tok.clone() {
            Token::Ident(s) => s,
            _ => {
                let s = self.peek().clone();
                return Err(ParseError {
                    span: s.span,
                    message: format!("expected mnemonic or directive, found {}", s.tok),
                });
            }
        };
        let head_lower = head.to_ascii_lowercase();

        match head_lower.as_str() {
            "org" => {
                let kw = self.bump();
                let n = self.parse_number()?;
                let end = self.maybe_eat_newline();
                items.push(Item::Directive(Directive::Org {
                    value: n.0,
                    span: Span::new(kw.span.start, end),
                }));
            }
            "db" => {
                let kw = self.bump();
                let data = self.parse_data_items()?;
                let end = self.maybe_eat_newline();
                items.push(Item::Directive(Directive::Db {
                    items: data,
                    span: Span::new(kw.span.start, end),
                }));
            }
            "dw" => {
                let kw = self.bump();
                let data = self.parse_data_items()?;
                let end = self.maybe_eat_newline();
                items.push(Item::Directive(Directive::Dw {
                    items: data,
                    span: Span::new(kw.span.start, end),
                }));
            }
            _ => {
                let mnem = self.bump();
                let mut operands = Vec::new();
                if !matches!(self.peek().tok, Token::Newline | Token::Eof) {
                    operands.push(self.parse_operand()?);
                    while matches!(self.peek().tok, Token::Comma) {
                        self.bump();
                        operands.push(self.parse_operand()?);
                    }
                }
                let end = self.maybe_eat_newline();
                items.push(Item::Instr(Instr {
                    mnemonic: head,
                    mnemonic_span: mnem.span,
                    operands,
                    span: Span::new(mnem.span.start, end),
                }));
            }
        }
        Ok(())
    }

    fn skip_blanklines_no_advance(&mut self) {
        // Used after a label: keep consuming blank lines so the rest of
        // the program doesn't start with `Newline`.
        // (No-op for now since labels don't span newlines.)
    }

    fn maybe_eat_newline(&mut self) -> usize {
        let end = self.peek().span.start;
        if matches!(self.peek().tok, Token::Newline) {
            self.bump();
        }
        end
    }

    fn parse_number(&mut self) -> Result<(u32, Span), ParseError> {
        let cur = self.peek().clone();
        if let Token::Number(n) = cur.tok {
            self.bump();
            Ok((n, cur.span))
        } else {
            Err(ParseError {
                span: cur.span,
                message: format!("expected a number, found {}", cur.tok),
            })
        }
    }

    fn parse_data_items(&mut self) -> Result<Vec<DataItem>, ParseError> {
        let mut out = Vec::new();
        loop {
            let cur = self.peek().clone();
            match cur.tok {
                Token::Number(n) => {
                    self.bump();
                    out.push(DataItem::Number(n, cur.span));
                }
                Token::String(bytes) => {
                    self.bump();
                    out.push(DataItem::String(bytes, cur.span));
                }
                _ => {
                    return Err(ParseError {
                        span: cur.span,
                        message: format!("expected number or string, found {}", cur.tok),
                    });
                }
            }
            if matches!(self.peek().tok, Token::Comma) {
                self.bump();
            } else {
                break;
            }
        }
        Ok(out)
    }

    fn parse_operand(&mut self) -> Result<Operand, ParseError> {
        let cur = self.peek().clone();
        match cur.tok {
            Token::Ident(name) => {
                self.bump();
                Ok(Operand::Ident {
                    name,
                    span: cur.span,
                })
            }
            Token::Number(n) => {
                self.bump();
                Ok(Operand::Number {
                    value: n,
                    span: cur.span,
                })
            }
            Token::Minus => {
                // Allow `-N` for signed immediates.
                self.bump();
                let inner = self.parse_number()?;
                let signed = (inner.0 as i64).wrapping_neg();
                Ok(Operand::Number {
                    value: signed as u32,
                    span: Span::new(cur.span.start, inner.1.end),
                })
            }
            Token::LBracket => {
                let l = self.bump();
                let inner = self.parse_operand()?;
                let r = self.expect(&Token::RBracket)?;
                Ok(Operand::Mem {
                    inner: Box::new(inner),
                    span: Span::new(l.span.start, r.span.end),
                })
            }
            other => Err(ParseError {
                span: cur.span,
                message: format!("expected operand, found {other}"),
            }),
        }
    }
}

pub fn parse(toks: &[Spanned]) -> Result<Program, ParseError> {
    let mut p = Parser { toks, pos: 0 };
    p.parse_program()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::tokenize;

    fn p(src: &str) -> Program {
        let t = tokenize(src).unwrap();
        parse(&t).unwrap()
    }

    #[test]
    fn parse_org_db() {
        let prog = p("org 0x100\ndb 1, 2, 3\n");
        assert_eq!(prog.items.len(), 2);
        match &prog.items[0] {
            Item::Directive(Directive::Org { value, .. }) => assert_eq!(*value, 0x100),
            _ => panic!("not org"),
        }
        match &prog.items[1] {
            Item::Directive(Directive::Db { items, .. }) => {
                assert_eq!(items.len(), 3);
            }
            _ => panic!("not db"),
        }
    }

    #[test]
    fn parse_label_and_instruction_on_same_line() {
        let prog = p("start: mov ax, 0x1234\n");
        assert!(matches!(prog.items[0], Item::Label { .. }));
        assert!(matches!(prog.items[1], Item::Instr(_)));
    }

    #[test]
    fn parse_two_operand_instruction() {
        let prog = p("mov ax, bx\n");
        if let Item::Instr(i) = &prog.items[0] {
            assert_eq!(i.mnemonic, "mov");
            assert_eq!(i.operands.len(), 2);
        } else {
            panic!();
        }
    }

    #[test]
    fn parse_negative_immediate() {
        let prog = p("mov ax, -1\n");
        if let Item::Instr(i) = &prog.items[0] {
            if let Operand::Number { value, .. } = &i.operands[1] {
                assert_eq!(*value & 0xFFFF, 0xFFFF);
            } else {
                panic!()
            }
        } else {
            panic!()
        }
    }

    #[test]
    fn parse_db_with_label_colon() {
        let prog = p("msg: db \"Hello!\"\n");
        assert!(matches!(prog.items[0], Item::Label { .. }));
        assert!(matches!(
            prog.items[1],
            Item::Directive(Directive::Db { .. })
        ));
    }
}
