//! 1 MiB flat memory + 8086 segmented addressing.

/// Total 8086 address space: 1 MiB (20-bit linear).
pub const MEM_SIZE: usize = 1 << 20;

/// Translate a `seg:off` pair to a 20-bit linear address, with 8086
/// wrap-around at 1 MiB. (Real 80286+ A20-line behavior is not modeled.)
#[must_use]
#[allow(clippy::cast_possible_truncation)]
pub const fn seg_off(seg: u16, off: u16) -> usize {
    let lin = ((seg as u32) << 4).wrapping_add(off as u32);
    (lin as usize) & (MEM_SIZE - 1)
}

/// Flat 1 MiB byte memory. Helpers do little-endian word access and
/// transparently wrap at the 1 MiB boundary.
#[derive(Clone)]
pub struct Memory {
    bytes: Box<[u8]>,
}

impl Default for Memory {
    fn default() -> Self {
        Self::new()
    }
}

impl Memory {
    #[must_use]
    pub fn new() -> Self {
        Self {
            bytes: vec![0u8; MEM_SIZE].into_boxed_slice(),
        }
    }

    #[must_use]
    pub fn read_u8(&self, lin: usize) -> u8 {
        self.bytes[lin & (MEM_SIZE - 1)]
    }

    #[must_use]
    pub fn read_u16(&self, lin: usize) -> u16 {
        let lo = self.read_u8(lin);
        let hi = self.read_u8(lin.wrapping_add(1));
        u16::from_le_bytes([lo, hi])
    }

    pub fn write_u8(&mut self, lin: usize, value: u8) {
        self.bytes[lin & (MEM_SIZE - 1)] = value;
    }

    pub fn write_u16(&mut self, lin: usize, value: u16) {
        let [lo, hi] = value.to_le_bytes();
        self.write_u8(lin, lo);
        self.write_u8(lin.wrapping_add(1), hi);
    }

    /// Load a contiguous image at the given linear address. Truncates if
    /// the slice would overflow the 1 MiB space (rather than wrapping —
    /// real loaders should not depend on wrap behavior).
    pub fn load(&mut self, lin: usize, image: &[u8]) {
        let start = lin & (MEM_SIZE - 1);
        let end = (start + image.len()).min(MEM_SIZE);
        let n = end - start;
        self.bytes[start..end].copy_from_slice(&image[..n]);
    }

    #[must_use]
    pub fn slice(&self, lin: usize, len: usize) -> &[u8] {
        let start = lin & (MEM_SIZE - 1);
        let end = (start + len).min(MEM_SIZE);
        &self.bytes[start..end]
    }
}

impl core::fmt::Debug for Memory {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Memory").field("size", &MEM_SIZE).finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seg_off_basic() {
        assert_eq!(seg_off(0, 0), 0);
        assert_eq!(seg_off(0x0010, 0x0000), 0x100);
        assert_eq!(seg_off(0x1234, 0x5678), 0x179B8);
    }

    #[test]
    fn seg_off_wrap_at_1mib() {
        // 0xFFFF:0x0010 = 0xFFFF0 + 0x10 = 0x100000 → wraps to 0x00000
        assert_eq!(seg_off(0xFFFF, 0x0010), 0x00000);
    }

    #[test]
    fn read_write_u8() {
        let mut m = Memory::new();
        assert_eq!(m.read_u8(0x100), 0);
        m.write_u8(0x100, 0xAB);
        assert_eq!(m.read_u8(0x100), 0xAB);
    }

    #[test]
    fn read_write_u16_little_endian() {
        let mut m = Memory::new();
        m.write_u16(0x200, 0xABCD);
        assert_eq!(m.read_u8(0x200), 0xCD);
        assert_eq!(m.read_u8(0x201), 0xAB);
        assert_eq!(m.read_u16(0x200), 0xABCD);
    }

    #[test]
    fn load_image() {
        let mut m = Memory::new();
        m.load(0x500, &[1, 2, 3, 4, 5]);
        assert_eq!(m.slice(0x500, 5), &[1, 2, 3, 4, 5]);
    }
}
