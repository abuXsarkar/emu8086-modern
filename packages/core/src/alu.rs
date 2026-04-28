//! Pure flag-aware ALU primitives. These are isolated from the CPU loop
//! so flag corner cases can be unit-tested without booting the emulator.
//!
//! All public functions return `(result, Flags)` so the executor can write
//! the result and flags atomically.
//!
//! Flag conventions (8086):
//! - CF: carry/borrow out of the MSB.
//! - OF: signed overflow — set when the sign of `result` is unexpected
//!       given the sign of the inputs (different rule for ADD vs SUB).
//! - ZF: result == 0.
//! - SF: result MSB.
//! - PF: even parity of the low 8 bits of the result (1 = even).
//! - AF: carry/borrow between bit 3 and bit 4 (BCD-relevant).
//!
//! For logical (AND/OR/XOR/TEST): CF = 0, OF = 0, AF undefined (we clear).

use crate::Flags;

pub(crate) const fn parity_byte(b: u8) -> bool {
    let mut x = b;
    x ^= x >> 4;
    x ^= x >> 2;
    x ^= x >> 1;
    (x & 1) == 0
}

fn flags_szp_u8(result: u8) -> Flags {
    let mut f = Flags::default();
    f.set(Flags::ZF, result == 0);
    f.set(Flags::SF, (result & 0x80) != 0);
    f.set(Flags::PF, parity_byte(result));
    f
}

fn flags_szp_u16(result: u16) -> Flags {
    let mut f = Flags::default();
    f.set(Flags::ZF, result == 0);
    f.set(Flags::SF, (result & 0x8000) != 0);
    f.set(Flags::PF, parity_byte(result as u8));
    f
}

#[must_use]
pub fn add8(a: u8, b: u8, cf_in: bool) -> (u8, Flags) {
    let cin = u16::from(cf_in);
    let sum = u16::from(a) + u16::from(b) + cin;
    let result = sum as u8;
    let mut f = flags_szp_u8(result);
    f.set(Flags::CF, sum > 0xFF);
    f.set(Flags::AF, (((a ^ b) ^ result) & 0x10) != 0);
    f.set(Flags::OF, ((a ^ result) & (b ^ result) & 0x80) != 0);
    (result, f)
}

#[must_use]
pub fn add16(a: u16, b: u16, cf_in: bool) -> (u16, Flags) {
    let cin = u32::from(cf_in);
    let sum = u32::from(a) + u32::from(b) + cin;
    let result = sum as u16;
    let mut f = flags_szp_u16(result);
    f.set(Flags::CF, sum > 0xFFFF);
    f.set(Flags::AF, (((a ^ b) ^ result) & 0x10) != 0);
    f.set(Flags::OF, ((a ^ result) & (b ^ result) & 0x8000) != 0);
    (result, f)
}

#[must_use]
pub fn sub8(a: u8, b: u8, cf_in: bool) -> (u8, Flags) {
    let cin = u16::from(cf_in);
    // a - b - cin, computed in 16 bits to extract borrow.
    let diff = (u16::from(a)).wrapping_sub(u16::from(b)).wrapping_sub(cin);
    let result = diff as u8;
    let mut f = flags_szp_u8(result);
    // CF is set when there was a borrow out of the high bit, i.e. when
    // a < b + cin in unsigned arithmetic.
    f.set(Flags::CF, u16::from(a) < u16::from(b) + cin);
    f.set(Flags::AF, (((a ^ b) ^ result) & 0x10) != 0);
    f.set(Flags::OF, ((a ^ b) & (a ^ result) & 0x80) != 0);
    (result, f)
}

#[must_use]
pub fn sub16(a: u16, b: u16, cf_in: bool) -> (u16, Flags) {
    let cin = u32::from(cf_in);
    let diff = (u32::from(a)).wrapping_sub(u32::from(b)).wrapping_sub(cin);
    let result = diff as u16;
    let mut f = flags_szp_u16(result);
    f.set(Flags::CF, u32::from(a) < u32::from(b) + cin);
    f.set(Flags::AF, (((a ^ b) ^ result) & 0x10) != 0);
    f.set(Flags::OF, ((a ^ b) & (a ^ result) & 0x8000) != 0);
    (result, f)
}

#[must_use]
pub fn and8(a: u8, b: u8) -> (u8, Flags) {
    let result = a & b;
    let mut f = flags_szp_u8(result);
    f.set(Flags::CF, false);
    f.set(Flags::OF, false);
    f.set(Flags::AF, false);
    (result, f)
}

#[must_use]
pub fn and16(a: u16, b: u16) -> (u16, Flags) {
    let result = a & b;
    let mut f = flags_szp_u16(result);
    f.set(Flags::CF, false);
    f.set(Flags::OF, false);
    f.set(Flags::AF, false);
    (result, f)
}

#[must_use]
pub fn or8(a: u8, b: u8) -> (u8, Flags) {
    let result = a | b;
    let mut f = flags_szp_u8(result);
    f.set(Flags::CF, false);
    f.set(Flags::OF, false);
    f.set(Flags::AF, false);
    (result, f)
}

#[must_use]
pub fn or16(a: u16, b: u16) -> (u16, Flags) {
    let result = a | b;
    let mut f = flags_szp_u16(result);
    f.set(Flags::CF, false);
    f.set(Flags::OF, false);
    f.set(Flags::AF, false);
    (result, f)
}

#[must_use]
pub fn xor8(a: u8, b: u8) -> (u8, Flags) {
    let result = a ^ b;
    let mut f = flags_szp_u8(result);
    f.set(Flags::CF, false);
    f.set(Flags::OF, false);
    f.set(Flags::AF, false);
    (result, f)
}

#[must_use]
pub fn xor16(a: u16, b: u16) -> (u16, Flags) {
    let result = a ^ b;
    let mut f = flags_szp_u16(result);
    f.set(Flags::CF, false);
    f.set(Flags::OF, false);
    f.set(Flags::AF, false);
    (result, f)
}

/// INC: identical to ADD x, 1 except CF is preserved.
#[must_use]
pub fn inc8(a: u8, cf_preserved: bool) -> (u8, Flags) {
    let (result, mut f) = add8(a, 1, false);
    f.set(Flags::CF, cf_preserved);
    (result, f)
}

#[must_use]
pub fn inc16(a: u16, cf_preserved: bool) -> (u16, Flags) {
    let (result, mut f) = add16(a, 1, false);
    f.set(Flags::CF, cf_preserved);
    (result, f)
}

/// DEC: identical to SUB x, 1 except CF is preserved.
#[must_use]
pub fn dec8(a: u8, cf_preserved: bool) -> (u8, Flags) {
    let (result, mut f) = sub8(a, 1, false);
    f.set(Flags::CF, cf_preserved);
    (result, f)
}

#[must_use]
pub fn dec16(a: u16, cf_preserved: bool) -> (u16, Flags) {
    let (result, mut f) = sub16(a, 1, false);
    f.set(Flags::CF, cf_preserved);
    (result, f)
}

/// NEG: 0 - operand. CF is set unless operand is zero (matches the
/// 8086 manual definition).
#[must_use]
pub fn neg8(a: u8) -> (u8, Flags) {
    let (result, mut f) = sub8(0, a, false);
    f.set(Flags::CF, a != 0);
    (result, f)
}

#[must_use]
pub fn neg16(a: u16) -> (u16, Flags) {
    let (result, mut f) = sub16(0, a, false);
    f.set(Flags::CF, a != 0);
    (result, f)
}

/// NOT: bitwise complement; no flags affected, but caller still receives
/// the unchanged flags so the call site stays uniform.
#[must_use]
pub fn not8(a: u8) -> u8 {
    !a
}

#[must_use]
pub fn not16(a: u16) -> u16 {
    !a
}

// ---- shifts and rotates ----
//
// 8086 conventions for these eight ops are subtle. The count comes from
// either the literal `1` (D0/D1) or CL (D2/D3) and is *not* masked on
// 8086 (later 80186+ mask to 0x1F). Flag rules:
//
//   SHL/SAL/SHR/SAR set CF to the last bit shifted out and update SF/ZF/PF
//     from the result. AF is undefined; we leave it alone.
//   ROL/ROR set CF to the bit that wrapped. They do NOT modify SF/ZF/PF.
//   RCL/RCR rotate through CF: CF goes in on one end and the bit shifted
//     out comes back to CF. They do NOT modify SF/ZF/PF either.
//
// OF is only meaningful for count==1 on 8086:
//   SHL: OF = MSB(result) XOR new CF
//   SHR: OF = MSB(original)  (i.e. did the high bit change?)
//   SAR: OF = 0
//   ROL: OF = MSB(result) XOR new CF
//   ROR: OF = bit (n-1) of result XOR bit (n-2)   (top two bits differ)
//   RCL: OF = MSB(result) XOR new CF
//   RCR: OF = MSB(result) XOR bit-just-below-MSB
// For count != 1 the manual says OF is undefined; we leave it untouched.

fn flags_szp_after_shift_u8(prev: Flags, result: u8, cf: bool) -> Flags {
    let mut f = flags_szp_u8(result);
    f.set(Flags::CF, cf);
    // AF undefined — preserve previous value.
    f.set(Flags::AF, prev.get(Flags::AF));
    f
}

fn flags_szp_after_shift_u16(prev: Flags, result: u16, cf: bool) -> Flags {
    let mut f = flags_szp_u16(result);
    f.set(Flags::CF, cf);
    f.set(Flags::AF, prev.get(Flags::AF));
    f
}

#[must_use]
pub fn shl8(value: u8, count: u8, prev: Flags) -> (u8, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        cf = (result & 0x80) != 0;
        result <<= 1;
    }
    let mut f = flags_szp_after_shift_u8(prev, result, cf);
    if count == 1 {
        // OF = MSB(result) XOR new CF.
        let of = ((result & 0x80) != 0) ^ cf;
        f.set(Flags::OF, of);
    } else {
        f.set(Flags::OF, prev.get(Flags::OF));
    }
    (result, f)
}

#[must_use]
pub fn shl16(value: u16, count: u8, prev: Flags) -> (u16, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        cf = (result & 0x8000) != 0;
        result <<= 1;
    }
    let mut f = flags_szp_after_shift_u16(prev, result, cf);
    if count == 1 {
        let of = ((result & 0x8000) != 0) ^ cf;
        f.set(Flags::OF, of);
    } else {
        f.set(Flags::OF, prev.get(Flags::OF));
    }
    (result, f)
}

#[must_use]
pub fn shr8(value: u8, count: u8, prev: Flags) -> (u8, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        cf = (result & 0x01) != 0;
        result >>= 1;
    }
    let mut f = flags_szp_after_shift_u8(prev, result, cf);
    if count == 1 {
        // OF = original MSB (i.e. the bit that disappeared on the first shift).
        f.set(Flags::OF, (value & 0x80) != 0);
    } else {
        f.set(Flags::OF, prev.get(Flags::OF));
    }
    (result, f)
}

#[must_use]
pub fn shr16(value: u16, count: u8, prev: Flags) -> (u16, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        cf = (result & 0x0001) != 0;
        result >>= 1;
    }
    let mut f = flags_szp_after_shift_u16(prev, result, cf);
    if count == 1 {
        f.set(Flags::OF, (value & 0x8000) != 0);
    } else {
        f.set(Flags::OF, prev.get(Flags::OF));
    }
    (result, f)
}

#[must_use]
pub fn sar8(value: u8, count: u8, prev: Flags) -> (u8, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value as i8;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        cf = (result & 0x01) != 0;
        result >>= 1; // arithmetic shift — sign-preserving on i8
    }
    let result = result as u8;
    let mut f = flags_szp_after_shift_u8(prev, result, cf);
    if count == 1 {
        f.set(Flags::OF, false);
    } else {
        f.set(Flags::OF, prev.get(Flags::OF));
    }
    (result, f)
}

#[must_use]
pub fn sar16(value: u16, count: u8, prev: Flags) -> (u16, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value as i16;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        cf = (result & 0x0001) != 0;
        result >>= 1;
    }
    let result = result as u16;
    let mut f = flags_szp_after_shift_u16(prev, result, cf);
    if count == 1 {
        f.set(Flags::OF, false);
    } else {
        f.set(Flags::OF, prev.get(Flags::OF));
    }
    (result, f)
}

#[must_use]
pub fn rol8(value: u8, count: u8, prev: Flags) -> (u8, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let result = value.rotate_left(u32::from(count % 8));
    let cf = (result & 0x01) != 0;
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        let of = ((result & 0x80) != 0) ^ cf;
        f.set(Flags::OF, of);
    }
    (result, f)
}

#[must_use]
pub fn rol16(value: u16, count: u8, prev: Flags) -> (u16, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let result = value.rotate_left(u32::from(count % 16));
    let cf = (result & 0x0001) != 0;
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        let of = ((result & 0x8000) != 0) ^ cf;
        f.set(Flags::OF, of);
    }
    (result, f)
}

#[must_use]
pub fn ror8(value: u8, count: u8, prev: Flags) -> (u8, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let result = value.rotate_right(u32::from(count % 8));
    let cf = (result & 0x80) != 0;
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        // OF = top two bits differ.
        let top = (result >> 7) & 1;
        let nxt = (result >> 6) & 1;
        f.set(Flags::OF, top != nxt);
    }
    (result, f)
}

#[must_use]
pub fn ror16(value: u16, count: u8, prev: Flags) -> (u16, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let result = value.rotate_right(u32::from(count % 16));
    let cf = (result & 0x8000) != 0;
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        let top = (result >> 15) & 1;
        let nxt = (result >> 14) & 1;
        f.set(Flags::OF, top != nxt);
    }
    (result, f)
}

#[must_use]
pub fn rcl8(value: u8, count: u8, prev: Flags) -> (u8, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        let new_cf = (result & 0x80) != 0;
        result = (result << 1) | u8::from(cf);
        cf = new_cf;
    }
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        let of = ((result & 0x80) != 0) ^ cf;
        f.set(Flags::OF, of);
    }
    (result, f)
}

#[must_use]
pub fn rcl16(value: u16, count: u8, prev: Flags) -> (u16, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        let new_cf = (result & 0x8000) != 0;
        result = (result << 1) | u16::from(cf);
        cf = new_cf;
    }
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        let of = ((result & 0x8000) != 0) ^ cf;
        f.set(Flags::OF, of);
    }
    (result, f)
}

#[must_use]
pub fn rcr8(value: u8, count: u8, prev: Flags) -> (u8, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        let new_cf = (result & 0x01) != 0;
        result = (result >> 1) | (u8::from(cf) << 7);
        cf = new_cf;
    }
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        // OF = MSB(result) XOR bit-6(result)
        let top = (result >> 7) & 1;
        let nxt = (result >> 6) & 1;
        f.set(Flags::OF, top != nxt);
    }
    (result, f)
}

#[must_use]
pub fn rcr16(value: u16, count: u8, prev: Flags) -> (u16, Flags) {
    if count == 0 {
        return (value, prev);
    }
    let mut result = value;
    let mut cf = prev.get(Flags::CF);
    for _ in 0..count {
        let new_cf = (result & 0x0001) != 0;
        result = (result >> 1) | (u16::from(cf) << 15);
        cf = new_cf;
    }
    let mut f = prev;
    f.set(Flags::CF, cf);
    if count == 1 {
        let top = (result >> 15) & 1;
        let nxt = (result >> 14) & 1;
        f.set(Flags::OF, top != nxt);
    }
    (result, f)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flag_str(f: Flags) -> String {
        let mut s = String::new();
        for &(name, mask) in &[
            ("CF", Flags::CF),
            ("PF", Flags::PF),
            ("AF", Flags::AF),
            ("ZF", Flags::ZF),
            ("SF", Flags::SF),
            ("OF", Flags::OF),
        ] {
            if f.get(mask) {
                s.push_str(name);
                s.push(' ');
            }
        }
        s.trim().to_string()
    }

    #[test]
    fn add8_basic() {
        let (r, f) = add8(0x10, 0x20, false);
        assert_eq!(r, 0x30);
        // 0x30 has 2 set bits → even parity → PF=1. No other flags.
        assert_eq!(flag_str(f), "PF");
    }

    #[test]
    fn add8_zero_result_sets_zf_pf() {
        let (r, f) = add8(0xFF, 0x01, false);
        assert_eq!(r, 0);
        assert!(f.get(Flags::ZF));
        assert!(f.get(Flags::CF));
        assert!(f.get(Flags::PF));
        assert!(f.get(Flags::AF));
        assert!(!f.get(Flags::SF));
    }

    #[test]
    fn add8_signed_overflow_positive() {
        // 0x7F + 1 = 0x80 → OF set (signed overflow), SF set, no CF.
        let (r, f) = add8(0x7F, 0x01, false);
        assert_eq!(r, 0x80);
        assert!(f.get(Flags::OF));
        assert!(f.get(Flags::SF));
        assert!(!f.get(Flags::CF));
    }

    #[test]
    fn add8_signed_overflow_negative() {
        // 0x80 + 0x80 = 0x100 → wraps to 0, CF set, OF set (negative+negative=positive).
        let (r, f) = add8(0x80, 0x80, false);
        assert_eq!(r, 0);
        assert!(f.get(Flags::CF));
        assert!(f.get(Flags::OF));
        assert!(f.get(Flags::ZF));
    }

    #[test]
    fn sub8_borrow_sets_cf() {
        let (r, f) = sub8(0x00, 0x01, false);
        assert_eq!(r, 0xFF);
        assert!(f.get(Flags::CF));
        assert!(f.get(Flags::SF));
        assert!(f.get(Flags::AF));
    }

    #[test]
    fn sub8_signed_overflow() {
        // 0x80 - 1 = 0x7F: positive result from negative-minus-positive → OF.
        let (r, f) = sub8(0x80, 0x01, false);
        assert_eq!(r, 0x7F);
        assert!(f.get(Flags::OF));
        assert!(!f.get(Flags::SF));
    }

    #[test]
    fn add16_carry() {
        let (r, f) = add16(0xFFFF, 0x0001, false);
        assert_eq!(r, 0);
        assert!(f.get(Flags::CF));
        assert!(f.get(Flags::ZF));
    }

    #[test]
    fn adc_carries_input_flag() {
        // 0xFF + 0xFF + 1 = 0x1FF → 0xFF with CF.
        let (r, f) = add8(0xFF, 0xFF, true);
        assert_eq!(r, 0xFF);
        assert!(f.get(Flags::CF));
        assert!(!f.get(Flags::ZF));
        assert!(f.get(Flags::SF));
    }

    #[test]
    fn sbb_borrows_input_flag() {
        // 0x10 - 0x05 - 1 = 0x0A.
        let (r, f) = sub8(0x10, 0x05, true);
        assert_eq!(r, 0x0A);
        assert!(!f.get(Flags::CF));
    }

    #[test]
    fn logical_clears_cf_of() {
        let (_, f) = and8(0xF0, 0x0F);
        assert!(!f.get(Flags::CF));
        assert!(!f.get(Flags::OF));
        assert!(f.get(Flags::ZF));
        let (_, f) = or8(0xF0, 0x0F);
        assert!(!f.get(Flags::CF));
        assert!(!f.get(Flags::OF));
        let (_, f) = xor8(0xAA, 0xAA);
        assert!(f.get(Flags::ZF));
    }

    #[test]
    fn inc_preserves_cf() {
        // inc with CF=1 should still be CF=1 after.
        let (r, f) = inc8(0x10, true);
        assert_eq!(r, 0x11);
        assert!(f.get(Flags::CF));
        // inc with CF=0 stays 0.
        let (r, f) = inc8(0x10, false);
        assert_eq!(r, 0x11);
        assert!(!f.get(Flags::CF));
    }

    #[test]
    fn inc_signed_overflow_at_7f() {
        let (r, f) = inc8(0x7F, false);
        assert_eq!(r, 0x80);
        assert!(f.get(Flags::OF));
    }

    #[test]
    fn dec_preserves_cf() {
        let (r, f) = dec8(0x10, true);
        assert_eq!(r, 0x0F);
        assert!(f.get(Flags::CF));
    }

    #[test]
    fn neg_zero_clears_cf() {
        let (r, f) = neg8(0);
        assert_eq!(r, 0);
        assert!(!f.get(Flags::CF));
        assert!(f.get(Flags::ZF));
    }

    #[test]
    fn neg_nonzero_sets_cf() {
        let (r, f) = neg8(0x05);
        assert_eq!(r, 0xFB);
        assert!(f.get(Flags::CF));
        assert!(f.get(Flags::SF));
    }

    // ---- shifts and rotates ----

    #[test]
    fn shl_by_1_carries_top_bit() {
        let (r, f) = shl8(0x81, 1, Flags::default());
        assert_eq!(r, 0x02);
        assert!(f.get(Flags::CF));
        // OF = MSB(result) XOR new CF = 0 ^ 1 = 1
        assert!(f.get(Flags::OF));
    }

    #[test]
    fn shr_by_1_records_dropped_bit() {
        let (r, f) = shr8(0x03, 1, Flags::default());
        assert_eq!(r, 0x01);
        assert!(f.get(Flags::CF));
        assert!(!f.get(Flags::OF));
    }

    #[test]
    fn sar_preserves_sign() {
        let (r, f) = sar8(0x80, 1, Flags::default());
        assert_eq!(r, 0xC0);
        assert!(!f.get(Flags::CF));
        assert!(f.get(Flags::SF));
    }

    #[test]
    fn rol_by_1_round_trip() {
        let (r, f) = rol8(0x81, 1, Flags::default());
        assert_eq!(r, 0x03);
        assert!(f.get(Flags::CF)); // bottom bit (the wrapped 1) → CF
    }

    #[test]
    fn ror_by_1_round_trip() {
        let (r, f) = ror8(0x01, 1, Flags::default());
        assert_eq!(r, 0x80);
        assert!(f.get(Flags::CF));
    }

    #[test]
    fn rcl_chains_through_cf() {
        // value = 0x80, CF in = 0 → result top→CF=1, bottom takes old CF=0 → 0x00
        let mut prev = Flags::default();
        prev.set(Flags::CF, false);
        let (r, f) = rcl8(0x80, 1, prev);
        assert_eq!(r, 0x00);
        assert!(f.get(Flags::CF));
    }

    #[test]
    fn rcr_chains_through_cf() {
        // value = 0x01, CF in = 1 → bottom→CF=1, top takes old CF=1 → 0x80
        let mut prev = Flags::default();
        prev.set(Flags::CF, true);
        let (r, f) = rcr8(0x01, 1, prev);
        assert_eq!(r, 0x80);
        assert!(f.get(Flags::CF));
    }

    #[test]
    fn shift_by_zero_is_identity() {
        let (r, f) = shl8(0xAB, 0, Flags::default());
        assert_eq!(r, 0xAB);
        assert!(!f.get(Flags::CF));
    }

    #[test]
    fn parity_byte_works() {
        assert!(parity_byte(0x00)); // even (zero ones)
        assert!(parity_byte(0x03)); // even (two ones)
        assert!(!parity_byte(0x01)); // odd
        assert!(!parity_byte(0xFE)); // 7 ones → odd
        assert!(parity_byte(0xFF)); // 8 ones → even
    }
}
