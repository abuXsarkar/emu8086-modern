//! modern8051-core
//!
//! Deterministic Intel 8051 MCU core. Sibling to `modern8085-core`.
//! Compiles to a native `cdylib`/`rlib` and to wasm32 with `wasm-bindgen`
//! exports.
//!
//! M0 status: register / flag / SFR data model + 3-space memory + version
//! probe. Decoder and executor land in M1.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    clippy::cast_possible_wrap,
    clippy::cast_sign_loss,
    clippy::many_single_char_names,
    clippy::doc_overindented_list_items,
    clippy::doc_lazy_continuation,
    clippy::similar_names,
    clippy::doc_markdown,
    clippy::module_name_repetitions,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::trivially_copy_pass_by_ref,
    // The PSW genuinely is 8 single-bit fields. A bitflags wrapper
    // would obscure the executor more than help it.
    clippy::struct_excessive_bools,
    clippy::match_same_arms,
    clippy::needless_continue
)]

pub mod cpu;
pub mod exec;
pub mod mem;
pub mod sfr;

pub use cpu::{Cpu, Psw, StepRecord, StopReason};
pub use exec::{run, step};
pub use mem::{Memory, CODE_SIZE, IDATA_SIZE, XDATA_SIZE};
pub use sfr::SfrAddr;

/// Bootstrap probe. The web IDE calls this on startup to verify the
/// wasm module loaded.
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
