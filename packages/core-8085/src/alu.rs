//! ALU helpers — flag computation for the 8085.
//!
//! The 8085 flag register layout (bit 7 → bit 0):
//!   S  Z  0  AC 0  P  1  CY
//!
//! Several existing 8085 simulators get these wrong — most commonly:
//! - ADC/SBB don't propagate the incoming carry into the result *and*
//!   the AC flag (GNUSim8085 #71, sim8085 #44).
//! - DAA misses setting CY when the high nibble carries out
//!   (Phoxis review, sim8085 #18/#57).
//! - DAD mutates flags other than CY (sim8085 #45 — only CY may change).
//! - DCR after 80H computes the wrong sign/AC pair (GNUSim8085 #46).
//!
//! This module is the single source of truth for the bit-exact
//! semantics. Every executor instruction calls one of these helpers
//! rather than reimplementing flag logic inline.

use crate::cpu::Flags;

/// Update S, Z, P from an 8-bit result. AC and CY are left untouched —
/// callers set those as the instruction demands.
pub fn update_szp(flags: &mut Flags, result: u8) {
    flags.s = (result & 0x80) != 0;
    flags.z = result == 0;
    flags.p = parity_even(result);
}

/// Even-parity flag: true iff the count of set bits in `value` is even.
#[must_use]
pub fn parity_even(value: u8) -> bool {
    value.count_ones() % 2 == 0
}

/// Add two bytes plus a carry-in; return the 8-bit result and set
/// S, Z, AC, P, CY on the flag register.
pub fn add8(flags: &mut Flags, a: u8, b: u8, cy_in: bool) -> u8 {
    let cy = u16::from(cy_in);
    let wide = u16::from(a) + u16::from(b) + cy;
    let result = wide as u8;

    flags.cy = wide > 0xFF;
    // AC = carry-out from bit 3 into bit 4 of the nibble-wise sum.
    flags.ac = ((a & 0x0F) + (b & 0x0F) + cy as u8) > 0x0F;
    update_szp(flags, result);
    result
}

/// Subtract `b` (plus borrow-in) from `a`; return the 8-bit result and
/// set S, Z, AC, P, CY on the flag register.
///
/// The 8085 sets CY when a borrow is required (a < b + bin), matching
/// the natural "did the subtraction underflow?" interpretation. AC is
/// set when bit 4 must be borrowed from to compute the low nibble.
pub fn sub8(flags: &mut Flags, a: u8, b: u8, borrow_in: bool) -> u8 {
    let bin = u16::from(borrow_in);
    let wide = u16::from(a).wrapping_sub(u16::from(b)).wrapping_sub(bin);
    let result = wide as u8;

    flags.cy = (u16::from(a)) < (u16::from(b) + bin);
    // AC = borrow from bit 4 to bit 3 — i.e. low-nibble subtraction
    // underflows.
    flags.ac = (a & 0x0F) < ((b & 0x0F) + bin as u8);
    update_szp(flags, result);
    result
}

/// Increment by 1. CY is **not** affected on the 8085 (unlike INX which
/// touches no flags at all); S, Z, AC, P are.
pub fn inr(flags: &mut Flags, a: u8) -> u8 {
    let result = a.wrapping_add(1);
    flags.ac = (a & 0x0F) + 1 > 0x0F;
    update_szp(flags, result);
    result
}

/// Decrement by 1. CY is not affected; S, Z, AC, P are. The AC bit
/// here is the borrow-from-bit-4, which matches every Intel 8080/8085
/// data sheet and rules out the DCR-after-80H bug.
pub fn dcr(flags: &mut Flags, a: u8) -> u8 {
    let result = a.wrapping_sub(1);
    flags.ac = (a & 0x0F) == 0; // low nibble was 0 → borrow needed
    update_szp(flags, result);
    result
}

/// Logical AND. S/Z/P from the result; AC is set on 8085 (this is one
/// of the 8085 differences vs the 8080 — Intel data sheet states ANA
/// sets AC), CY is cleared.
pub fn ana(flags: &mut Flags, a: u8, b: u8) -> u8 {
    let result = a & b;
    flags.cy = false;
    flags.ac = ((a | b) & 0x08) != 0; // documented 8085 behavior
    update_szp(flags, result);
    result
}

/// Logical OR. CY cleared, AC cleared on the 8085.
pub fn ora(flags: &mut Flags, a: u8, b: u8) -> u8 {
    let result = a | b;
    flags.cy = false;
    flags.ac = false;
    update_szp(flags, result);
    result
}

/// Logical XOR. CY cleared, AC cleared.
pub fn xra(flags: &mut Flags, a: u8, b: u8) -> u8 {
    let result = a ^ b;
    flags.cy = false;
    flags.ac = false;
    update_szp(flags, result);
    result
}

/// `CMP` is `A - B` with flags set but the result discarded.
pub fn cmp(flags: &mut Flags, a: u8, b: u8) {
    let _ = sub8(flags, a, b, false);
}

/// Add two 16-bit values (DAD). **Only CY is affected.** Existing
/// simulators that mutate S/Z/AC/P here (sim8085 #45) are wrong.
pub fn dad(flags: &mut Flags, hl: u16, addend: u16) -> u16 {
    let wide = u32::from(hl) + u32::from(addend);
    flags.cy = wide > 0xFFFF;
    wide as u16
}

/// Decimal-adjust the accumulator following an add or subtract of BCD
/// values. Bit-exact per the Intel 8080/8085 Programming Manual.
///
/// Algorithm:
/// 1. If low nibble > 9 OR AC is set, add 06H (set AC if this causes a
///    carry-out of bit 3).
/// 2. If high nibble > 9 OR CY is set, add 60H (set CY if this causes
///    a carry-out of bit 7).
///
/// The Phoxis review of GNUSim8085 v1.3.5 documented a regression where
/// step 2 failed to set CY — we test for that exactly in
/// `daa_99_plus_01_sets_carry`.
pub fn daa(flags: &mut Flags, a: u8) -> u8 {
    let mut result = a;
    let mut new_cy = flags.cy;
    let mut new_ac = flags.ac;

    if (result & 0x0F) > 9 || flags.ac {
        let low_add = 0x06u8;
        // AC after low-nibble add
        new_ac = (result & 0x0F) + low_add > 0x0F;
        result = result.wrapping_add(low_add);
    }

    if (result & 0xF0) > 0x90 || flags.cy {
        let (sum, cout) = result.overflowing_add(0x60);
        result = sum;
        new_cy = new_cy || cout;
    }

    flags.cy = new_cy;
    flags.ac = new_ac;
    update_szp(flags, result);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f() -> Flags {
        Flags::default()
    }

    #[test]
    fn parity_examples() {
        // 0b1010_1010 = 4 set bits → even
        assert!(parity_even(0xAA));
        // 0b1010_1011 = 5 set bits → odd
        assert!(!parity_even(0xAB));
        // zero → 0 set bits → even
        assert!(parity_even(0x00));
    }

    #[test]
    fn add_with_carry_in() {
        let mut flags = f();
        flags.cy = true;
        let cy = flags.cy;
        let r = add8(&mut flags, 0x40, 0x30, cy);
        assert_eq!(r, 0x71);
        assert!(!flags.cy);
    }

    #[test]
    fn add_overflow_sets_cy() {
        let mut flags = f();
        let r = add8(&mut flags, 0xFF, 0x01, false);
        assert_eq!(r, 0x00);
        assert!(flags.cy);
        assert!(flags.z);
    }

    #[test]
    fn add_sets_ac_on_low_nibble_overflow() {
        let mut flags = f();
        add8(&mut flags, 0x0F, 0x01, false);
        assert!(flags.ac);
    }

    /// Regression for GNUSim8085 #71: ADC must propagate the carry-in
    /// into both the result and the resulting CY.
    #[test]
    fn adc_propagates_carry_into_result_and_flag() {
        let mut flags = f();
        flags.cy = true;
        let cy = flags.cy;
        let r = add8(&mut flags, 0xFF, 0x00, cy);
        assert_eq!(r, 0x00, "0xFF + 0 + CY should wrap to 0x00");
        assert!(flags.cy, "carry-out should be set");
    }

    /// Regression for GNUSim8085 #46: DCR of 0x80 should produce 0x7F
    /// with sign=false and AC=true (borrow from bit 4). Parity of 0x7F
    /// is 7 bits set → odd → P=false.
    #[test]
    fn dcr_at_80h_sets_correct_flags() {
        let mut flags = f();
        let r = dcr(&mut flags, 0x80);
        assert_eq!(r, 0x7F);
        assert!(!flags.s);
        assert!(!flags.z);
        assert!(flags.ac);
        assert!(!flags.p);
    }

    /// Regression for sim8085 #44: SBB must set AC when the
    /// low-nibble subtraction underflows (with the borrow-in counted).
    #[test]
    fn sbb_sets_ac_when_low_nibble_underflows() {
        let mut flags = f();
        flags.cy = true;
        let cy = flags.cy;
        let r = sub8(&mut flags, 0x10, 0x00, cy);
        assert_eq!(r, 0x0F);
        assert!(flags.ac, "low-nibble underflow with borrow-in should set AC");
    }

    /// Regression for sim8085 #45: DAD must touch only CY — never S/Z/AC/P.
    #[test]
    fn dad_touches_only_cy() {
        let mut flags = Flags { s: true, z: true, ac: true, p: true, cy: false };
        let r = dad(&mut flags, 0x8000, 0x8000);
        assert_eq!(r, 0x0000);
        assert!(flags.cy, "carry-out should be set");
        // every other flag must be preserved
        assert!(flags.s);
        assert!(flags.z);
        assert!(flags.ac);
        assert!(flags.p);
    }

    /// Regression for Phoxis review + sim8085 #18/#57: DAA after
    /// 99H + 01H must produce A=00 with CY=1.
    #[test]
    fn daa_99_plus_01_sets_carry() {
        let mut flags = f();
        // simulate: A=99H, plain add 01H → A=9AH, flags from add8
        let after_add = add8(&mut flags, 0x99, 0x01, false);
        assert_eq!(after_add, 0x9A);
        // now DAA on 0x9A with current flags
        let r = daa(&mut flags, after_add);
        assert_eq!(r, 0x00);
        assert!(flags.cy, "DAA must set CY when high-nibble adjust carries out");
        assert!(flags.z);
    }

    #[test]
    fn cmp_equal_sets_z_clears_cy() {
        let mut flags = f();
        cmp(&mut flags, 0x42, 0x42);
        assert!(flags.z);
        assert!(!flags.cy);
    }

    #[test]
    fn cmp_a_less_than_b_sets_cy() {
        let mut flags = f();
        cmp(&mut flags, 0x10, 0x20);
        assert!(!flags.z);
        assert!(flags.cy);
    }
}
