//! emu8086-assembler
//!
//! Two-pass assembler for 8086 with two dialects (`emu8086`, `nasm`).
//!
//! M0 status: skeleton only. Lexer + parser land in M2.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]

use thiserror::Error;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Dialect {
    #[default]
    Emu8086,
    Nasm,
}

#[derive(Debug, Error)]
pub enum AssembleError {
    #[error("not yet implemented (M2 deliverable)")]
    NotImplemented,
}

/// Public entry point. Real implementation lands in M2.
///
/// # Errors
/// Always returns `NotImplemented` until M2.
pub fn assemble(_source: &str, _dialect: Dialect) -> Result<Vec<u8>, AssembleError> {
    Err(AssembleError::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_dialect_is_emu8086() {
        assert_eq!(Dialect::default(), Dialect::Emu8086);
    }

    #[test]
    fn assemble_returns_not_implemented_for_now() {
        let r = assemble("nop", Dialect::default());
        assert!(matches!(r, Err(AssembleError::NotImplemented)));
    }
}
