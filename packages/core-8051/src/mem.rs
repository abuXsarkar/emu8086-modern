//! Three-space 8051 memory: IDATA (internal 256 B), XDATA (external
//! 64 KiB), CODE (64 KiB program memory).
//!
//! On a real 8051 these are physically distinct buses; the instruction
//! that triggers an access picks which space. `MOV` direct/indirect
//! → IDATA, `MOVX A,@DPTR` → XDATA, `MOVC A,@A+DPTR` → CODE.

use serde::{Deserialize, Serialize};

pub const IDATA_SIZE: usize = 0x100; // 256 B
pub const XDATA_SIZE: usize = 0x1_0000; // 64 KiB
pub const CODE_SIZE: usize = 0x1_0000; // 64 KiB

#[derive(Clone, Serialize, Deserialize)]
pub struct Memory {
    pub idata: Vec<u8>,
    pub xdata: Vec<u8>,
    pub code: Vec<u8>,
}

impl Memory {
    #[must_use]
    pub fn new() -> Self {
        Self {
            idata: vec![0; IDATA_SIZE],
            xdata: vec![0; XDATA_SIZE],
            code: vec![0; CODE_SIZE],
        }
    }

    /// Read internal RAM / SFR byte. Direct-mode access — caller
    /// distinguishes from indirect (`@Ri`) at the executor level
    /// because direct addressing of 0x80-0xFF reaches the SFR area
    /// while indirect reaches the upper-128 RAM on parts that have
    /// it (the base 8051 returns the SFR for both, but we keep the
    /// distinction so an 8052 / extended part can be modelled later).
    #[must_use]
    pub fn idata_read(&self, addr: u8) -> u8 {
        self.idata[addr as usize]
    }

    pub fn idata_write(&mut self, addr: u8, value: u8) {
        self.idata[addr as usize] = value;
    }

    #[must_use]
    pub fn xdata_read(&self, addr: u16) -> u8 {
        self.xdata[addr as usize]
    }

    pub fn xdata_write(&mut self, addr: u16, value: u8) {
        self.xdata[addr as usize] = value;
    }

    #[must_use]
    pub fn code_read(&self, addr: u16) -> u8 {
        self.code[addr as usize]
    }

    /// Load a contiguous program block into CODE space at `base`.
    pub fn load_code(&mut self, base: u16, bytes: &[u8]) {
        for (i, &b) in bytes.iter().enumerate() {
            self.code[base as usize + i] = b;
        }
    }
}

impl Default for Memory {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn three_spaces_are_independent() {
        let mut m = Memory::new();
        m.idata_write(0x42, 0x11);
        m.xdata_write(0x42, 0x22);
        m.load_code(0x42, &[0x33]);
        assert_eq!(m.idata_read(0x42), 0x11);
        assert_eq!(m.xdata_read(0x42), 0x22);
        assert_eq!(m.code_read(0x42), 0x33);
    }

    #[test]
    fn idata_full_range() {
        let mut m = Memory::new();
        for a in 0..=255u8 {
            m.idata_write(a, a);
        }
        for a in 0..=255u8 {
            assert_eq!(m.idata_read(a), a);
        }
    }
}
