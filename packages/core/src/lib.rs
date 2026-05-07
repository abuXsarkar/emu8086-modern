//! emu8086-core
//!
//! Deterministic 8086 CPU core. Compiles to a native `cdylib`/`rlib` and to
//! wasm32 with `wasm-bindgen` exports.
//!
//! M0 status: registers data model + cross-target version probe. Decoder and
//! executor land in M1.

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
    clippy::doc_markdown
)]

use serde::{Deserialize, Serialize};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

pub mod alu;
pub mod cpu;
pub mod mem;

pub use cpu::{Clock, Cpu, FileHandle, Reg16, Reg8, StepRecord, StopReason, Vfs};
pub use mem::{seg_off, Memory, MEM_SIZE};

/// Bootstrap probe used by the M0 hello-wasm path.
///
/// The web IDE calls this once on startup to verify the wasm module loaded
/// and the JS↔Rust boundary is wired correctly.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[must_use]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// A short greeting used as the M0 end-to-end demo. Will be removed in M1
/// once `step()` is the primary boundary call.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[must_use]
pub fn greet(name: &str) -> String {
    let trimmed = name.trim();
    let who = if trimmed.is_empty() { "world" } else { trimmed };
    format!("Hello, {who}! emu8086-core v{} is alive.", version())
}

/// 16-bit FLAGS register layout (8086).
///
/// Only the documented bits matter; bits 1, 3, 5, 12-15 are reserved on the
/// 8086 and read back as 1, 0, 0, 1, 1, 1, 1 respectively in real hardware.
/// We expose the documented ones as named accessors for the IDE.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Flags(pub u16);

impl Flags {
    pub const CF: u16 = 1 << 0;
    pub const PF: u16 = 1 << 2;
    pub const AF: u16 = 1 << 4;
    pub const ZF: u16 = 1 << 6;
    pub const SF: u16 = 1 << 7;
    pub const TF: u16 = 1 << 8;
    pub const IF: u16 = 1 << 9;
    pub const DF: u16 = 1 << 10;
    pub const OF: u16 = 1 << 11;

    #[must_use]
    pub fn get(self, mask: u16) -> bool {
        self.0 & mask != 0
    }

    pub fn set(&mut self, mask: u16, value: bool) {
        if value {
            self.0 |= mask;
        } else {
            self.0 &= !mask;
        }
    }
}

/// 8086 register file. M0: data model + accessors.
/// Decoder/executor populate these through proper instructions in M1.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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
    pub flags: Flags,
}

impl Registers {
    #[must_use]
    pub fn ah(self) -> u8 {
        (self.ax >> 8) as u8
    }
    #[must_use]
    pub fn al(self) -> u8 {
        (self.ax & 0xFF) as u8
    }
    #[must_use]
    pub fn bh(self) -> u8 {
        (self.bx >> 8) as u8
    }
    #[must_use]
    pub fn bl(self) -> u8 {
        (self.bx & 0xFF) as u8
    }
    #[must_use]
    pub fn ch(self) -> u8 {
        (self.cx >> 8) as u8
    }
    #[must_use]
    pub fn cl(self) -> u8 {
        (self.cx & 0xFF) as u8
    }
    #[must_use]
    pub fn dh(self) -> u8 {
        (self.dx >> 8) as u8
    }
    #[must_use]
    pub fn dl(self) -> u8 {
        (self.dx & 0xFF) as u8
    }

    pub fn set_ah(&mut self, v: u8) {
        self.ax = (self.ax & 0x00FF) | (u16::from(v) << 8);
    }
    pub fn set_al(&mut self, v: u8) {
        self.ax = (self.ax & 0xFF00) | u16::from(v);
    }
    pub fn set_bh(&mut self, v: u8) {
        self.bx = (self.bx & 0x00FF) | (u16::from(v) << 8);
    }
    pub fn set_bl(&mut self, v: u8) {
        self.bx = (self.bx & 0xFF00) | u16::from(v);
    }
    pub fn set_ch(&mut self, v: u8) {
        self.cx = (self.cx & 0x00FF) | (u16::from(v) << 8);
    }
    pub fn set_cl(&mut self, v: u8) {
        self.cx = (self.cx & 0xFF00) | u16::from(v);
    }
    pub fn set_dh(&mut self, v: u8) {
        self.dx = (self.dx & 0x00FF) | (u16::from(v) << 8);
    }
    pub fn set_dl(&mut self, v: u8) {
        self.dx = (self.dx & 0xFF00) | u16::from(v);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_cargo_pkg_version() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn greet_uses_world_for_empty() {
        assert!(greet("").contains("Hello, world"));
        assert!(greet("   ").contains("Hello, world"));
    }

    #[test]
    fn greet_uses_provided_name() {
        let s = greet("Abu");
        assert!(s.starts_with("Hello, Abu!"));
    }

    #[test]
    fn registers_default_zero() {
        let r = Registers::default();
        assert_eq!(r.ax, 0);
        assert_eq!(r.flags.0, 0);
    }

    #[test]
    fn high_low_byte_aliasing() {
        let mut r = Registers::default();
        r.set_ah(0xAB);
        r.set_al(0xCD);
        assert_eq!(r.ax, 0xABCD);
        assert_eq!(r.ah(), 0xAB);
        assert_eq!(r.al(), 0xCD);
    }

    #[test]
    fn flag_set_and_get() {
        let mut f = Flags::default();
        assert!(!f.get(Flags::ZF));
        f.set(Flags::ZF, true);
        assert!(f.get(Flags::ZF));
        f.set(Flags::CF, true);
        f.set(Flags::ZF, false);
        assert!(!f.get(Flags::ZF));
        assert!(f.get(Flags::CF));
    }
}
