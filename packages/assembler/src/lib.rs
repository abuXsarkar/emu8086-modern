//! emu8086-assembler
//!
//! Two-pass assembler with `emu8086` and (later) `nasm` dialects.
//!
//! M2.1 status: lexer, parser, and encoder for the hello-world subset:
//! `mov reg, imm`, `mov reg, reg`, `add/sub/cmp/and/or/xor/adc/sbb`,
//! `int imm8`, `push/pop`, `inc/dec`, the 16 `Jcc` short branches,
//! `LOOP`/`JCXZ`, `JMP`/`CALL` near, `RET`, single-byte flag/halt/no-op
//! ops, plus `org`, `db`, `dw` directives and labels.
//!
//! Memory operands (mod-r/m), `EQU`, `DUP`, the `emu8086.inc` macro pack,
//! and the rest of the dialect arrive in subsequent slices.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::too_many_lines,
    clippy::match_same_arms,
    clippy::if_same_then_else,
    clippy::needless_lifetimes,
    clippy::single_match_else,
    clippy::manual_let_else,
    clippy::wildcard_in_or_patterns,
    clippy::match_wildcard_for_single_variants,
    clippy::used_underscore_binding,
    clippy::unused_self,
    clippy::no_effect_underscore_binding,
    clippy::similar_names,
    clippy::collapsible_match,
    clippy::collapsible_if
)]

use thiserror::Error;

pub mod encode;
pub mod lexer;
pub mod parser;

pub use encode::AssembledImage;
pub use lexer::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Dialect {
    #[default]
    Emu8086,
    Nasm,
}

#[derive(Debug, Error)]
pub enum AssembleError {
    #[error("{0}")]
    Lex(#[from] lexer::LexError),
    #[error("{0}")]
    Parse(parser::ParseError),
    #[error("{0}")]
    Encode(encode::EncodeError),
}

impl From<parser::ParseError> for AssembleError {
    fn from(e: parser::ParseError) -> Self {
        Self::Parse(e)
    }
}
impl From<encode::EncodeError> for AssembleError {
    fn from(e: encode::EncodeError) -> Self {
        Self::Encode(e)
    }
}

/// Assemble `source` and return the raw image bytes (with `org` already
/// applied to label addresses).
pub fn assemble(source: &str, _dialect: Dialect) -> Result<AssembledImage, AssembleError> {
    let toks = lexer::tokenize(source)?;
    let prog = parser::parse(&toks)?;
    let img = encode::encode(&prog)?;
    Ok(img)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_dialect_is_emu8086() {
        assert_eq!(Dialect::default(), Dialect::Emu8086);
    }

    #[test]
    fn assemble_smoke() {
        let img = assemble("hlt\n", Dialect::default()).unwrap();
        assert_eq!(img.bytes, vec![0xF4]);
    }
}
