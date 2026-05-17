//! modern8085-core
//!
//! Deterministic Intel 8085 CPU core. Sibling to `modern8086-core`.
//! Compiles to a native `cdylib`/`rlib` and to wasm32 with `wasm-bindgen`
//! exports.
//!
//! M0 status: register/flag data model + memory + version probe. Decoder
//! and executor land in M1.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss,
    clippy::many_single_char_names,
    clippy::doc_overindented_list_items,
    clippy::similar_names,
    clippy::doc_markdown,
    clippy::module_name_repetitions
)]

pub mod alu;
pub mod cpu;
pub mod exec;
pub mod mem;

pub use cpu::{Cpu, Flags, Reg8, RegPair, StepRecord, StopReason};
pub use exec::{run, step};
pub use mem::{Memory, MEM_SIZE};

/// Bootstrap probe. **Not** wasm-bindgen-exposed — that's the wasm-api
/// crate's job. Re-exposing here would produce a duplicate-symbol
/// link error when both crates end up in the same wasm binary.
#[must_use]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_returns_cargo_pkg_version() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }
}
