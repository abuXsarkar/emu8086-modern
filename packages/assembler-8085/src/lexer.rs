//! Line-aware tokenizer.
//!
//! Tokens carry their source line so error messages and the source-map
//! can point at the right spot. Comments and inter-token whitespace
//! are dropped; newlines become `Tok::Eol` because the 8085 grammar is
//! one-instruction-per-line.

use crate::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Tok {
    /// An identifier — could be a mnemonic, register, directive,
    /// label definition, or label reference. The parser decides which.
    Ident(String),
    /// A parsed numeric literal (hex/dec/binary already resolved).
    Number(i64),
    /// A string literal as used inside `DB "hello"` / `DB 'A'`.
    Str(String),
    /// `:` — only ever follows a label-definition identifier.
    Colon,
    /// `,` — operand separator.
    Comma,
    /// `+` — only inside operand expressions (deferred to a later
    /// phase; the lexer still produces the token so the parser can
    /// emit a sane error).
    Plus,
    /// `-` — same caveat.
    Minus,
    /// End-of-line — significant because the grammar is one-stmt-per-line.
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
                // swallow standalone CR; the LF (if present) bumps the
                // line counter for us.
                chars.next();
            }
            ';' => {
                // comment to EOL
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
                                    msg: "unterminated escape in string literal".into(),
                                });
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
                // Number literal — collect alphanumerics, parse below.
                let mut buf = String::new();
                while let Some(&nc) = chars.peek() {
                    if nc.is_ascii_alphanumeric() || nc == '_' {
                        buf.push(nc);
                        chars.next();
                    } else {
                        break;
                    }
                }
                // Strip optional underscores (rule 19).
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
                // An identifier might *actually* be a hex literal that
                // happens to start with A-F and ends in H. We let the
                // preprocessor handle the FFH case (rewrites to 0FFH);
                // here we don't try to re-detect that.
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

    // Always end with an Eol so the parser sees a clean terminator.
    if !matches!(out.last(), Some(Token { tok: Tok::Eol, .. })) {
        out.push(Token {
            tok: Tok::Eol,
            line,
        });
    }
    Ok(out)
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_' || c == '?' || c == '@'
}

fn is_ident_cont(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '?' || c == '@'
}

fn parse_numeric(s: &str, line: u32) -> Result<i64, Error> {
    // Strict-by-suffix per spec rule 14: never treat a leading 0 as
    // octal. Default base is decimal.
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
        'B' | 'b' => (&s[..s.len() - 1], 2),
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

    fn idents(toks: &[Token]) -> Vec<String> {
        toks.iter()
            .filter_map(|t| {
                if let Tok::Ident(s) = &t.tok {
                    Some(s.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    fn numbers(toks: &[Token]) -> Vec<i64> {
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
    fn lex_hlt() {
        let t = lex("HLT").unwrap();
        assert_eq!(idents(&t), vec!["HLT"]);
    }

    #[test]
    fn comment_dropped() {
        let t = lex("HLT ; bye\n").unwrap();
        assert_eq!(idents(&t), vec!["HLT"]);
    }

    #[test]
    fn hex_decimal_binary_literals() {
        let t = lex("0FFH 42 1010B 17Q").unwrap();
        assert_eq!(numbers(&t), vec![0xFF, 42, 10, 15]);
    }

    #[test]
    fn underscore_in_number_stripped() {
        let t = lex("1010_1100B").unwrap();
        assert_eq!(numbers(&t), vec![0b1010_1100]);
    }

    #[test]
    fn commas_and_colons() {
        let t = lex("LOOP: MOV A, B").unwrap();
        let kinds: Vec<&str> = t
            .iter()
            .map(|t| match &t.tok {
                Tok::Ident(_) => "ident",
                Tok::Number(_) => "num",
                Tok::Comma => "comma",
                Tok::Colon => "colon",
                Tok::Eol => "eol",
                _ => "?",
            })
            .collect();
        assert_eq!(
            kinds,
            vec!["ident", "colon", "ident", "ident", "comma", "ident", "eol"]
        );
    }

    #[test]
    fn line_numbers_advance() {
        let t = lex("HLT\nNOP").unwrap();
        // The two ident tokens should be on lines 1 and 2.
        let lines: Vec<u32> = t
            .iter()
            .filter_map(|t| {
                if let Tok::Ident(_) = &t.tok {
                    Some(t.line)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(lines, vec![1, 2]);
    }

    #[test]
    fn string_literal() {
        let t = lex("DB 'A'").unwrap();
        let strs: Vec<String> = t
            .iter()
            .filter_map(|t| {
                if let Tok::Str(s) = &t.tok {
                    Some(s.clone())
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(strs, vec!["A"]);
    }
}
