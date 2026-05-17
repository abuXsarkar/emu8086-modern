//! wasm-bindgen API for the modern8051 web IDE — skeleton.
//!
//! Full Emulator class lands after the core executor (M1) does.
//! For now this just exposes a version probe so the JS side can
//! verify the wasm module loaded.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

/// Bootstrap probe.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[must_use]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_returns_pkg_version() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }
}
