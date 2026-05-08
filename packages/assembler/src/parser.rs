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
    Org {
        value: u32,
        span: Span,
    },
    Db {
        items: Vec<DataItem>,
        span: Span,
    },
    Dw {
        items: Vec<DataItem>,
        span: Span,
    },
    /// `name EQU expr` — defines a named constant. The `expr` is held as
    /// a small AST so the encoder can resolve `$` (current location) and
    /// forward-referenced labels at a later pass. The canonical lab
    /// idiom `LEN EQU $-MSG` (length-of-data) needs both.
    Equ {
        name: String,
        expr: ConstExpr,
        span: Span,
    },
}

/// A constant-expression AST. Used in `EQU` definitions and anywhere
/// else the assembler accepts a compile-time integer (currently only
/// EQU; immediate operands stay on the simpler `Operand::Number` path
/// for now). Ops match MASM precedence: unary first, then `* / %`,
/// then `+ -`. `$` resolves to the current location counter inside the
/// segment; `Ident` resolves to a label's offset (which is what
/// `OFFSET label` and a bare-label-in-immediate produce equivalently).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConstExpr {
    Number(u32, Span),
    Ident(String, Span),
    Dollar(Span),
    Neg(Box<ConstExpr>, Span),
    Add(Box<ConstExpr>, Box<ConstExpr>, Span),
    Sub(Box<ConstExpr>, Box<ConstExpr>, Span),
    Mul(Box<ConstExpr>, Box<ConstExpr>, Span),
    Div(Box<ConstExpr>, Box<ConstExpr>, Span),
    Mod(Box<ConstExpr>, Box<ConstExpr>, Span),
}

impl ConstExpr {
    #[must_use]
    pub fn span(&self) -> Span {
        match self {
            Self::Number(_, s)
            | Self::Ident(_, s)
            | Self::Dollar(s)
            | Self::Neg(_, s)
            | Self::Add(_, _, s)
            | Self::Sub(_, _, s)
            | Self::Mul(_, _, s)
            | Self::Div(_, _, s)
            | Self::Mod(_, _, s) => *s,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataItem {
    Number(u32, Span),
    String(Vec<u8>, Span),
    /// `count DUP(items…)` — emits the inner data sequence `count` times.
    Dup {
        count: u32,
        items: Vec<DataItem>,
        span: Span,
    },
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
    /// `[expr]` — memory operand. The encoder classifies the term list
    /// against the 8086 base/index pairs and produces the appropriate
    /// mod-r/m + displacement bytes.
    Mem(MemRef),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemSize {
    Byte,
    Word,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegOverride {
    Cs,
    Ds,
    Es,
    Ss,
}

impl SegOverride {
    /// Map the override to its 8086 prefix byte.
    #[must_use]
    pub fn prefix_byte(self) -> u8 {
        match self {
            Self::Es => 0x26,
            Self::Cs => 0x2E,
            Self::Ss => 0x36,
            Self::Ds => 0x3E,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemRef {
    pub terms: Vec<MemTerm>,
    pub span: Span,
    /// `BYTE PTR` / `WORD PTR` size override. `None` lets the encoder
    /// choose based on the other operand (or default to word).
    pub size_hint: Option<MemSize>,
    /// `CS:` / `DS:` / `ES:` / `SS:` prefix in front of the bracketed
    /// memory operand. `None` means use the default segment for the
    /// chosen base register (DS for [bx]/[si]/[di]/[disp], SS for [bp]).
    pub seg_override: Option<SegOverride>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemTerm {
    /// An identifier inside the brackets — can be a register (BX, SI, …),
    /// or a label whose offset will be added in as displacement.
    Ident { name: String, sign: i8, span: Span },
    /// A literal displacement.
    Number { value: i64, span: Span },
}

impl Operand {
    #[must_use]
    pub fn span(&self) -> Span {
        match self {
            Self::Ident { span, .. } | Self::Number { span, .. } => *span,
            Self::Mem(m) => m.span,
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
        // A line is one of:
        //   [label `:`]? [instr-or-directive]?  newline
        //   name EQU value                       newline
        //
        // We special-case `name EQU value` here because EQU (unlike `:`)
        // sits *between* a name and its value rather than after.
        if let Token::Ident(name) = &self.peek().tok.clone() {
            // Look ahead one token: `:` for label, or another Ident `EQU`
            // for a constant definition.
            let saved = self.pos;
            let lab = self.bump();
            match &self.peek().tok {
                Token::Colon => {
                    self.bump();
                    items.push(Item::Label {
                        name: name.clone(),
                        span: lab.span,
                    });
                    self.skip_blanklines_no_advance();
                }
                Token::Ident(maybe_kw) if maybe_kw.eq_ignore_ascii_case("equ") => {
                    self.bump(); // consume EQU
                    let expr = self.parse_const_expr()?;
                    let end = self.maybe_eat_newline();
                    items.push(Item::Directive(Directive::Equ {
                        name: name.clone(),
                        expr,
                        span: Span::new(lab.span.start, end),
                    }));
                    return Ok(());
                }
                // MASM-style inline data declaration: `NAME DB items…`
                // is sugar for `NAME: db items…`. We emit the label
                // here and let the directive-keyword fallthrough below
                // parse the remainder of the line normally.
                Token::Ident(maybe_kw)
                    if matches!(maybe_kw.to_ascii_lowercase().as_str(), "db" | "dw" | "dd") =>
                {
                    items.push(Item::Label {
                        name: name.clone(),
                        span: lab.span,
                    });
                    // pos is already at the directive keyword; do not
                    // restore. Fall through to head-matching below.
                }
                _ => {
                    self.pos = saved;
                }
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
                let lname = head.to_ascii_lowercase();
                let is_rep_prefix =
                    matches!(lname.as_str(), "rep" | "repe" | "repz" | "repne" | "repnz");
                if is_rep_prefix {
                    // Push the prefix as its own zero-operand Instr; the
                    // encoder emits a single F3 / F2 byte for it. Then
                    // recurse on the remainder of the line so `rep movsb`
                    // produces two items on one line.
                    items.push(Item::Instr(Instr {
                        mnemonic: head,
                        mnemonic_span: mnem.span,
                        operands: Vec::new(),
                        span: mnem.span,
                    }));
                    if !matches!(self.peek().tok, Token::Newline | Token::Eof) {
                        return self.parse_line_into(items);
                    }
                    self.maybe_eat_newline();
                    return Ok(());
                }
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

    /// Parse a constant expression. Recursive descent over MASM
    /// precedence: addition/subtraction binds loosest, then
    /// multiplication/division/modulo, then unary `-` (and `+`), then
    /// primary atoms (numbers, idents, `$`, parenthesised subexprs,
    /// `OFFSET ident`). The `OFFSET` keyword is accepted as a no-op
    /// prefix because a bare label identifier already resolves to its
    /// offset in our model — we recognise it to keep MASM-style
    /// sources unmodified.
    fn parse_const_expr(&mut self) -> Result<ConstExpr, ParseError> {
        self.parse_const_addsub()
    }

    fn parse_const_addsub(&mut self) -> Result<ConstExpr, ParseError> {
        let mut lhs = self.parse_const_muldiv()?;
        loop {
            match self.peek().tok {
                Token::Plus => {
                    self.bump();
                    let rhs = self.parse_const_muldiv()?;
                    let span = Span::new(lhs.span().start, rhs.span().end);
                    lhs = ConstExpr::Add(Box::new(lhs), Box::new(rhs), span);
                }
                Token::Minus => {
                    self.bump();
                    let rhs = self.parse_const_muldiv()?;
                    let span = Span::new(lhs.span().start, rhs.span().end);
                    lhs = ConstExpr::Sub(Box::new(lhs), Box::new(rhs), span);
                }
                _ => return Ok(lhs),
            }
        }
    }

    fn parse_const_muldiv(&mut self) -> Result<ConstExpr, ParseError> {
        let mut lhs = self.parse_const_unary()?;
        loop {
            match self.peek().tok {
                Token::Star => {
                    self.bump();
                    let rhs = self.parse_const_unary()?;
                    let span = Span::new(lhs.span().start, rhs.span().end);
                    lhs = ConstExpr::Mul(Box::new(lhs), Box::new(rhs), span);
                }
                Token::Slash => {
                    self.bump();
                    let rhs = self.parse_const_unary()?;
                    let span = Span::new(lhs.span().start, rhs.span().end);
                    lhs = ConstExpr::Div(Box::new(lhs), Box::new(rhs), span);
                }
                Token::Percent => {
                    self.bump();
                    let rhs = self.parse_const_unary()?;
                    let span = Span::new(lhs.span().start, rhs.span().end);
                    lhs = ConstExpr::Mod(Box::new(lhs), Box::new(rhs), span);
                }
                // MASM also spells modulo as the `MOD` keyword.
                Token::Ident(ref kw) if kw.eq_ignore_ascii_case("mod") => {
                    self.bump();
                    let rhs = self.parse_const_unary()?;
                    let span = Span::new(lhs.span().start, rhs.span().end);
                    lhs = ConstExpr::Mod(Box::new(lhs), Box::new(rhs), span);
                }
                _ => return Ok(lhs),
            }
        }
    }

    fn parse_const_unary(&mut self) -> Result<ConstExpr, ParseError> {
        let cur = self.peek().clone();
        match cur.tok {
            Token::Minus => {
                self.bump();
                let inner = self.parse_const_unary()?;
                let span = Span::new(cur.span.start, inner.span().end);
                Ok(ConstExpr::Neg(Box::new(inner), span))
            }
            // Unary `+` is a syntactic no-op (some sources spell `+1`).
            Token::Plus => {
                self.bump();
                self.parse_const_unary()
            }
            _ => self.parse_const_primary(),
        }
    }

    fn parse_const_primary(&mut self) -> Result<ConstExpr, ParseError> {
        let cur = self.peek().clone();
        match cur.tok {
            Token::Number(n) => {
                self.bump();
                Ok(ConstExpr::Number(n, cur.span))
            }
            Token::Dollar => {
                self.bump();
                Ok(ConstExpr::Dollar(cur.span))
            }
            Token::LParen => {
                self.bump();
                let inner = self.parse_const_expr()?;
                let r = self.expect(&Token::RParen)?;
                Ok(match inner {
                    // Re-attach the outer span so error messages point at
                    // the parenthesised form rather than just the inside.
                    ConstExpr::Number(n, _) => {
                        ConstExpr::Number(n, Span::new(cur.span.start, r.span.end))
                    }
                    other => other,
                })
            }
            Token::Ident(name) => {
                // `OFFSET label` is a transparent prefix in our model:
                // a bare label identifier in a constant context already
                // resolves to its offset (the same u16 the `OFFSET`
                // operator yields in MASM), so we just consume the
                // keyword and re-parse the inner identifier as the atom.
                if name.eq_ignore_ascii_case("offset") {
                    self.bump();
                    let inner = self.peek().clone();
                    if let Token::Ident(label) = inner.tok {
                        self.bump();
                        return Ok(ConstExpr::Ident(
                            label,
                            Span::new(cur.span.start, inner.span.end),
                        ));
                    }
                    return Err(ParseError {
                        span: inner.span,
                        message: format!("expected a label after `OFFSET`, found {}", inner.tok),
                    });
                }
                // `SEG label` — segment of a label. In our flat
                // `.com` model every segment register holds the same
                // base, so the *value* this returns isn't meaningful
                // beyond "any constant that stays consistent across
                // calls". Returning 0 matches what programs that
                // immediately load it into a segment register expect
                // (programs that compare two SEG values for equality
                // also pass — both are 0). Consumes the inner
                // identifier silently so the keyword is purely
                // syntactic.
                if name.eq_ignore_ascii_case("seg") {
                    self.bump();
                    let inner = self.peek().clone();
                    if let Token::Ident(_) = inner.tok {
                        self.bump();
                        return Ok(ConstExpr::Number(
                            0,
                            Span::new(cur.span.start, inner.span.end),
                        ));
                    }
                    return Err(ParseError {
                        span: inner.span,
                        message: format!("expected a label after `SEG`, found {}", inner.tok),
                    });
                }
                // MASM `TYPE` / `LENGTH` / `SIZE` / `LENGTHOF`
                // operators. Real MASM resolves these using the
                // declaration of the named symbol; we don't carry
                // size/length info into the parser yet, so we
                // return the small-but-correct constant for the
                // typical "single-byte declared label" case
                // (TYPE=1, LENGTH=1, SIZE=1*1=1, LENGTHOF=1).
                // Programs that compute array sizes against a
                // multi-element DUP will get the wrong answer here;
                // that's a deliberate trade-off — the source
                // assembles, runtime semantics may differ, the
                // compatibility doc tracks it.
                if matches!(
                    name.to_ascii_lowercase().as_str(),
                    "type" | "length" | "size" | "lengthof" | "sizeof"
                ) {
                    self.bump();
                    let inner = self.peek().clone();
                    if let Token::Ident(_) = inner.tok {
                        self.bump();
                        return Ok(ConstExpr::Number(
                            1,
                            Span::new(cur.span.start, inner.span.end),
                        ));
                    }
                    return Err(ParseError {
                        span: inner.span,
                        message: format!("expected a label after `{name}`, found {}", inner.tok),
                    });
                }
                self.bump();
                Ok(ConstExpr::Ident(name, cur.span))
            }
            _ => Err(ParseError {
                span: cur.span,
                message: format!(
                    "expected a number, identifier, `$`, or `(`, found {}",
                    cur.tok
                ),
            }),
        }
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
                    // Look ahead for `DUP ( ... )` — MASM array shorthand.
                    self.bump();
                    if let Token::Ident(maybe_dup) = &self.peek().tok.clone() {
                        if maybe_dup.eq_ignore_ascii_case("dup") {
                            self.bump(); // consume DUP
                            self.expect(&Token::LParen)?;
                            let inner = self.parse_data_items()?;
                            let r = self.expect(&Token::RParen)?;
                            out.push(DataItem::Dup {
                                count: n,
                                items: inner,
                                span: Span::new(cur.span.start, r.span.end),
                            });
                        } else {
                            out.push(DataItem::Number(n, cur.span));
                        }
                    } else {
                        out.push(DataItem::Number(n, cur.span));
                    }
                }
                Token::String(bytes) => {
                    self.bump();
                    out.push(DataItem::String(bytes, cur.span));
                }
                Token::Ident(name) if name.eq_ignore_ascii_case("?") => {
                    // MASM's `?` is "uninitialized" — we treat it as zero.
                    self.bump();
                    out.push(DataItem::Number(0, cur.span));
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
        // Optional `BYTE PTR` / `WORD PTR` size hint preceding a memory operand.
        if let Token::Ident(name) = &self.peek().tok.clone() {
            let lname = name.to_ascii_lowercase();
            if (lname == "byte" || lname == "word") && self.toks.len() > self.pos + 1 {
                if let Token::Ident(ptr) = &self.toks[self.pos + 1].tok {
                    if ptr.eq_ignore_ascii_case("ptr") {
                        // Looks like a size hint. Consume both keywords and
                        // require a `[` next.
                        self.bump(); // size keyword
                        self.bump(); // PTR
                        if !matches!(self.peek().tok, Token::LBracket | Token::Ident(_)) {
                            let s = self.peek().clone();
                            return Err(ParseError {
                                span: s.span,
                                message: format!(
                                    "expected `[` or segment override after `{lname} ptr`, found {}",
                                    s.tok
                                ),
                            });
                        }
                        let inner = self.parse_operand()?;
                        if let Operand::Mem(mut m) = inner {
                            m.size_hint = Some(if lname == "byte" {
                                MemSize::Byte
                            } else {
                                MemSize::Word
                            });
                            return Ok(Operand::Mem(m));
                        }
                        return Err(ParseError {
                            span: inner.span(),
                            message: format!("expected `[…]` after `{lname} ptr`"),
                        });
                    }
                }
            }
        }

        // Optional `CS:` / `DS:` / `ES:` / `SS:` segment override on a
        // bracketed memory operand.
        if let Token::Ident(name) = &self.peek().tok.clone() {
            let lname = name.to_ascii_lowercase();
            if matches!(lname.as_str(), "cs" | "ds" | "es" | "ss")
                && self.toks.len() > self.pos + 1
                && matches!(self.toks[self.pos + 1].tok, Token::Colon)
            {
                self.bump(); // segreg name
                self.bump(); // ':'
                let inner = self.parse_operand()?;
                if let Operand::Mem(mut m) = inner {
                    m.seg_override = Some(match lname.as_str() {
                        "cs" => SegOverride::Cs,
                        "ds" => SegOverride::Ds,
                        "es" => SegOverride::Es,
                        _ => SegOverride::Ss,
                    });
                    return Ok(Operand::Mem(m));
                }
                return Err(ParseError {
                    span: inner.span(),
                    message: format!("expected `[…]` after `{lname}:`"),
                });
            }
        }

        let cur = self.peek().clone();
        match cur.tok {
            Token::Ident(name) => {
                // `OFFSET label` is a transparent prefix: a bare label
                // identifier in immediate position already resolves to
                // its offset, so OFFSET just consumes the keyword and
                // returns the inner label as the operand. This lets
                // `MOV DX, OFFSET MSG` (the canonical INT 21h fn 09h
                // print idiom) parse without diverging from MASM.
                if name.eq_ignore_ascii_case("offset") {
                    if let Some(next) = self.toks.get(self.pos + 1).cloned() {
                        if let Token::Ident(label) = next.tok {
                            self.bump(); // OFFSET
                            self.bump(); // label
                            return Ok(Operand::Ident {
                                name: label,
                                span: Span::new(cur.span.start, next.span.end),
                            });
                        }
                    }
                }
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
                let mut terms: Vec<MemTerm> = Vec::new();
                let mut sign: i8 = 1;
                loop {
                    let t = self.peek().clone();
                    match t.tok {
                        Token::Ident(name) => {
                            self.bump();
                            terms.push(MemTerm::Ident {
                                name,
                                sign,
                                span: t.span,
                            });
                        }
                        Token::Number(n) => {
                            self.bump();
                            terms.push(MemTerm::Number {
                                value: i64::from(sign) * (n as i64),
                                span: t.span,
                            });
                        }
                        _ => {
                            return Err(ParseError {
                                span: t.span,
                                message: format!(
                                    "expected register or number inside `[]`, found {}",
                                    t.tok
                                ),
                            });
                        }
                    }
                    let next = self.peek().clone();
                    match next.tok {
                        Token::Plus => {
                            self.bump();
                            sign = 1;
                        }
                        Token::Minus => {
                            self.bump();
                            sign = -1;
                        }
                        Token::RBracket => break,
                        _ => {
                            return Err(ParseError {
                                span: next.span,
                                message: format!(
                                    "expected `+`, `-`, or `]` inside `[]`, found {}",
                                    next.tok
                                ),
                            });
                        }
                    }
                }
                let r = self.expect(&Token::RBracket)?;
                Ok(Operand::Mem(MemRef {
                    size_hint: None,
                    seg_override: None,
                    terms,
                    span: Span::new(l.span.start, r.span.end),
                }))
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
