//! Tokenizer for 8086 assembly source.
//!
//! Hand-written and small. We deliberately keep tokens close to source
//! bytes so diagnostics can attach precise spans.

use std::fmt;

/// A half-open byte range into the source string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

impl Span {
    #[must_use]
    pub fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    Ident(String),
    /// A decimal/hex/binary integer literal that fit in u32 already.
    Number(u32),
    /// A double-quoted string literal, with escapes processed.
    String(Vec<u8>),
    Comma,
    Colon,
    LBracket,
    RBracket,
    LParen,
    RParen,
    Plus,
    Minus,
    Star,
    /// `/` — integer division in constant expressions.
    Slash,
    /// `%` — modulo in constant expressions. (MASM also accepts the `MOD`
    /// keyword for the same operation; we recognise both.)
    Percent,
    /// `$` — current-location counter. Evaluates to the address of the
    /// next byte to be emitted in the current segment, used in the
    /// canonical `LEN EQU $-MSG` length-of-data idiom.
    Dollar,
    Newline,
    Eof,
}

impl fmt::Display for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ident(s) => write!(f, "identifier `{s}`"),
            Self::Number(n) => write!(f, "number `{n}`"),
            Self::String(_) => write!(f, "string"),
            Self::Comma => f.write_str(","),
            Self::Colon => f.write_str(":"),
            Self::LBracket => f.write_str("["),
            Self::RBracket => f.write_str("]"),
            Self::LParen => f.write_str("("),
            Self::RParen => f.write_str(")"),
            Self::Plus => f.write_str("+"),
            Self::Minus => f.write_str("-"),
            Self::Star => f.write_str("*"),
            Self::Slash => f.write_str("/"),
            Self::Percent => f.write_str("%"),
            Self::Dollar => f.write_str("$"),
            Self::Newline => f.write_str("newline"),
            Self::Eof => f.write_str("end of file"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spanned {
    pub tok: Token,
    pub span: Span,
}

#[derive(Debug, thiserror::Error)]
#[error("lexer error at byte {pos}: {msg}")]
pub struct LexError {
    pub pos: usize,
    pub msg: String,
}

pub fn tokenize(src: &str) -> Result<Vec<Spanned>, LexError> {
    let bytes = src.as_bytes();
    let mut i = 0usize;
    let mut out = Vec::new();
    let mut line_just_started = true;

    while i < bytes.len() {
        let b = bytes[i];

        // Skip horizontal whitespace, but preserve newlines as tokens —
        // statements are line-terminated.
        if b == b' ' || b == b'\t' || b == b'\r' {
            i += 1;
            continue;
        }

        if b == b'\n' {
            // Collapse runs of blank newlines: only emit one separator.
            if !line_just_started {
                out.push(Spanned {
                    tok: Token::Newline,
                    span: Span::new(i, i + 1),
                });
                line_just_started = true;
            }
            i += 1;
            continue;
        }

        // Line comment: ';' to end-of-line.
        if b == b';' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        line_just_started = false;
        let start = i;

        // Punctuation.
        let punct = match b {
            b',' => Some(Token::Comma),
            b':' => Some(Token::Colon),
            b'[' => Some(Token::LBracket),
            b']' => Some(Token::RBracket),
            b'(' => Some(Token::LParen),
            b')' => Some(Token::RParen),
            b'+' => Some(Token::Plus),
            b'-' => Some(Token::Minus),
            b'*' => Some(Token::Star),
            b'/' => Some(Token::Slash),
            b'%' => Some(Token::Percent),
            b'$' => Some(Token::Dollar),
            // MASM's "uninitialized" placeholder in `db ?` / `dw ?` /
            // `dd ?` data declarations. Surfaced as an identifier so
            // the parser's data-item branch (which already special-
            // cases the name "?") can pick it up and emit a zero
            // value. Outside a data context the parser will reject
            // it, same as before.
            b'?' => {
                i += 1;
                out.push(Spanned {
                    tok: Token::Ident("?".to_string()),
                    span: Span::new(start, i),
                });
                continue;
            }
            _ => None,
        };
        if let Some(t) = punct {
            i += 1;
            out.push(Spanned {
                tok: t,
                span: Span::new(start, i),
            });
            continue;
        }

        // String literal: "..." with simple escape processing.
        // Single-quoted runs are char/short-string literals: 'A' is the
        // number 0x41, 'AB' is 0x4241 (the 8086 / MASM convention for
        // packed-string immediates). Multi-byte single-quote runs longer
        // than 4 bytes are rejected for now.
        if b == b'"' || b == b'\'' {
            let quote = b;
            i += 1;
            let mut s: Vec<u8> = Vec::new();
            while i < bytes.len() && bytes[i] != quote {
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    let esc = bytes[i + 1];
                    let ch = match esc {
                        b'n' => b'\n',
                        b'r' => b'\r',
                        b't' => b'\t',
                        b'0' => 0,
                        b'\\' => b'\\',
                        b'"' => b'"',
                        b'\'' => b'\'',
                        other => other,
                    };
                    s.push(ch);
                    i += 2;
                } else if bytes[i] == b'\n' {
                    return Err(LexError {
                        pos: start,
                        msg: "unterminated string literal".into(),
                    });
                } else {
                    s.push(bytes[i]);
                    i += 1;
                }
            }
            if i >= bytes.len() {
                return Err(LexError {
                    pos: start,
                    msg: "unterminated string literal".into(),
                });
            }
            i += 1; // consume closing quote

            if quote == b'\'' {
                // Char/short-string literal → packed Number.
                if s.is_empty() || s.len() > 4 {
                    return Err(LexError {
                        pos: start,
                        msg: format!("char literal must be 1-4 bytes (got {})", s.len()),
                    });
                }
                let mut n: u32 = 0;
                for &byte in &s {
                    n = (n << 8) | u32::from(byte);
                }
                out.push(Spanned {
                    tok: Token::Number(n),
                    span: Span::new(start, i),
                });
            } else {
                out.push(Spanned {
                    tok: Token::String(s),
                    span: Span::new(start, i),
                });
            }
            continue;
        }

        // Number or identifier.
        let is_ident_start = b.is_ascii_alphabetic() || b == b'_' || b == b'.' || b == b'@';
        let is_digit = b.is_ascii_digit();
        if !(is_ident_start || is_digit) {
            return Err(LexError {
                pos: i,
                msg: format!("unexpected character `{}`", b as char),
            });
        }

        // Lex the run of ident-or-number characters together. We then
        // decide whether it's a number (starts with a digit) or an ident
        // by inspecting the first byte; this lets us accept MASM-style
        // hex like `0FFh` without needing a prefix.
        let run_start = i;
        while i < bytes.len() {
            let c = bytes[i];
            if c.is_ascii_alphanumeric() || c == b'_' || c == b'.' || c == b'@' {
                i += 1;
            } else {
                break;
            }
        }
        let raw = &src[run_start..i];

        if raw.as_bytes()[0].is_ascii_digit() {
            let n = parse_numeric_literal(raw).map_err(|m| LexError {
                pos: run_start,
                msg: m,
            })?;
            out.push(Spanned {
                tok: Token::Number(n),
                span: Span::new(run_start, i),
            });
        } else {
            out.push(Spanned {
                tok: Token::Ident(raw.to_string()),
                span: Span::new(run_start, i),
            });
        }
    }

    out.push(Spanned {
        tok: Token::Eof,
        span: Span::new(bytes.len(), bytes.len()),
    });
    Ok(out)
}

fn parse_numeric_literal(raw: &str) -> Result<u32, String> {
    // Accept MASM-style suffixes (0FFh, 1011b) and 0x prefix (extension).
    let lower = raw.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    // 0x... or 0X...
    if bytes.len() > 2 && bytes[0] == b'0' && bytes[1] == b'x' {
        return u32::from_str_radix(&lower[2..], 16)
            .map_err(|e| format!("invalid hex literal `{raw}`: {e}"));
    }
    // ...h suffix (must start with a digit, which the run-rule already
    // enforces — note that `0FFh` works because 0 is a digit).
    if bytes.last() == Some(&b'h') {
        return u32::from_str_radix(&lower[..lower.len() - 1], 16)
            .map_err(|e| format!("invalid hex literal `{raw}`: {e}"));
    }
    if bytes.last() == Some(&b'b') {
        return u32::from_str_radix(&lower[..lower.len() - 1], 2)
            .map_err(|e| format!("invalid binary literal `{raw}`: {e}"));
    }
    if bytes.last() == Some(&b'o') {
        return u32::from_str_radix(&lower[..lower.len() - 1], 8)
            .map_err(|e| format!("invalid octal literal `{raw}`: {e}"));
    }
    // Plain decimal.
    lower
        .parse::<u32>()
        .map_err(|e| format!("invalid decimal literal `{raw}`: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn toks(src: &str) -> Vec<Token> {
        tokenize(src).unwrap().into_iter().map(|s| s.tok).collect()
    }

    #[test]
    fn punctuation_and_idents() {
        assert_eq!(
            toks("mov ax, bx"),
            vec![
                Token::Ident("mov".into()),
                Token::Ident("ax".into()),
                Token::Comma,
                Token::Ident("bx".into()),
                Token::Eof,
            ]
        );
    }

    #[test]
    fn hex_decimal_binary_literals() {
        assert_eq!(
            toks("123 0FFh 1011b 0x10"),
            vec![
                Token::Number(123),
                Token::Number(0xFF),
                Token::Number(0b1011),
                Token::Number(0x10),
                Token::Eof,
            ]
        );
    }

    #[test]
    fn string_literal_with_escapes() {
        let t = toks(r#""hi\nworld""#);
        assert!(matches!(&t[0], Token::String(s) if s == b"hi\nworld"));
    }

    #[test]
    fn comments_skipped_newlines_kept() {
        let t = toks("nop ; trailing\nhlt\n");
        assert_eq!(
            t,
            vec![
                Token::Ident("nop".into()),
                Token::Newline,
                Token::Ident("hlt".into()),
                Token::Newline,
                Token::Eof,
            ]
        );
    }

    #[test]
    fn slash_percent_dollar_tokens() {
        // The three new operators / location-counter token. They must
        // round-trip through `Display` so error messages naming them
        // read sensibly.
        assert_eq!(
            toks("a / b % $"),
            vec![
                Token::Ident("a".into()),
                Token::Slash,
                Token::Ident("b".into()),
                Token::Percent,
                Token::Dollar,
                Token::Eof,
            ]
        );
        assert_eq!(format!("{}", Token::Slash), "/");
        assert_eq!(format!("{}", Token::Percent), "%");
        assert_eq!(format!("{}", Token::Dollar), "$");
    }

    #[test]
    fn dollar_minus_label_loc_counter_idiom() {
        // The canonical `LEN EQU $-MSG` lab-manual idiom must lex into
        // four discrete tokens so the parser's expression evaluator can
        // see them.
        assert_eq!(
            toks("LEN EQU $-MSG"),
            vec![
                Token::Ident("LEN".into()),
                Token::Ident("EQU".into()),
                Token::Dollar,
                Token::Minus,
                Token::Ident("MSG".into()),
                Token::Eof,
            ]
        );
    }

    #[test]
    fn label_then_instruction() {
        let t = toks("start: hlt");
        assert_eq!(
            t,
            vec![
                Token::Ident("start".into()),
                Token::Colon,
                Token::Ident("hlt".into()),
                Token::Eof,
            ]
        );
    }
}
