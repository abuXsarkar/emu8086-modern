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

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

pub mod alu;
pub mod cpu;
pub mod exec;
pub mod mem;

pub use cpu::{Cpu, Flags, Reg8, RegPair, StepRecord, StopReason};
pub use exec::{run, step};
pub use mem::{Memory, MEM_SIZE};

/// Bootstrap probe used by the M0 hello-wasm path.
///
/// The web IDE calls this once on startup to verify the wasm module loaded
/// and the JS↔Rust boundary is wired correctly.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
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
