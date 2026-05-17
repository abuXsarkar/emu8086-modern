//! 64 KiB linear memory for the 8085. Unlike the 8086 there is no
//! segmentation — addresses are flat 16-bit.

use serde::{Deserialize, Serialize};

pub const MEM_SIZE: usize = 0x1_0000;

/// 64 KiB byte-addressable memory. Boxed so the wasm stack doesn't
/// overflow on construction.
#[derive(Clone, Serialize, Deserialize)]
pub struct Memory {
    #[serde(with = "serde_bytes")]
    bytes: Vec<u8>,
}

impl Memory {
    #[must_use]
    pub fn new() -> Self {
        Self {
            bytes: vec![0; MEM_SIZE],
        }
    }

    #[must_use]
    pub fn read(&self, addr: u16) -> u8 {
        self.bytes[addr as usize]
    }

    pub fn write(&mut self, addr: u16, value: u8) {
        self.bytes[addr as usize] = value;
    }

    /// Read a little-endian 16-bit word.
    #[must_use]
    pub fn read_u16(&self, addr: u16) -> u16 {
        let lo = self.read(addr);
        let hi = self.read(addr.wrapping_add(1));
        u16::from(lo) | (u16::from(hi) << 8)
    }

    /// Write a little-endian 16-bit word.
    pub fn write_u16(&mut self, addr: u16, value: u16) {
        self.write(addr, value as u8);
        self.write(addr.wrapping_add(1), (value >> 8) as u8);
    }

    /// Load a contiguous byte block at `base` (wraps at 64 KiB).
    pub fn load(&mut self, base: u16, bytes: &[u8]) {
        for (i, &b) in bytes.iter().enumerate() {
            self.write(base.wrapping_add(i as u16), b);
        }
    }

    /// Borrow the whole byte array for read-only access (e.g. the web
    /// IDE's memory inspector).
    #[must_use]
    pub fn as_slice(&self) -> &[u8] {
        &self.bytes
    }
}

impl Default for Memory {
    fn default() -> Self {
        Self::new()
    }
}

// `serde_bytes` is convenient but we don't actually want to pull the
// crate just for one field — provide a local module that round-trips
// a `Vec<u8>` as a sequence (which serde does by default). The marker
// here keeps the field's wire format obviously documented.
mod serde_bytes {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(v: &Vec<u8>, s: S) -> Result<S::Ok, S::Error> {
        v.serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
        Vec::<u8>::deserialize(d)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_byte() {
        let mut m = Memory::new();
        m.write(0x2050, 0xAB);
        assert_eq!(m.read(0x2050), 0xAB);
    }

    #[test]
    fn round_trip_word_little_endian() {
        let mut m = Memory::new();
        m.write_u16(0x2050, 0xBEEF);
        assert_eq!(m.read(0x2050), 0xEF);
        assert_eq!(m.read(0x2051), 0xBE);
        assert_eq!(m.read_u16(0x2050), 0xBEEF);
    }

    #[test]
    fn load_block() {
        let mut m = Memory::new();
        m.load(0x4200, &[0x3E, 0x42, 0x76]); // MVI A,42H ; HLT
        assert_eq!(m.read(0x4200), 0x3E);
        assert_eq!(m.read(0x4201), 0x42);
        assert_eq!(m.read(0x4202), 0x76);
    }

    #[test]
    fn wraparound_at_top_of_memory() {
        let mut m = Memory::new();
        m.write_u16(0xFFFF, 0x1234); // low at FFFF, high wraps to 0000
        assert_eq!(m.read(0xFFFF), 0x34);
        assert_eq!(m.read(0x0000), 0x12);
    }
}
