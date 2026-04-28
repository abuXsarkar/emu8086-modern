//! emu8086-devices
//!
//! Headless implementations of the virtual peripherals exposed via I/O ports.
//! Paired TS components live in `packages/devices/ts/`.
//!
//! M0 status: skeleton only. First device set lands in M4.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]

/// Trait every virtual peripheral implements.
pub trait Device {
    fn name(&self) -> &'static str;
    fn read(&mut self, port: u16) -> u8;
    fn write(&mut self, port: u16, value: u8);
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Stub;

    impl Device for Stub {
        fn name(&self) -> &'static str {
            "stub"
        }
        fn read(&mut self, _port: u16) -> u8 {
            0
        }
        fn write(&mut self, _port: u16, _value: u8) {}
    }

    #[test]
    fn stub_device_implements_trait() {
        let mut d = Stub;
        assert_eq!(d.name(), "stub");
        d.write(4, 0xFF);
        assert_eq!(d.read(4), 0);
    }
}
