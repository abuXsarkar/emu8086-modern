//! modern8085-assembler
//!
//! Two-pass assembler for the Intel 8085. Public entry point:
//! `assemble(source) -> Result<Output, Error>`.
//!
//! Pipeline:
//!   source string
//!     → preprocess (tolerance auto-fixes; reports inline hints)
//!     → lex (line-aware token stream)
//!     → parse (directives + instructions → AST with source spans)
//!     → encode pass 1 (compute label addresses)
//!     → encode pass 2 (emit bytes, resolve label references)
//!
//! Default ORG when none specified: `0x2000` (textbook convention).
//! Programs assembled below 0x2000 are valid — that's just where labels
//! resolve to if no `ORG` directive appears.

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
    clippy::map_unwrap_or,
    clippy::unreadable_literal,
    clippy::manual_range_contains,
    clippy::if_not_else,
    clippy::needless_pass_by_value,
    clippy::needless_lifetimes,
    clippy::redundant_closure,
    clippy::single_match_else,
    clippy::or_fun_call,
    clippy::collapsible_else_if,
    clippy::manual_let_else,
    clippy::unnested_or_patterns,
    clippy::manual_strip,
    clippy::needless_for_each,
    clippy::trivially_copy_pass_by_ref,
    clippy::ignored_unit_patterns,
    clippy::verbose_bit_mask,
    clippy::redundant_else,
    clippy::str_split_at_newline,
    clippy::needless_continue,
    clippy::format_in_format_args,
    clippy::manual_repeat_n,
    clippy::ptr_arg,
    clippy::missing_const_for_fn,
    clippy::manual_map,
    clippy::while_let_loop,
    clippy::option_if_let_else,
    clippy::redundant_field_names,
    clippy::single_char_pattern,
    clippy::iter_on_single_items,
    clippy::needless_collect
)]

pub mod encode;
pub mod lexer;
pub mod parser;
pub mod preprocess;

use serde::Serialize;

/// Result of a successful assembly.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Output {
    /// Origin address where the bytes were laid down. Defaults to
    /// `DEFAULT_ORG` if no `ORG` directive was present.
    pub origin: u16,
    /// The assembled byte image, indexed from offset 0 (i.e. relative
    /// to `origin`). Consumers load these into memory at `origin`.
    pub bytes: Vec<u8>,
    /// One source-map entry per emitted byte: `source_map[i]` is the
    /// 1-indexed line in the original source that produced
    /// `bytes[i]`. The web IDE uses this to highlight the current
    /// line during step.
    pub source_map: Vec<u32>,
    /// `(line_no, hint_text)` for each tolerance auto-fix that fired
    /// during preprocessing. The IDE renders these as inline margin
    /// hints so students learn what was wrong.
    pub hints: Vec<(u32, String)>,
    /// `(symbol, address)` for every defined label, useful for the
    /// memory inspector + jump-to-label features.
    pub symbols: Vec<(String, u16)>,
}

/// Default origin used when the source contains no `ORG` directive.
/// Matches GeeksforGeeks / Tutorialspoint / textbook convention.
pub const DEFAULT_ORG: u16 = 0x2000;

/// Origin used in "Lab Kit Mode" — matches the Vinytics/Dynalog
/// trainer kit RAM start ubiquitous in Indian lab curricula.
pub const KIT_ORG: u16 = 0x4200;

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

/// Convenience wrapper around the full pipeline. Most callers want
/// this; advanced consumers can drive `preprocess` / `lex` / `parse` /
/// `encode` manually.
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
    fn lone_hlt_emits_one_byte() {
        let out = assemble("HLT").unwrap();
        assert_eq!(out.bytes, vec![0x76]);
        assert_eq!(out.origin, DEFAULT_ORG);
    }

    #[test]
    fn explicit_org_sets_origin() {
        let out = assemble("ORG 4200H\nHLT").unwrap();
        assert_eq!(out.origin, 0x4200);
        assert_eq!(out.bytes, vec![0x76]);
    }

    #[test]
    fn mvi_a_immediate() {
        let out = assemble("MVI A, 42H\nHLT").unwrap();
        // MVI A is 0x3E, then the immediate byte 0x42, then HLT 0x76.
        assert_eq!(out.bytes, vec![0x3E, 0x42, 0x76]);
    }

    #[test]
    fn add_two_bytes_example() {
        // Smallest version of GfG example #1: A = first + second
        let src = "
            LDA 2050H
            MOV B, A
            LDA 2051H
            ADD B
            STA 3050H
            HLT
        ";
        let out = assemble(src).unwrap();
        assert_eq!(
            out.bytes,
            vec![
                0x3A, 0x50, 0x20, // LDA 2050H
                0x47, // MOV B,A
                0x3A, 0x51, 0x20, // LDA 2051H
                0x80, // ADD B
                0x32, 0x50, 0x30, // STA 3050H
                0x76, // HLT
            ]
        );
    }

    #[test]
    fn label_resolution_in_jmp() {
        let src = "
            ORG 2000H
        START:
            MVI A, 01H
            JMP DONE
            MVI A, 02H   ; should be skipped at runtime
        DONE:
            HLT
        ";
        let out = assemble(src).unwrap();
        assert_eq!(out.origin, 0x2000);
        // MVI A, 01H = 3E 01           → 2000, 2001
        // JMP DONE   = C3 lo hi        → 2002, 2003, 2004
        // MVI A, 02H = 3E 02           → 2005, 2006
        // HLT        = 76              → 2007
        // DONE = 0x2007
        assert_eq!(out.bytes[..2], [0x3E, 0x01]);
        assert_eq!(out.bytes[2..5], [0xC3, 0x07, 0x20]);
        assert_eq!(out.bytes[5..7], [0x3E, 0x02]);
        assert_eq!(out.bytes[7], 0x76);
    }

    #[test]
    fn tolerance_hex_without_leading_zero() {
        // `FFH` should auto-fix to `0FFH` and assemble.
        let out = assemble("MVI A, FFH\nHLT").unwrap();
        assert_eq!(out.bytes, vec![0x3E, 0xFF, 0x76]);
        assert!(!out.hints.is_empty(), "fix should be reported as a hint");
    }
}
