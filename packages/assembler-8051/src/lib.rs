//! modern8051-assembler — skeleton.
//!
//! Two-pass assembler for the Intel 8051. Public entry point:
//! `assemble(source) -> Result<Output, Error>`.
//!
//! Pipeline mirrors `modern8085-assembler`:
//!   source → preprocess (tolerance) → lex → parse → encode (2 passes).
//!
//! Default ORG when none present: `0x0000` (8051 reset vector).
//!
//! Implementation lands in PR #N+1 once the dialect spec consolidates
//! (see docs/plans/8051-port.md). For now this crate just exposes the
//! types so downstream wasm-api and CLI can compile against the API.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::module_name_repetitions
)]

use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
pub struct Output {
    pub origin: u16,
    pub bytes: Vec<u8>,
    pub source_map: Vec<u32>,
    pub hints: Vec<(u32, String)>,
    pub symbols: Vec<(String, u16)>,
}

pub const DEFAULT_ORG: u16 = 0x0000;

#[derive(Debug, thiserror::Error, Clone, PartialEq, Eq)]
pub enum Error {
    #[error("line {line}: {msg}")]
    Lex { line: u32, msg: String },
    #[error("line {line}: {msg}")]
    Parse { line: u32, msg: String },
    #[error("line {line}: {msg}")]
    Encode { line: u32, msg: String },
    #[error("undefined label `{name}` referenced at line {line}")]
    UndefinedLabel { name: String, line: u32 },
    #[error("duplicate label `{name}` at line {line} (first defined at line {first_line})")]
    DuplicateLabel { name: String, line: u32, first_line: u32 },
    #[error("not yet implemented — modern8051-assembler is a skeleton")]
    NotYetImplemented,
}

/// Public assembler entry point. Returns `NotYetImplemented` until the
/// lexer/parser/encoder land.
pub fn assemble(_source: &str) -> Result<Output, Error> {
    Err(Error::NotYetImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skeleton_returns_not_yet_implemented() {
        let r = assemble("MOV A, #42H\nNOP");
        assert!(matches!(r, Err(Error::NotYetImplemented)));
    }

    #[test]
    fn default_org_is_reset_vector() {
        assert_eq!(DEFAULT_ORG, 0x0000);
    }
}
