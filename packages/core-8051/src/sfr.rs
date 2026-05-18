//! Special Function Register addresses.
//!
//! The 8051 maps SFRs into the IDATA 0x80–0xFF range when accessed
//! by *direct* addressing, while indirect addressing (`@Ri`) hits the
//! upper 128 bytes of internal RAM (a separate address space on
//! 8051-family parts that have it — the base 8051 has only the SFR
//! aliasing in that range).
//!
//! This module is just the constants. The executor uses them when
//! decoding direct-mode operand bytes and when computing
//! bit-addressable bit→byte mappings.

/// Special function register address.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SfrAddr(pub u8);

// Standard 8051 SFR map (the base set; extended SFRs on derivatives
// live higher and are out of scope for v0.1).
pub const P0: SfrAddr = SfrAddr(0x80);
pub const SP: SfrAddr = SfrAddr(0x81);
pub const DPL: SfrAddr = SfrAddr(0x82);
pub const DPH: SfrAddr = SfrAddr(0x83);
pub const PCON: SfrAddr = SfrAddr(0x87);
pub const TCON: SfrAddr = SfrAddr(0x88);
pub const TMOD: SfrAddr = SfrAddr(0x89);
pub const TL0: SfrAddr = SfrAddr(0x8A);
pub const TL1: SfrAddr = SfrAddr(0x8B);
pub const TH0: SfrAddr = SfrAddr(0x8C);
pub const TH1: SfrAddr = SfrAddr(0x8D);
pub const P1: SfrAddr = SfrAddr(0x90);
pub const SCON: SfrAddr = SfrAddr(0x98);
pub const SBUF: SfrAddr = SfrAddr(0x99);
pub const P2: SfrAddr = SfrAddr(0xA0);
pub const IE: SfrAddr = SfrAddr(0xA8);
pub const P3: SfrAddr = SfrAddr(0xB0);
pub const IP: SfrAddr = SfrAddr(0xB8);
pub const PSW: SfrAddr = SfrAddr(0xD0);
pub const ACC: SfrAddr = SfrAddr(0xE0);
pub const B: SfrAddr = SfrAddr(0xF0);

// ── Bit positions within multi-flag SFRs ─────────────────────────
//
// IE (0xA8) — interrupt enables. Bit 7 is the master enable (EA);
// the per-source bits gate individual interrupts.
pub const IE_EX0: u8 = 0x01; // ext int 0
pub const IE_ET0: u8 = 0x02; // timer 0 overflow
pub const IE_EX1: u8 = 0x04; // ext int 1
pub const IE_ET1: u8 = 0x08; // timer 1 overflow
pub const IE_ES: u8 = 0x10; // serial port (TI or RI)
pub const IE_EA: u8 = 0x80; // master enable

// TCON (0x88) — timer / external interrupt control. We respect TR0/TR1
// for timer run, and TF0/TF1 are set by the executor on overflow.
pub const TCON_IT0: u8 = 0x01;
pub const TCON_IE0: u8 = 0x02;
pub const TCON_IT1: u8 = 0x04;
pub const TCON_IE1: u8 = 0x08;
pub const TCON_TR0: u8 = 0x10;
pub const TCON_TF0: u8 = 0x20;
pub const TCON_TR1: u8 = 0x40;
pub const TCON_TF1: u8 = 0x80;

// SCON (0x98) — serial port control. TI/RI are the transmit/receive
// "byte complete" flags the program polls or interrupts on.
pub const SCON_RI: u8 = 0x01;
pub const SCON_TI: u8 = 0x02;

// Interrupt vectors (CODE address jumped to when an interrupt fires).
pub const VEC_INT0: u16 = 0x0003;
pub const VEC_TIMER0: u16 = 0x000B;
pub const VEC_INT1: u16 = 0x0013;
pub const VEC_TIMER1: u16 = 0x001B;
pub const VEC_SERIAL: u16 = 0x0023;

/// Bit-addressable bit → (byte address, bit index within the byte).
/// 8051 maps bit addresses 0x00..0x7F into bytes 0x20..0x2F (regular
/// IDATA), and 0x80..0xFF into the bit-addressable subset of the SFR
/// area (only SFRs whose address is divisible by 8 are bit-addressable).
#[must_use]
pub fn bit_to_byte(bit: u8) -> (u8, u8) {
    if bit < 0x80 {
        (0x20 + (bit / 8), bit % 8)
    } else {
        // SFR bit-addressable region: every 8th byte from 0x80.
        let base = 0x80 + ((bit - 0x80) & 0xF8);
        (base, bit % 8)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lower_bit_region_maps_to_bytes_20_2f() {
        // Bit 0x00 = bit 0 of byte 0x20.
        assert_eq!(bit_to_byte(0x00), (0x20, 0));
        // Bit 0x07 = bit 7 of byte 0x20.
        assert_eq!(bit_to_byte(0x07), (0x20, 7));
        // Bit 0x08 = bit 0 of byte 0x21.
        assert_eq!(bit_to_byte(0x08), (0x21, 0));
        // Bit 0x7F = bit 7 of byte 0x2F.
        assert_eq!(bit_to_byte(0x7F), (0x2F, 7));
    }

    #[test]
    fn sfr_bit_region_lands_on_aligned_addresses() {
        // P1.0 is bit 0x90, which lives at SFR 0x90 (P1) bit 0.
        assert_eq!(bit_to_byte(0x90), (0x90, 0));
        // PSW.7 (CY) is bit 0xD7.
        assert_eq!(bit_to_byte(0xD7), (0xD0, 7));
        // ACC.0 is bit 0xE0.
        assert_eq!(bit_to_byte(0xE0), (0xE0, 0));
    }
}
