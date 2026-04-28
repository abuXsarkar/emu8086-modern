//! emu8086-core
//!
//! Deterministic 8086 CPU core. Compiles to a native `cdylib` and to wasm.
//!
//! M0 status: skeleton only. The real decoder/executor lands in M1.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]

use serde::{Deserialize, Serialize};

/// Bootstrap probe used by the M0 hello-wasm path.
///
/// The web IDE calls this once on startup to verify the wasm module loaded
/// and the JS↔Rust boundary is wired correctly. Real APIs replace this in M1.
#[cfg_attr(feature = "wasm", wasm_bindgen::prelude::wasm_bindgen)]
#[must_use]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Initial register state. Placeholder — fields land with the real impl in M1.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Registers {
    pub ax: u16,
    pub bx: u16,
    pub cx: u16,
    pub dx: u16,
    pub si: u16,
    pub di: u16,
    pub bp: u16,
    pub sp: u16,
    pub ip: u16,
    pub cs: u16,
    pub ds: u16,
    pub es: u16,
    pub ss: u16,
    pub flags: u16,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_nonempty() {
        assert!(!version().is_empty());
    }

    #[test]
    fn registers_default_zero() {
        let r = Registers::default();
        assert_eq!(r.ax, 0);
        assert_eq!(r.flags, 0);
    }
}
