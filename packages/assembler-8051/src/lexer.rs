//! Line-aware tokenizer for 8051 assembly.
//!
//! Recognises identifiers, numbers (parsed by suffix), strings,
//! comma/colon/dot/at/plus/hash/slash punctuation, and EOL.
//! Comments stripped.

use crate::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Tok {
    Ident(String),
    Number(i64),
    Str(String),
    Colon,
    Comma,
    Dot,
    At,
    Plus,
    Minus,
    Hash,
    Slash,
    Eol,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub tok: Tok,
    pub line: u32,
}

pub fn lex(source: &str) -> Result<Vec<Token>, Error> {
    let mut out = Vec::new();
    let mut line = 1u32;
    let mut chars = source.chars().peekable();

    while let Some(&c) = chars.peek() {
        match c {
            '\n' => {
                out.push(Token {
                    tok: Tok::Eol,
                    line,
                });
                line += 1;
                chars.next();
            }
            '\r' => {
                chars.next();
            }
            ';' => {
                while let Some(&nc) = chars.peek() {
                    if nc == '\n' {
                        break;
                    }
                    chars.next();
                }
            }
            ' ' | '\t' => {
                chars.next();
            }
            ',' => {
                out.push(Token {
                    tok: Tok::Comma,
                    line,
                });
                chars.next();
            }
            ':' => {
                out.push(Token {
                    tok: Tok::Colon,
                    line,
                });
                chars.next();
            }
            '.' => {
                out.push(Token {
                    tok: Tok::Dot,
                    line,
                });
                chars.next();
            }
            '@' => {
                out.push(Token { tok: Tok::At, line });
                chars.next();
            }
            '+' => {
                out.push(Token {
                    tok: Tok::Plus,
                    line,
                });
                chars.next();
            }
            '-' => {
                out.push(Token {
                    tok: Tok::Minus,
                    line,
                });
                chars.next();
            }
            '#' => {
                out.push(Token {
                    tok: Tok::Hash,
                    line,
                });
                chars.next();
            }
            '/' => {
                out.push(Token {
                    tok: Tok::Slash,
                    line,
                });
                chars.next();
            }
            '$' => {
                // `$` means current PC in expressions. Encode as
                // identifier "$" so the parser handles it.
                out.push(Token {
                    tok: Tok::Ident("$".into()),
                    line,
                });
                chars.next();
            }
            '\'' | '"' => {
                let quote = c;
                chars.next();
                let mut s = String::new();
                let mut closed = false;
                while let Some(nc) = chars.next() {
                    if nc == quote {
                        closed = true;
                        break;
                    }
                    if nc == '\\' {
                        match chars.next() {
                            Some('n') => s.push('\n'),
                            Some('r') => s.push('\r'),
                            Some('t') => s.push('\t'),
                            Some('0') => s.push('\0'),
                            Some('\\') => s.push('\\'),
                            Some('\'') => s.push('\''),
                            Some('"') => s.push('"'),
                            Some(other) => s.push(other),
                            None => {
                                return Err(Error::Lex {
                                    line,
                                    msg: "unterminated escape".into(),
                                })
                            }
                        }
                    } else {
                        s.push(nc);
                    }
                }
                if !closed {
                    return Err(Error::Lex {
                        line,
                        msg: "unterminated string literal".into(),
                    });
                }
                out.push(Token {
                    tok: Tok::Str(s),
                    line,
                });
            }
            c if c.is_ascii_digit() => {
                let mut buf = String::new();
                while let Some(&nc) = chars.peek() {
                    if nc.is_ascii_alphanumeric() || nc == '_' {
                        buf.push(nc);
                        chars.next();
                    } else {
                        break;
                    }
                }
                let stripped: String = buf.chars().filter(|c| *c != '_').collect();
                let value = parse_numeric(&stripped, line)?;
                out.push(Token {
                    tok: Tok::Number(value),
                    line,
                });
            }
            c if is_ident_start(c) => {
                let mut buf = String::new();
                while let Some(&nc) = chars.peek() {
                    if is_ident_cont(nc) {
                        buf.push(nc);
                        chars.next();
                    } else {
                        break;
                    }
                }
                out.push(Token {
                    tok: Tok::Ident(buf),
                    line,
                });
            }
            _ => {
                return Err(Error::Lex {
                    line,
                    msg: format!("unexpected character `{c}`"),
                });
            }
        }
    }
    if !matches!(out.last(), Some(Token { tok: Tok::Eol, .. })) {
        out.push(Token {
            tok: Tok::Eol,
            line,
        });
    }
    Ok(out)
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_' || c == '?'
}

fn is_ident_cont(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '?'
}

fn parse_numeric(s: &str, line: u32) -> Result<i64, Error> {
    if s.is_empty() {
        return Err(Error::Lex {
            line,
            msg: "empty numeric literal".into(),
        });
    }
    let bytes = s.as_bytes();
    let last = bytes[bytes.len() - 1] as char;
    let (body, radix): (&str, u32) = match last {
        'H' | 'h' => (&s[..s.len() - 1], 16),
        'B' | 'b'
            if bytes.len() > 1
                && bytes[..bytes.len() - 1]
                    .iter()
                    .all(|b| matches!(b, b'0' | b'1')) =>
        {
            (&s[..s.len() - 1], 2)
        }
        'O' | 'o' | 'Q' | 'q' => (&s[..s.len() - 1], 8),
        'D' | 'd' if bytes.len() > 1 && bytes[..bytes.len() - 1].iter().all(u8::is_ascii_digit) => {
            (&s[..s.len() - 1], 10)
        }
        _ => (s, 10),
    };
    if body.is_empty() {
        return Err(Error::Lex {
            line,
            msg: format!("literal `{s}` has no digits"),
        });
    }
    i64::from_str_radix(body, radix).map_err(|_| Error::Lex {
        line,
        msg: format!("bad numeric literal `{s}`"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nums(toks: &[Token]) -> Vec<i64> {
        toks.iter()
            .filter_map(|t| {
                if let Tok::Number(n) = &t.tok {
                    Some(*n)
                } else {
                    None
                }
            })
            .collect()
    }

    #[test]
    fn numbers_in_all_bases() {
        let t = lex("0FFH 42 1010B 17Q 100D").unwrap();
        assert_eq!(nums(&t), vec![0xFF, 42, 10, 15, 100]);
    }

    #[test]
    fn bit_operand_tokenises_to_three_tokens() {
        // P1.0 → Ident("P1") Dot Number(0)
        let t = lex("P1.0").unwrap();
        assert!(matches!(&t[0].tok, Tok::Ident(s) if s == "P1"));
        assert!(matches!(&t[1].tok, Tok::Dot));
        assert!(matches!(&t[2].tok, Tok::Number(0)));
    }

    #[test]
    fn at_register_indirect() {
        let t = lex("@R0").unwrap();
        assert!(matches!(&t[0].tok, Tok::At));
        assert!(matches!(&t[1].tok, Tok::Ident(s) if s == "R0"));
    }

    #[test]
    fn hash_immediate() {
        let t = lex("#42H").unwrap();
        assert!(matches!(&t[0].tok, Tok::Hash));
        assert!(matches!(&t[1].tok, Tok::Number(0x42)));
    }

    #[test]
    fn dollar_sign_becomes_ident() {
        let t = lex("SJMP $").unwrap();
        assert!(matches!(&t[1].tok, Tok::Ident(s) if s == "$"));
    }
}
