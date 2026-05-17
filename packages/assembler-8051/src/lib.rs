//! modern8051-assembler — Keil A51 / ASEM-51 canonical dialect.
//!
//! Pipeline mirrors `modern8085-assembler`:
//!   source → preprocess (tolerance auto-fixes) → lex → parse → encode.
//!
//! Default ORG when none present: `0x0000` (8051 reset vector).
//!
//! Canonical dialect per the research findings (`docs/plans/8051-port-research.md`):
//! - `;` comments
//! - hex `H` suffix, leading `0` required when first digit is A–F
//! - binary `B` suffix, octal `Q`/`O` suffix, decimal default
//! - labels `LABEL:` with colon
//! - bit operands `P1.0` / `ACC.7` / `addr.bit`
//! - directives `ORG`, `EQU`, `DB`, `DW`, `DS`, `END`, `BIT`, `DATA`

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::module_name_repetitions,
    clippy::similar_names,
    clippy::doc_markdown,
    clippy::too_many_lines,
    clippy::match_same_arms,
    clippy::unreadable_literal,
    clippy::if_not_else,
    clippy::needless_pass_by_value,
    clippy::needless_lifetimes,
    clippy::manual_range_contains,
    clippy::redundant_else,
    clippy::single_match_else,
    clippy::or_fun_call,
    clippy::manual_let_else,
    clippy::manual_strip,
    clippy::trivially_copy_pass_by_ref,
    clippy::collapsible_else_if,
    clippy::missing_const_for_fn,
    clippy::option_if_let_else,
    clippy::manual_repeat_n,
    clippy::needless_continue,
    clippy::verbose_bit_mask,
    clippy::ignored_unit_patterns,
    clippy::manual_map,
    clippy::single_char_pattern,
    clippy::redundant_closure,
    clippy::format_in_format_args
)]

pub mod encode;
pub mod lexer;
pub mod parser;
pub mod preprocess;

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
    DuplicateLabel {
        name: String,
        line: u32,
        first_line: u32,
    },
    #[error("value {value:#X} out of range for {kind} on line {line}")]
    ValueOutOfRange {
        line: u32,
        kind: &'static str,
        value: i64,
    },
}

pub fn assemble(source: &str) -> Result<Output, Error> {
    let (source, hints) = preprocess::preprocess(source);
    let tokens = lexer::lex(&source)?;
    let program = parser::parse(&tokens)?;
    let mut out = encode::encode(&program)?;
    out.hints = hints;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_source_yields_empty_output() {
        let out = assemble("").unwrap();
        assert!(out.bytes.is_empty());
        assert_eq!(out.origin, DEFAULT_ORG);
    }

    #[test]
    fn lone_nop_emits_one_byte() {
        let out = assemble("NOP").unwrap();
        assert_eq!(out.bytes, vec![0x00]);
    }

    #[test]
    fn mov_a_imm() {
        let out = assemble("MOV A, #42H").unwrap();
        assert_eq!(out.bytes, vec![0x74, 0x42]);
    }

    #[test]
    fn add_two_8bit_program() {
        // Add R0 to R1, store in A. (Simple sanity check.)
        let out = assemble(
            "ORG 0000H
            MOV A, R0
            ADD A, R1
            SJMP $",
        )
        .unwrap();
        // MOV A,R0 = E8 ; ADD A,R1 = 29 ; SJMP $ = 80 FE
        assert_eq!(out.bytes, vec![0xE8, 0x29, 0x80, 0xFE]);
    }
}
