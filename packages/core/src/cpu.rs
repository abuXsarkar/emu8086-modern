//! 8086 CPU loop. M1 slices 1-2: full register file + memory addressing,
//! the MOV family (including segment registers and `LEA`), single-byte
//! flag/halt/no-op opcodes. Arithmetic, logical, control flow, stack, and
//! string ops arrive in later slices.
//!
//! The decoder is intentionally table-light and explicit: each branch is
//! a self-contained read that pulls bytes through `fetch_*`, so we can
//! later snapshot every fetched byte for the trace log.

use std::collections::VecDeque;

use crate::alu;
use crate::alu::parity_byte;
use crate::mem::{seg_off, Memory};
use crate::{Flags, Registers};

/// PS/2-style keyboard data port. `IN AL, 0x60` pops one byte from the
/// pending-keystroke FIFO (returns 0 if empty).
pub const KEYBOARD_DATA_PORT: u16 = 0x60;
/// PS/2-style keyboard status port. `IN AL, 0x64` returns bit 0 = 1 when
/// a byte is waiting (so polling loops can avoid blocking reads).
pub const KEYBOARD_STATUS_PORT: u16 = 0x64;

/// 8086 8-bit register codes (REG field of mod-r/m, or low 3 bits of opcode).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reg8 {
    Al,
    Cl,
    Dl,
    Bl,
    Ah,
    Ch,
    Dh,
    Bh,
}

impl Reg8 {
    #[must_use]
    pub const fn from_code(code: u8) -> Self {
        match code & 0b111 {
            0 => Self::Al,
            1 => Self::Cl,
            2 => Self::Dl,
            3 => Self::Bl,
            4 => Self::Ah,
            5 => Self::Ch,
            6 => Self::Dh,
            _ => Self::Bh,
        }
    }
}

/// 8086 16-bit register codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reg16 {
    Ax,
    Cx,
    Dx,
    Bx,
    Sp,
    Bp,
    Si,
    Di,
}

impl Reg16 {
    #[must_use]
    pub const fn from_code(code: u8) -> Self {
        match code & 0b111 {
            0 => Self::Ax,
            1 => Self::Cx,
            2 => Self::Dx,
            3 => Self::Bx,
            4 => Self::Sp,
            5 => Self::Bp,
            6 => Self::Si,
            _ => Self::Di,
        }
    }
}

/// Segment register codes (3-bit; bit-2 ignored on 8086).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegReg {
    Es,
    Cs,
    Ss,
    Ds,
}

impl SegReg {
    #[must_use]
    pub const fn from_code(code: u8) -> Self {
        match code & 0b11 {
            0 => Self::Es,
            1 => Self::Cs,
            2 => Self::Ss,
            _ => Self::Ds,
        }
    }
}

/// Reason a `step()` returned without making progress past a normal advance.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum StopReason {
    /// HLT executed.
    Halted,
    /// Decoder hit an opcode that hasn't been implemented yet (M1 will whittle this down).
    Unimplemented { opcode: u8, ip: u16 },
    /// DIV/IDIV with a zero divisor or a quotient that doesn't fit. The
    /// 8086 raises INT 0; our diagnostic surface mirrors that.
    DivideError { ip: u16 },
}

/// What one `step` did. Rich enough for the IDE's diff highlighting.
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct StepRecord {
    pub bytes_consumed: u8,
    pub mnemonic: &'static str,
    pub stopped: Option<StopReason>,
}

/// The CPU state. Owns its registers and memory; borrows nothing.
#[derive(Debug, Clone)]
pub struct Cpu {
    pub regs: Registers,
    pub mem: Memory,
    pub halted: bool,
    /// Bytes the program has written to the DOS console via `INT 21h`.
    /// The IDE (or CLI) drains this to render output. We append rather
    /// than callback so the emulator stays pure and synchronous.
    pub stdout: Vec<u8>,
    /// DOS exit code from `INT 21h` AH=4Ch (or AH=00h legacy exit).
    pub exit_code: Option<u8>,
    /// 64 KiB port I/O space. The full ISA `IN` / `OUT` opcodes route
    /// here. Devices (M4) override individual ports through callbacks
    /// — until then this is a plain backing store, sufficient to build
    /// programs against and to record what they wrote.
    pub ports: Box<[u8]>,
    /// Append-only log of every `OUT` (port, value, width). Used by the
    /// virtual-device tests to assert "the program wrote X to port Y".
    pub out_log: Vec<PortWrite>,
    /// Per-step undo stack. Each entry captures everything we need to
    /// rewind one `step()`. Bounded by the caller (the IDE caps it at
    /// a configurable budget); when full we simply stop recording so
    /// step_back returns false past the recorded horizon.
    pub history: Vec<Snapshot>,
    /// Hard cap on history depth. Default 0 (recording disabled);
    /// raise via `set_history_capacity` from the host.
    pub history_capacity: usize,
    /// Pending keystrokes waiting to be consumed by `IN AL, 0x60` (or any
    /// of the BIOS/DOS keyboard interrupt subfunctions). The host pushes
    /// bytes via [`Cpu::push_key`]; the program drains them by polling.
    pub key_buffer: VecDeque<u8>,
    /// Bytes popped from `key_buffer` during the current step, in pop
    /// order. Captured into the snapshot on commit so `step_back` can
    /// re-prepend them, restoring the buffer exactly. Cleared at the
    /// start of every step.
    keys_popped_this_step: Vec<u8>,
    /// Virtual host clock — what `INT 21h` AH=2Ah (date) and AH=2Ch
    /// (time) report. The CPU never advances it on its own (real
    /// programs see no time pass between back-to-back instructions
    /// from the inside, and time-travel debugging needs the clock to
    /// be deterministic); the host refreshes it via `set_clock` if a
    /// real wall-clock value is wanted.
    pub clock: Clock,
}

/// State of the virtual host clock. Defaults to a fixed deterministic
/// epoch so unit tests don't depend on system time. The IDE host
/// pushes the real wall-clock time before each run so lab programs
/// that print "current time" show a sensible value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Clock {
    /// Year, 1980–2099 per the DOS calendar contract.
    pub year: u16,
    /// Month, 1–12.
    pub month: u8,
    /// Day, 1–31.
    pub day: u8,
    /// Day of week, 0=Sunday … 6=Saturday.
    pub day_of_week: u8,
    /// Hour, 0–23.
    pub hour: u8,
    /// Minute, 0–59.
    pub minute: u8,
    /// Second, 0–59.
    pub second: u8,
    /// Hundredths of a second, 0–99.
    pub hundredths: u8,
}

impl Default for Clock {
    fn default() -> Self {
        // 2024-01-01 12:00:00.00 — a fixed-point Monday so tests that
        // assert on the dow byte don't drift with real time.
        Self {
            year: 2024,
            month: 1,
            day: 1,
            day_of_week: 1,
            hour: 12,
            minute: 0,
            second: 0,
            hundredths: 0,
        }
    }
}

/// Per-step undo record. Storing only the *changes* (registers before
/// the step + memory writes the step performed + a few prefix lengths
/// of the side-effect logs) keeps the per-step memory cost in the tens
/// of bytes for typical programs, vs the megabytes a full state copy
/// would need.
#[derive(Debug, Clone)]
pub struct Snapshot {
    pub regs: Registers,
    pub halted: bool,
    pub exit_code: Option<u8>,
    pub mem_writes: Vec<(usize, u8)>,
    pub stdout_len: usize,
    pub out_log_len: usize,
    /// Bytes popped from `key_buffer` during this step, in pop order.
    /// `step_back` re-prepends them to the buffer so the next step can
    /// consume them again.
    pub keys_popped: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PortWrite {
    pub port: u16,
    pub value: u16,
    pub width: u8, // 8 or 16
}

impl Default for Cpu {
    fn default() -> Self {
        Self::new()
    }
}

/// Decoded mod-r/m memory operand: which segment register defaults apply
/// and what 16-bit offset to use within that segment.
#[derive(Debug, Clone, Copy)]
struct EffAddr {
    default_seg: SegReg,
    off: u16,
}

impl Cpu {
    #[must_use]
    pub fn new() -> Self {
        Self {
            regs: Registers::default(),
            mem: Memory::new(),
            halted: false,
            stdout: Vec::new(),
            exit_code: None,
            ports: vec![0u8; 0x10000].into_boxed_slice(),
            out_log: Vec::new(),
            history: Vec::new(),
            history_capacity: 0,
            key_buffer: VecDeque::new(),
            keys_popped_this_step: Vec::new(),
            clock: Clock::default(),
        }
    }

    /// Update the virtual host clock. Hosts (the IDE, the CLI) call
    /// this before a run if a lab program reads `INT 21h` AH=2Ah / 2Ch
    /// and the user expects to see real-world time. Tests can leave
    /// the clock at its default for deterministic output.
    pub fn set_clock(&mut self, c: Clock) {
        self.clock = c;
    }

    /// Enqueue one byte for the program to read via the keyboard port
    /// or BIOS/DOS keyboard service. Bytes are consumed in FIFO order.
    pub fn push_key(&mut self, byte: u8) {
        self.key_buffer.push_back(byte);
    }

    /// Pop the next pending keystroke, if any, recording the pop so
    /// `step_back` can restore it.
    fn pop_key(&mut self) -> Option<u8> {
        let b = self.key_buffer.pop_front()?;
        self.keys_popped_this_step.push(b);
        Some(b)
    }

    /// Enable per-step recording up to `cap` snapshots deep. Raising
    /// the cap doesn't backfill; lowering it truncates from the front
    /// (oldest first). Pass 0 to disable recording.
    pub fn set_history_capacity(&mut self, cap: usize) {
        self.history_capacity = cap;
        if self.history.len() > cap {
            let drop = self.history.len() - cap;
            self.history.drain(..drop);
        }
    }

    /// Drop one step from history.
    /// Returns true if there was something to undo. After step_back the
    /// CPU is exactly where it was just before the most recent step()
    /// — same registers, same memory, same stdout.
    pub fn step_back(&mut self) -> bool {
        let Some(snap) = self.history.pop() else {
            return false;
        };
        self.regs = snap.regs;
        self.halted = snap.halted;
        self.exit_code = snap.exit_code;
        self.mem.restore_writes(&snap.mem_writes);
        self.stdout.truncate(snap.stdout_len);
        self.out_log.truncate(snap.out_log_len);
        // Re-prepend popped keys in reverse, so the FIFO front matches
        // the byte that was about to be read at step start.
        for b in snap.keys_popped.into_iter().rev() {
            self.key_buffer.push_front(b);
        }
        true
    }

    /// Initialize a `.com`-style program: code at `cs:0x100`, IP at 0x100, all
    /// segments equal. Matches the emu8086 default template.
    pub fn load_com(&mut self, image: &[u8]) {
        let seg: u16 = 0x0700;
        self.regs = Registers {
            cs: seg,
            ds: seg,
            es: seg,
            ss: seg,
            ip: 0x100,
            sp: 0xFFFE,
            ..Registers::default()
        };
        self.mem.load(seg_off(seg, 0x100), image);
        self.halted = false;
        self.stdout.clear();
        self.exit_code = None;
        self.out_log.clear();
        // Ports are not zeroed on load — they model device state, not
        // program state. Reset by constructing a new Cpu.
    }

    fn port_in_u8(&mut self, port: u16) -> u8 {
        match port {
            // Keyboard data port: drain one byte from the FIFO. Returns
            // 0 if no key is pending — same contract as INT 21h fn 01h
            // when the buffer is empty, so a polling loop without a
            // status check still terminates rather than hangs.
            KEYBOARD_DATA_PORT => self.pop_key().unwrap_or(0),
            // Keyboard status port: bit 0 reflects "data available". Any
            // other bit reads as 0 — we don't simulate parity, timeout,
            // or self-test bits.
            KEYBOARD_STATUS_PORT => u8::from(!self.key_buffer.is_empty()),
            _ => self.ports[port as usize],
        }
    }
    fn port_in_u16(&mut self, port: u16) -> u16 {
        let lo = self.port_in_u8(port);
        let hi = self.port_in_u8(port.wrapping_add(1));
        u16::from_le_bytes([lo, hi])
    }
    fn port_out_u8(&mut self, port: u16, value: u8) {
        self.ports[port as usize] = value;
        self.out_log.push(PortWrite {
            port,
            value: u16::from(value),
            width: 8,
        });
    }
    fn port_out_u16(&mut self, port: u16, value: u16) {
        let [lo, hi] = value.to_le_bytes();
        self.ports[port as usize] = lo;
        self.ports[port.wrapping_add(1) as usize] = hi;
        self.out_log.push(PortWrite {
            port,
            value,
            width: 16,
        });
    }

    /// Handle a software interrupt. We intercept the small subset of DOS
    /// services that emu8086 lab manuals use; anything else returns
    /// `Unimplemented` so the IDE can show a clear "INT N AH=H not
    /// implemented" diagnostic instead of silently no-opping.
    fn handle_int(&mut self, n: u8, ip_before: u16, rec: &mut StepRecord) {
        match n {
            0x20 => {
                // Legacy CP/M-style exit.
                self.halted = true;
                self.exit_code = Some(0);
                rec.mnemonic = "int";
                rec.stopped = Some(StopReason::Halted);
            }
            0x21 => self.dos_int21(rec),
            0x16 => self.bios_int16(rec),
            other => {
                rec.stopped = Some(StopReason::Unimplemented {
                    opcode: 0xCD,
                    ip: ip_before,
                });
                let _ = other;
            }
        }
    }

    /// BIOS keyboard services. We implement the two subfunctions every
    /// emu8086 lab manual reaches for:
    ///
    /// - `AH=00h` — read a key (blocking on real hardware). On our
    ///   synchronous emulator we drain one byte from the keyboard FIFO
    ///   if present, otherwise return AL=AH=0 so polling loops without
    ///   a peek don't hang the runtime.
    /// - `AH=01h` — peek. Sets ZF=1 when the buffer is empty, ZF=0 +
    ///   AL=ASCII when a byte is waiting (the byte is *not* consumed).
    ///
    /// The real BIOS returns a (scancode, ASCII) pair in (AH, AL); since
    /// the host pushes a single byte through `push_key`, we report that
    /// byte in AL and leave AH=0. Programs using AH for scancodes will
    /// see 0 — documented in the example program.
    fn bios_int16(&mut self, rec: &mut StepRecord) {
        let ah = self.regs.ah();
        match ah {
            0x00 => {
                let b = self.pop_key().unwrap_or(0);
                self.regs.set_al(b);
                self.regs.set_ah(0);
                rec.mnemonic = "int";
            }
            0x01 => {
                if let Some(&b) = self.key_buffer.front() {
                    self.regs.set_al(b);
                    self.regs.set_ah(0);
                    self.regs.flags.set(Flags::ZF, false);
                } else {
                    self.regs.flags.set(Flags::ZF, true);
                }
                rec.mnemonic = "int";
            }
            _ => {
                rec.mnemonic = "int";
            }
        }
    }

    // Split into a per-subfunction match. Total length is the sum of
    // the small handlers it dispatches to, not a complexity signal.
    #[allow(clippy::too_many_lines)]
    fn dos_int21(&mut self, rec: &mut StepRecord) {
        let ah = self.regs.ah();
        match ah {
            // 01h: read char with echo. Drains the keyboard FIFO if a
            // byte is pending; echoes it to stdout (as DOS does). When
            // the buffer is empty we still return 0 (no echo) rather
            // than blocking, so polling loops terminate cleanly.
            0x01 => {
                if let Some(b) = self.pop_key() {
                    self.regs.set_al(b);
                    self.stdout.push(b);
                } else {
                    self.regs.set_al(0);
                }
                rec.mnemonic = "int";
            }
            // 02h: print char in DL.
            0x02 => {
                self.stdout.push(self.regs.dl());
                rec.mnemonic = "int";
            }
            // 08h: read char without echo. Same drain semantics as 01h
            // but without writing the byte to stdout. If the FIFO is
            // empty we return 0 rather than blocking, mirroring the
            // 01h behavior so polling loops don't hang the runtime.
            0x08 => {
                let b = self.pop_key().unwrap_or(0);
                self.regs.set_al(b);
                rec.mnemonic = "int";
            }
            // 06h: direct console I/O. If DL == 0xFF this is a
            // non-blocking read: drain a byte if present (ZF=0, AL=byte),
            // otherwise signal "no key" with ZF=1. Else, write DL.
            0x06 => {
                if self.regs.dl() == 0xFF {
                    if let Some(b) = self.pop_key() {
                        self.regs.set_al(b);
                        self.regs.flags.set(Flags::ZF, false);
                    } else {
                        self.regs.set_al(0);
                        self.regs.flags.set(Flags::ZF, true);
                    }
                } else {
                    self.stdout.push(self.regs.dl());
                }
                rec.mnemonic = "int";
            }
            // 0Ah: buffered keyboard input. DS:DX points to a buffer
            // with byte 0 = max length (set by caller, including the
            // CR terminator), byte 1 = actual count (set by us, NOT
            // including the CR), bytes 2..2+count = the typed bytes,
            // byte 2+count = the literal CR (0x0D). DOS blocks until
            // the user presses Enter; our synchronous drain consumes
            // pending keys until either a CR or the capacity is
            // reached, then writes the CR terminator regardless. Each
            // typed byte is echoed to stdout, matching DOS behavior so
            // a tester sees the input transcript.
            0x0A => {
                let buf_off = self.regs.dx;
                let lin_max = seg_off(self.regs.ds, buf_off);
                let max_bytes = self.mem.read_u8(lin_max);
                // capacity excluding the mandatory CR terminator. DOS
                // documents max=1 as "only the CR fits"; we treat
                // max=0 the same way (count stays 0, CR still
                // emitted).
                let cap = max_bytes.saturating_sub(1);
                let mut count: u8 = 0;
                while count < cap {
                    // CR ends input; an empty FIFO ends it the same
                    // way (we never block — see AH=01h's contract).
                    match self.pop_key() {
                        Some(0x0D) | None => break,
                        Some(b) => {
                            let lin =
                                seg_off(self.regs.ds, buf_off.wrapping_add(2 + u16::from(count)));
                            self.mem.write_u8(lin, b);
                            self.stdout.push(b);
                            count = count.wrapping_add(1);
                        }
                    }
                }
                let cr_lin = seg_off(self.regs.ds, buf_off.wrapping_add(2 + u16::from(count)));
                self.mem.write_u8(cr_lin, 0x0D);
                self.stdout.push(0x0D);
                let actual_lin = seg_off(self.regs.ds, buf_off.wrapping_add(1));
                self.mem.write_u8(actual_lin, count);
                rec.mnemonic = "int";
            }
            // 09h: print $-terminated string at DS:DX.
            0x09 => {
                let mut off = self.regs.dx;
                // Cap at 64 KiB worth of segment to avoid pathological
                // missing-terminator programs hanging the runtime.
                for _ in 0..0x10000u32 {
                    let lin = seg_off(self.regs.ds, off);
                    let b = self.mem.read_u8(lin);
                    if b == b'$' {
                        break;
                    }
                    self.stdout.push(b);
                    off = off.wrapping_add(1);
                }
                rec.mnemonic = "int";
            }
            // 2Ah: get system date. Returns CX=year (1980-2099),
            // DH=month (1-12), DL=day (1-31), AL=day-of-week
            // (0=Sunday..6=Saturday). Reads from `self.clock`, which
            // the host sets before a run. Default clock is 2024-01-01
            // Monday so unit tests don't depend on real time.
            0x2A => {
                self.regs.cx = self.clock.year;
                self.regs.set_dh(self.clock.month);
                self.regs.set_dl(self.clock.day);
                self.regs.set_al(self.clock.day_of_week);
                rec.mnemonic = "int";
            }
            // 2Ch: get system time. Returns CH=hour (0-23), CL=minute
            // (0-59), DH=second (0-59), DL=hundredths (0-99). Same
            // virtual-clock contract as 2Ah; programs that compute
            // elapsed time across instructions will see no advance.
            0x2C => {
                self.regs.set_ch(self.clock.hour);
                self.regs.set_cl(self.clock.minute);
                self.regs.set_dh(self.clock.second);
                self.regs.set_dl(self.clock.hundredths);
                rec.mnemonic = "int";
            }
            // 4Ch: terminate with exit code in AL. The 8086 manual also
            // documents 00h as "terminate" with exit-code 0 — we treat it
            // the same.
            0x00 | 0x4C => {
                self.exit_code = Some(self.regs.al());
                self.halted = true;
                rec.mnemonic = "int";
                rec.stopped = Some(StopReason::Halted);
            }
            _ => {
                rec.stopped = Some(StopReason::Unimplemented {
                    opcode: 0xCD,
                    ip: self.regs.ip.wrapping_sub(2),
                });
            }
        }
    }

    fn fetch_u8(&mut self) -> u8 {
        let lin = seg_off(self.regs.cs, self.regs.ip);
        let b = self.mem.read_u8(lin);
        self.regs.ip = self.regs.ip.wrapping_add(1);
        b
    }

    fn fetch_u16(&mut self) -> u16 {
        let lo = self.fetch_u8();
        let hi = self.fetch_u8();
        u16::from_le_bytes([lo, hi])
    }

    #[must_use]
    pub fn read_reg8(&self, r: Reg8) -> u8 {
        match r {
            Reg8::Al => self.regs.al(),
            Reg8::Cl => self.regs.cl(),
            Reg8::Dl => self.regs.dl(),
            Reg8::Bl => self.regs.bl(),
            Reg8::Ah => self.regs.ah(),
            Reg8::Ch => self.regs.ch(),
            Reg8::Dh => self.regs.dh(),
            Reg8::Bh => self.regs.bh(),
        }
    }

    pub fn write_reg8(&mut self, r: Reg8, v: u8) {
        match r {
            Reg8::Al => self.regs.set_al(v),
            Reg8::Cl => self.regs.set_cl(v),
            Reg8::Dl => self.regs.set_dl(v),
            Reg8::Bl => self.regs.set_bl(v),
            Reg8::Ah => self.regs.set_ah(v),
            Reg8::Ch => self.regs.set_ch(v),
            Reg8::Dh => self.regs.set_dh(v),
            Reg8::Bh => self.regs.set_bh(v),
        }
    }

    #[must_use]
    pub fn read_reg16(&self, r: Reg16) -> u16 {
        match r {
            Reg16::Ax => self.regs.ax,
            Reg16::Cx => self.regs.cx,
            Reg16::Dx => self.regs.dx,
            Reg16::Bx => self.regs.bx,
            Reg16::Sp => self.regs.sp,
            Reg16::Bp => self.regs.bp,
            Reg16::Si => self.regs.si,
            Reg16::Di => self.regs.di,
        }
    }

    pub fn write_reg16(&mut self, r: Reg16, v: u16) {
        match r {
            Reg16::Ax => self.regs.ax = v,
            Reg16::Cx => self.regs.cx = v,
            Reg16::Dx => self.regs.dx = v,
            Reg16::Bx => self.regs.bx = v,
            Reg16::Sp => self.regs.sp = v,
            Reg16::Bp => self.regs.bp = v,
            Reg16::Si => self.regs.si = v,
            Reg16::Di => self.regs.di = v,
        }
    }

    #[must_use]
    pub fn read_seg(&self, s: SegReg) -> u16 {
        match s {
            SegReg::Es => self.regs.es,
            SegReg::Cs => self.regs.cs,
            SegReg::Ss => self.regs.ss,
            SegReg::Ds => self.regs.ds,
        }
    }

    pub fn write_seg(&mut self, s: SegReg, v: u16) {
        match s {
            SegReg::Es => self.regs.es = v,
            SegReg::Cs => self.regs.cs = v,
            SegReg::Ss => self.regs.ss = v,
            SegReg::Ds => self.regs.ds = v,
        }
    }

    /// Decode the memory operand selected by mod-r/m bits, fetching any
    /// trailing displacement bytes. Caller has already taken the modrm byte.
    /// Returns the (default segment, offset). Returns None for register
    /// form (mod=11).
    fn decode_ea(&mut self, modrm: u8) -> Option<EffAddr> {
        let mode = modrm >> 6;
        let rm = modrm & 0b111;
        if mode == 0b11 {
            return None;
        }

        // Special case: mod=00 rm=110 → 16-bit absolute address (no register base).
        if mode == 0b00 && rm == 0b110 {
            let abs = self.fetch_u16();
            return Some(EffAddr {
                default_seg: SegReg::Ds,
                off: abs,
            });
        }

        // Base/index pattern by rm.
        let (base, default_seg) = match rm {
            0b000 => (self.regs.bx.wrapping_add(self.regs.si), SegReg::Ds),
            0b001 => (self.regs.bx.wrapping_add(self.regs.di), SegReg::Ds),
            0b010 => (self.regs.bp.wrapping_add(self.regs.si), SegReg::Ss),
            0b011 => (self.regs.bp.wrapping_add(self.regs.di), SegReg::Ss),
            0b100 => (self.regs.si, SegReg::Ds),
            0b101 => (self.regs.di, SegReg::Ds),
            0b110 => (self.regs.bp, SegReg::Ss),
            _ => (self.regs.bx, SegReg::Ds),
        };

        let disp: u16 = match mode {
            0b00 => 0,
            // Sign-extend disp8 to 16 bits.
            0b01 => self.fetch_u8() as i8 as i16 as u16,
            _ => self.fetch_u16(),
        };

        Some(EffAddr {
            default_seg,
            off: base.wrapping_add(disp),
        })
    }

    fn linear_for(&self, ea: EffAddr, override_seg: Option<SegReg>) -> usize {
        let seg = self.read_seg(override_seg.unwrap_or(ea.default_seg));
        seg_off(seg, ea.off)
    }

    /// Read an 8-bit operand selected by mod-r/m. `reg_field` of modrm is
    /// not consulted here; caller passes the rm pattern as `modrm`.
    fn read_rm8(&mut self, modrm: u8, override_seg: Option<SegReg>) -> u8 {
        if let Some(ea) = self.decode_ea(modrm) {
            self.mem.read_u8(self.linear_for(ea, override_seg))
        } else {
            self.read_reg8(Reg8::from_code(modrm & 0b111))
        }
    }

    fn read_rm16(&mut self, modrm: u8, override_seg: Option<SegReg>) -> u16 {
        if let Some(ea) = self.decode_ea(modrm) {
            self.mem.read_u16(self.linear_for(ea, override_seg))
        } else {
            self.read_reg16(Reg16::from_code(modrm & 0b111))
        }
    }

    fn write_rm8(&mut self, modrm: u8, override_seg: Option<SegReg>, value: u8) {
        if let Some(ea) = self.decode_ea(modrm) {
            let lin = self.linear_for(ea, override_seg);
            self.mem.write_u8(lin, value);
        } else {
            self.write_reg8(Reg8::from_code(modrm & 0b111), value);
        }
    }

    fn write_rm16(&mut self, modrm: u8, override_seg: Option<SegReg>, value: u16) {
        if let Some(ea) = self.decode_ea(modrm) {
            let lin = self.linear_for(ea, override_seg);
            self.mem.write_u16(lin, value);
        } else {
            self.write_reg16(Reg16::from_code(modrm & 0b111), value);
        }
    }

    /// Step SI by `delta` bytes, observing the direction flag (DF=0 means
    /// forward, DF=1 means backward, per the 8086 manual).
    fn string_step_si(&mut self, delta: u16) {
        if self.regs.flags.get(Flags::DF) {
            self.regs.si = self.regs.si.wrapping_sub(delta);
        } else {
            self.regs.si = self.regs.si.wrapping_add(delta);
        }
    }

    fn string_step_di(&mut self, delta: u16) {
        if self.regs.flags.get(Flags::DF) {
            self.regs.di = self.regs.di.wrapping_sub(delta);
        } else {
            self.regs.di = self.regs.di.wrapping_add(delta);
        }
    }

    /// Run a string opcode (or one with a REP prefix) to completion. The
    /// `op` is the actual string-op opcode (A4/A5/A6/A7/AA/AB/AC/AD/AE/AF).
    /// `rep` is None for one-shot, Some(true) for REPE/REP, Some(false)
    /// for REPNE. For MOVS/STOS/LODS the REPE/REPNE distinction is ignored
    /// (any REP form just repeats CX times).
    #[allow(clippy::too_many_lines)]
    fn run_string_op(&mut self, op: u8, rep: Option<bool>, override_seg: Option<SegReg>) {
        let zf_check = matches!(op, 0xA6 | 0xA7 | 0xAE | 0xAF); // CMPS/SCAS
                                                                // Hard cap: at most 0x10000 iterations per single REP, since CX is u16.
        let cap = if rep.is_some() { 0x10000u32 } else { 1 };
        let ds_or_override = override_seg.unwrap_or(SegReg::Ds);
        for _ in 0..cap {
            if rep.is_some() && self.regs.cx == 0 {
                break;
            }
            match op {
                // MOVSB / MOVSW
                0xA4 | 0xA5 => {
                    let src_lin = seg_off(self.read_seg(ds_or_override), self.regs.si);
                    let dst_lin = seg_off(self.regs.es, self.regs.di);
                    if op == 0xA4 {
                        let v = self.mem.read_u8(src_lin);
                        self.mem.write_u8(dst_lin, v);
                        self.string_step_si(1);
                        self.string_step_di(1);
                    } else {
                        let v = self.mem.read_u16(src_lin);
                        self.mem.write_u16(dst_lin, v);
                        self.string_step_si(2);
                        self.string_step_di(2);
                    }
                }
                // CMPSB / CMPSW
                0xA6 | 0xA7 => {
                    let src_lin = seg_off(self.read_seg(ds_or_override), self.regs.si);
                    let dst_lin = seg_off(self.regs.es, self.regs.di);
                    if op == 0xA6 {
                        let a = self.mem.read_u8(src_lin);
                        let b = self.mem.read_u8(dst_lin);
                        let (_, f) = alu::sub8(a, b, false);
                        self.regs.flags = f;
                        self.string_step_si(1);
                        self.string_step_di(1);
                    } else {
                        let a = self.mem.read_u16(src_lin);
                        let b = self.mem.read_u16(dst_lin);
                        let (_, f) = alu::sub16(a, b, false);
                        self.regs.flags = f;
                        self.string_step_si(2);
                        self.string_step_di(2);
                    }
                }
                // STOSB / STOSW — store AL/AX into ES:DI.
                0xAA | 0xAB => {
                    let dst_lin = seg_off(self.regs.es, self.regs.di);
                    if op == 0xAA {
                        self.mem.write_u8(dst_lin, self.regs.al());
                        self.string_step_di(1);
                    } else {
                        self.mem.write_u16(dst_lin, self.regs.ax);
                        self.string_step_di(2);
                    }
                }
                // LODSB / LODSW — load AL/AX from DS:SI.
                0xAC | 0xAD => {
                    let src_lin = seg_off(self.read_seg(ds_or_override), self.regs.si);
                    if op == 0xAC {
                        self.regs.set_al(self.mem.read_u8(src_lin));
                        self.string_step_si(1);
                    } else {
                        self.regs.ax = self.mem.read_u16(src_lin);
                        self.string_step_si(2);
                    }
                }
                // SCASB / SCASW — compare AL/AX with [ES:DI].
                0xAE | 0xAF => {
                    let dst_lin = seg_off(self.regs.es, self.regs.di);
                    if op == 0xAE {
                        let (_, f) = alu::sub8(self.regs.al(), self.mem.read_u8(dst_lin), false);
                        self.regs.flags = f;
                        self.string_step_di(1);
                    } else {
                        let (_, f) = alu::sub16(self.regs.ax, self.mem.read_u16(dst_lin), false);
                        self.regs.flags = f;
                        self.string_step_di(2);
                    }
                }
                _ => unreachable!("run_string_op called with non-string opcode"),
            }
            if rep.is_none() {
                break;
            }
            self.regs.cx = self.regs.cx.wrapping_sub(1);
            // ZF-aware termination for CMPS/SCAS only.
            if zf_check {
                let zf = self.regs.flags.get(Flags::ZF);
                match rep {
                    Some(true) if !zf => break, // REPE: stop on first not-equal
                    Some(false) if zf => break, // REPNE: stop on first equal
                    _ => {}
                }
            }
        }
    }

    fn push_u16(&mut self, value: u16) {
        self.regs.sp = self.regs.sp.wrapping_sub(2);
        let lin = seg_off(self.regs.ss, self.regs.sp);
        self.mem.write_u16(lin, value);
    }

    fn pop_u16(&mut self) -> u16 {
        let lin = seg_off(self.regs.ss, self.regs.sp);
        let v = self.mem.read_u16(lin);
        self.regs.sp = self.regs.sp.wrapping_add(2);
        v
    }

    /// Branch-condition lookup for the 16 Jcc encodings (70..7F).
    /// `code` is the low 4 bits of the opcode.
    fn jcc_taken(&self, code: u8) -> bool {
        let f = self.regs.flags;
        let cf = f.get(Flags::CF);
        let zf = f.get(Flags::ZF);
        let sf = f.get(Flags::SF);
        let of = f.get(Flags::OF);
        let pf = f.get(Flags::PF);
        match code & 0xF {
            0x0 => of,
            0x1 => !of,
            0x2 => cf,
            0x3 => !cf,
            0x4 => zf,
            0x5 => !zf,
            0x6 => cf || zf,
            0x7 => !(cf || zf),
            0x8 => sf,
            0x9 => !sf,
            0xA => pf,
            0xB => !pf,
            0xC => sf != of,
            0xD => sf == of,
            0xE => zf || (sf != of),
            _ => !zf && (sf == of),
        }
    }

    /// Apply one of the eight ALU operations selected by `kind` (0..7) to
    /// `(a, b)` at 8-bit width. Returns `(result, flags, writes_back)`.
    /// `writes_back` is `false` for `CMP`, which computes flags and
    /// discards the result.
    fn alu_apply8(&self, kind: u8, a: u8, b: u8) -> (u8, Flags, bool) {
        let cf = self.regs.flags.get(Flags::CF);
        match kind & 7 {
            0 => {
                let (r, f) = alu::add8(a, b, false);
                (r, f, true)
            }
            1 => {
                let (r, f) = alu::or8(a, b);
                (r, f, true)
            }
            2 => {
                let (r, f) = alu::add8(a, b, cf);
                (r, f, true)
            }
            3 => {
                let (r, f) = alu::sub8(a, b, cf);
                (r, f, true)
            }
            4 => {
                let (r, f) = alu::and8(a, b);
                (r, f, true)
            }
            5 => {
                let (r, f) = alu::sub8(a, b, false);
                (r, f, true)
            }
            6 => {
                let (r, f) = alu::xor8(a, b);
                (r, f, true)
            }
            _ => {
                // CMP — same as SUB without store.
                let (r, f) = alu::sub8(a, b, false);
                (r, f, false)
            }
        }
    }

    fn alu_apply16(&self, kind: u8, a: u8, av: u16, bv: u16) -> (u16, Flags, bool) {
        let _ = a;
        let cf = self.regs.flags.get(Flags::CF);
        match kind & 7 {
            0 => {
                let (r, f) = alu::add16(av, bv, false);
                (r, f, true)
            }
            1 => {
                let (r, f) = alu::or16(av, bv);
                (r, f, true)
            }
            2 => {
                let (r, f) = alu::add16(av, bv, cf);
                (r, f, true)
            }
            3 => {
                let (r, f) = alu::sub16(av, bv, cf);
                (r, f, true)
            }
            4 => {
                let (r, f) = alu::and16(av, bv);
                (r, f, true)
            }
            5 => {
                let (r, f) = alu::sub16(av, bv, false);
                (r, f, true)
            }
            6 => {
                let (r, f) = alu::xor16(av, bv);
                (r, f, true)
            }
            _ => {
                let (r, f) = alu::sub16(av, bv, false);
                (r, f, false)
            }
        }
    }

    /// Mnemonic name for the eight ALU kinds, used to populate `StepRecord`.
    const fn alu_mnemonic(kind: u8) -> &'static str {
        match kind & 7 {
            0 => "add",
            1 => "or",
            2 => "adc",
            3 => "sbb",
            4 => "and",
            5 => "sub",
            6 => "xor",
            _ => "cmp",
        }
    }

    /// Execute exactly one instruction starting at `cs:ip`.
    ///
    /// Returns a `StepRecord` describing what happened. If the CPU is
    /// halted the record reports it without advancing IP.
    #[allow(clippy::too_many_lines, clippy::match_same_arms)]
    pub fn step(&mut self) -> StepRecord {
        if self.halted {
            return StepRecord {
                stopped: Some(StopReason::Halted),
                ..Default::default()
            };
        }
        // Begin tracking memory writes for this step so step_back can
        // undo them. Cheaper than cloning the whole 1 MiB Memory.
        let recording = self.history_capacity > 0;
        let regs_before = self.regs;
        let halted_before = self.halted;
        let exit_code_before = self.exit_code;
        let stdout_len_before = self.stdout.len();
        let out_log_len_before = self.out_log.len();
        // Reset the per-step keyboard-pop trail. Always cleared (even
        // when not recording) so a stale tail can never bleed into a
        // future snapshot if recording is enabled mid-run.
        self.keys_popped_this_step.clear();
        if recording {
            self.mem.start_tracking();
        }
        let ip_before = self.regs.ip;
        let mut rec = StepRecord::default();

        // Consume any prefix bytes. On 8086 multiple prefixes are accepted
        // with the last of each kind winning. We track:
        //   - segment override (26/2E/36/3E)
        //   - REP family (F2 REPNE, F3 REP/REPE) for string ops
        //   - LOCK (F0) is silently absorbed; it has no observable effect
        //     in our single-thread emulator and is rare in lab programs.
        let mut override_seg: Option<SegReg> = None;
        // None = no rep, Some(true) = REPE/REP, Some(false) = REPNE.
        let mut rep: Option<bool> = None;
        let op = loop {
            let b = self.fetch_u8();
            match b {
                0x26 => override_seg = Some(SegReg::Es),
                0x2E => override_seg = Some(SegReg::Cs),
                0x36 => override_seg = Some(SegReg::Ss),
                0x3E => override_seg = Some(SegReg::Ds),
                0xF0 => {} // LOCK — absorbed
                0xF2 => rep = Some(false),
                0xF3 => rep = Some(true),
                _ => break b,
            }
        };

        match op {
            // NOP — XCHG AX,AX
            0x90 => {
                rec.mnemonic = "nop";
            }

            // HLT
            0xF4 => {
                self.halted = true;
                rec.mnemonic = "hlt";
                rec.stopped = Some(StopReason::Halted);
            }

            // Single-byte flag manipulation.
            0xF8 => {
                self.regs.flags.set(Flags::CF, false);
                rec.mnemonic = "clc";
            }
            0xF9 => {
                self.regs.flags.set(Flags::CF, true);
                rec.mnemonic = "stc";
            }
            0xF5 => {
                let cf = self.regs.flags.get(Flags::CF);
                self.regs.flags.set(Flags::CF, !cf);
                rec.mnemonic = "cmc";
            }
            0xFC => {
                self.regs.flags.set(Flags::DF, false);
                rec.mnemonic = "cld";
            }
            0xFD => {
                self.regs.flags.set(Flags::DF, true);
                rec.mnemonic = "std";
            }
            0xFA => {
                self.regs.flags.set(Flags::IF, false);
                rec.mnemonic = "cli";
            }
            0xFB => {
                self.regs.flags.set(Flags::IF, true);
                rec.mnemonic = "sti";
            }

            // MOV reg8, imm8 — opcodes B0..B7
            0xB0..=0xB7 => {
                let r = Reg8::from_code(op - 0xB0);
                let imm = self.fetch_u8();
                self.write_reg8(r, imm);
                rec.mnemonic = "mov";
            }

            // MOV reg16, imm16 — opcodes B8..BF
            0xB8..=0xBF => {
                let r = Reg16::from_code(op - 0xB8);
                let imm = self.fetch_u16();
                self.write_reg16(r, imm);
                rec.mnemonic = "mov";
            }

            // MOV r/m8, r8 (88) and MOV r/m16, r16 (89). Memory or register dest.
            0x88 | 0x89 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if op == 0x88 {
                    let v = self.read_reg8(Reg8::from_code(reg));
                    self.write_rm8(modrm, override_seg, v);
                } else {
                    let v = self.read_reg16(Reg16::from_code(reg));
                    self.write_rm16(modrm, override_seg, v);
                }
                rec.mnemonic = "mov";
            }

            // MOV r8, r/m8 (8A) and MOV r16, r/m16 (8B). Memory or register source.
            0x8A | 0x8B => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if op == 0x8A {
                    let v = self.read_rm8(modrm, override_seg);
                    self.write_reg8(Reg8::from_code(reg), v);
                } else {
                    let v = self.read_rm16(modrm, override_seg);
                    self.write_reg16(Reg16::from_code(reg), v);
                }
                rec.mnemonic = "mov";
            }

            // MOV r/m, imm — C6 (8-bit) / C7 (16-bit).
            0xC6 => {
                let modrm = self.fetch_u8();
                let imm = self.fetch_u8();
                self.write_rm8(modrm, override_seg, imm);
                rec.mnemonic = "mov";
            }
            0xC7 => {
                let modrm = self.fetch_u8();
                let imm = self.fetch_u16();
                self.write_rm16(modrm, override_seg, imm);
                rec.mnemonic = "mov";
            }

            // MOV AL, [moffs8] / MOV AX, [moffs16]
            0xA0 | 0xA1 => {
                let off = self.fetch_u16();
                let lin = seg_off(self.read_seg(override_seg.unwrap_or(SegReg::Ds)), off);
                if op == 0xA0 {
                    self.regs.set_al(self.mem.read_u8(lin));
                } else {
                    self.regs.ax = self.mem.read_u16(lin);
                }
                rec.mnemonic = "mov";
            }

            // MOV [moffs8], AL / MOV [moffs16], AX
            0xA2 | 0xA3 => {
                let off = self.fetch_u16();
                let lin = seg_off(self.read_seg(override_seg.unwrap_or(SegReg::Ds)), off);
                if op == 0xA2 {
                    self.mem.write_u8(lin, self.regs.al());
                } else {
                    self.mem.write_u16(lin, self.regs.ax);
                }
                rec.mnemonic = "mov";
            }

            // MOV r/m16, sreg (8C) / MOV sreg, r/m16 (8E)
            0x8C => {
                let modrm = self.fetch_u8();
                let s = SegReg::from_code((modrm >> 3) & 0b11);
                let v = self.read_seg(s);
                self.write_rm16(modrm, override_seg, v);
                rec.mnemonic = "mov";
            }
            0x8E => {
                let modrm = self.fetch_u8();
                let s = SegReg::from_code((modrm >> 3) & 0b11);
                let v = self.read_rm16(modrm, override_seg);
                self.write_seg(s, v);
                rec.mnemonic = "mov";
            }

            // LEA r16, m (8D) — load effective address; only memory form is valid.
            0x8D => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if let Some(ea) = self.decode_ea(modrm) {
                    self.write_reg16(Reg16::from_code(reg), ea.off);
                    rec.mnemonic = "lea";
                } else {
                    rec.stopped = Some(StopReason::Unimplemented {
                        opcode: op,
                        ip: ip_before,
                    });
                }
            }

            // XCHG AX, r16 — opcodes 91..97 (90 is NOP since AX,AX).
            0x91..=0x97 => {
                let r = Reg16::from_code(op - 0x90);
                let tmp = self.read_reg16(r);
                self.write_reg16(r, self.regs.ax);
                self.regs.ax = tmp;
                rec.mnemonic = "xchg";
            }

            // XCHG r/m, r — 86 (8-bit) / 87 (16-bit)
            0x86 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let r = Reg8::from_code(reg);
                let a = self.read_reg8(r);
                let b = self.read_rm8(modrm, override_seg);
                self.write_reg8(r, b);
                self.write_rm8(modrm, override_seg, a);
                rec.mnemonic = "xchg";
            }
            0x87 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let r = Reg16::from_code(reg);
                let a = self.read_reg16(r);
                let b = self.read_rm16(modrm, override_seg);
                self.write_reg16(r, b);
                self.write_rm16(modrm, override_seg, a);
                rec.mnemonic = "xchg";
            }

            // Regular ALU group 00..3D — eight operations × six forms each.
            // op = (kind << 3) | form
            //   kind: 0 ADD | 1 OR | 2 ADC | 3 SBB | 4 AND | 5 SUB | 6 XOR | 7 CMP
            //   form: 0 r/m,r 8 | 1 r/m,r 16 | 2 r,r/m 8 | 3 r,r/m 16
            //         4 AL,imm8 | 5 AX,imm16
            // Forms 6/7 inside these ranges are seg push/pop or BCD ops and
            // fall through to the unimplemented arm for now.
            0x00..=0x3D if (op & 0b111) < 6 => {
                let kind = op >> 3;
                let form = op & 0b111;
                rec.mnemonic = Self::alu_mnemonic(kind);
                match form {
                    0 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_rm8(modrm, override_seg);
                        let b = self.read_reg8(Reg8::from_code(reg));
                        let (r, f, w) = self.alu_apply8(kind, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_rm8(modrm, override_seg, r);
                        }
                    }
                    1 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_rm16(modrm, override_seg);
                        let b = self.read_reg16(Reg16::from_code(reg));
                        let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_rm16(modrm, override_seg, r);
                        }
                    }
                    2 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_reg8(Reg8::from_code(reg));
                        let b = self.read_rm8(modrm, override_seg);
                        let (r, f, w) = self.alu_apply8(kind, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_reg8(Reg8::from_code(reg), r);
                        }
                    }
                    3 => {
                        let modrm = self.fetch_u8();
                        let reg = (modrm >> 3) & 0b111;
                        let a = self.read_reg16(Reg16::from_code(reg));
                        let b = self.read_rm16(modrm, override_seg);
                        let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                        self.regs.flags = f;
                        if w {
                            self.write_reg16(Reg16::from_code(reg), r);
                        }
                    }
                    4 => {
                        let imm = self.fetch_u8();
                        let a = self.regs.al();
                        let (r, f, w) = self.alu_apply8(kind, a, imm);
                        self.regs.flags = f;
                        if w {
                            self.regs.set_al(r);
                        }
                    }
                    _ /* 5 */ => {
                        let imm = self.fetch_u16();
                        let a = self.regs.ax;
                        let (r, f, w) = self.alu_apply16(kind, 0, a, imm);
                        self.regs.flags = f;
                        if w {
                            self.regs.ax = r;
                        }
                    }
                }
            }

            // ALU r/m, imm — 80 (r/m8, imm8), 81 (r/m16, imm16),
            // 82 (alias of 80), 83 (r/m16, sign-extended imm8).
            // Operation selected by reg field of mod-r/m.
            0x80 | 0x82 => {
                let modrm = self.fetch_u8();
                let kind = (modrm >> 3) & 0b111;
                let a = self.read_rm8(modrm, override_seg);
                let b = self.fetch_u8();
                rec.mnemonic = Self::alu_mnemonic(kind);
                let (r, f, w) = self.alu_apply8(kind, a, b);
                self.regs.flags = f;
                if w {
                    self.write_rm8(modrm, override_seg, r);
                }
            }
            0x81 => {
                let modrm = self.fetch_u8();
                let kind = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                let b = self.fetch_u16();
                rec.mnemonic = Self::alu_mnemonic(kind);
                let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                self.regs.flags = f;
                if w {
                    self.write_rm16(modrm, override_seg, r);
                }
            }
            0x83 => {
                let modrm = self.fetch_u8();
                let kind = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                // Sign-extend imm8 to 16 bits.
                let b = self.fetch_u8() as i8 as i16 as u16;
                rec.mnemonic = Self::alu_mnemonic(kind);
                let (r, f, w) = self.alu_apply16(kind, 0, a, b);
                self.regs.flags = f;
                if w {
                    self.write_rm16(modrm, override_seg, r);
                }
            }

            // TEST r/m, r — 84 (8-bit), 85 (16-bit). AND-without-store.
            0x84 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let a = self.read_rm8(modrm, override_seg);
                let b = self.read_reg8(Reg8::from_code(reg));
                let (_, f) = alu::and8(a, b);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }
            0x85 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                let b = self.read_reg16(Reg16::from_code(reg));
                let (_, f) = alu::and16(a, b);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }

            // TEST AL/AX, imm — A8/A9.
            0xA8 => {
                let imm = self.fetch_u8();
                let (_, f) = alu::and8(self.regs.al(), imm);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }
            0xA9 => {
                let imm = self.fetch_u16();
                let (_, f) = alu::and16(self.regs.ax, imm);
                self.regs.flags = f;
                rec.mnemonic = "test";
            }

            // INC reg16 — 40..47.
            0x40..=0x47 => {
                let r = Reg16::from_code(op - 0x40);
                let cf = self.regs.flags.get(Flags::CF);
                let (v, f) = alu::inc16(self.read_reg16(r), cf);
                self.regs.flags = f;
                self.write_reg16(r, v);
                rec.mnemonic = "inc";
            }

            // DEC reg16 — 48..4F.
            0x48..=0x4F => {
                let r = Reg16::from_code(op - 0x48);
                let cf = self.regs.flags.get(Flags::CF);
                let (v, f) = alu::dec16(self.read_reg16(r), cf);
                self.regs.flags = f;
                self.write_reg16(r, v);
                rec.mnemonic = "dec";
            }

            // FE / FF — unary group on r/m. Reg field selects:
            // 0 INC, 1 DEC. Other variants of FF (CALL/JMP/PUSH) arrive
            // with control flow in the next slice.
            0xFE => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let cf = self.regs.flags.get(Flags::CF);
                let a = self.read_rm8(modrm, override_seg);
                let (v, f, name) = match sub {
                    0 => {
                        let (v, f) = alu::inc8(a, cf);
                        (v, f, "inc")
                    }
                    1 => {
                        let (v, f) = alu::dec8(a, cf);
                        (v, f, "dec")
                    }
                    _ => {
                        rec.stopped = Some(StopReason::Unimplemented {
                            opcode: op,
                            ip: ip_before,
                        });
                        (0u8, self.regs.flags, "")
                    }
                };
                if rec.stopped.is_none() {
                    self.regs.flags = f;
                    self.write_rm8(modrm, override_seg, v);
                    rec.mnemonic = name;
                }
            }
            0xFF => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                // Far-pointer subops (3, 5) need the *address* of the
                // 4-byte (offset, segment) pair, not the value at it.
                // The other subops want the resolved 16-bit value, so
                // we split the dispatch into two paths that each call
                // decode_ea / read_rm16 exactly once.
                if sub == 3 || sub == 5 {
                    if let Some(ea) = self.decode_ea(modrm) {
                        let lin = self.linear_for(ea, override_seg);
                        let new_ip = self.mem.read_u16(lin);
                        let new_cs = self.mem.read_u16(lin.wrapping_add(2));
                        if sub == 3 {
                            // CALL m16:16 — push CS, push IP, jump.
                            let ret_ip = self.regs.ip;
                            let ret_cs = self.regs.cs;
                            self.push_u16(ret_cs);
                            self.push_u16(ret_ip);
                            rec.mnemonic = "call";
                        } else {
                            rec.mnemonic = "jmp";
                        }
                        self.regs.cs = new_cs;
                        self.regs.ip = new_ip;
                    } else {
                        rec.stopped = Some(StopReason::Unimplemented {
                            opcode: op,
                            ip: ip_before,
                        });
                    }
                } else {
                    let cf = self.regs.flags.get(Flags::CF);
                    let a = self.read_rm16(modrm, override_seg);
                    match sub {
                        0 => {
                            let (v, f) = alu::inc16(a, cf);
                            self.regs.flags = f;
                            self.write_rm16(modrm, override_seg, v);
                            rec.mnemonic = "inc";
                        }
                        1 => {
                            let (v, f) = alu::dec16(a, cf);
                            self.regs.flags = f;
                            self.write_rm16(modrm, override_seg, v);
                            rec.mnemonic = "dec";
                        }
                        2 => {
                            // CALL r/m16 (near).
                            let ret = self.regs.ip;
                            self.push_u16(ret);
                            self.regs.ip = a;
                            rec.mnemonic = "call";
                        }
                        4 => {
                            // JMP r/m16 (near).
                            self.regs.ip = a;
                            rec.mnemonic = "jmp";
                        }
                        6 => {
                            // PUSH r/m16.
                            self.push_u16(a);
                            rec.mnemonic = "push";
                        }
                        _ => {
                            rec.stopped = Some(StopReason::Unimplemented {
                                opcode: op,
                                ip: ip_before,
                            });
                        }
                    }
                }
            }

            // F6 / F7 — unary group on r/m. Sub-op via reg field of mod-r/m:
            // 0/1 TEST imm, 2 NOT, 3 NEG, 4 MUL, 5 IMUL, 6 DIV, 7 IDIV.
            0xF6 => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let a = self.read_rm8(modrm, override_seg);
                match sub {
                    0 | 1 => {
                        let imm = self.fetch_u8();
                        let (_, f) = alu::and8(a, imm);
                        self.regs.flags = f;
                        rec.mnemonic = "test";
                    }
                    2 => {
                        let v = alu::not8(a);
                        self.write_rm8(modrm, override_seg, v);
                        rec.mnemonic = "not";
                    }
                    3 => {
                        let (v, f) = alu::neg8(a);
                        self.regs.flags = f;
                        self.write_rm8(modrm, override_seg, v);
                        rec.mnemonic = "neg";
                    }
                    4 => {
                        // MUL r/m8: AX = AL * r/m8 (unsigned). CF=OF set
                        // iff AH != 0 (i.e. result didn't fit in AL alone).
                        let result = u16::from(self.regs.al()) * u16::from(a);
                        self.regs.ax = result;
                        let nonzero_high = (result >> 8) != 0;
                        self.regs.flags.set(Flags::CF, nonzero_high);
                        self.regs.flags.set(Flags::OF, nonzero_high);
                        rec.mnemonic = "mul";
                    }
                    5 => {
                        // IMUL r/m8: AX = (i16)(i8 AL) * (i16)(i8 r/m8).
                        // CF=OF set iff AX != sign-extension of AL.
                        let result = i16::from(self.regs.al() as i8) * i16::from(a as i8);
                        self.regs.ax = result as u16;
                        let truncated = (result as i8) as i16;
                        let overflow = truncated != result;
                        self.regs.flags.set(Flags::CF, overflow);
                        self.regs.flags.set(Flags::OF, overflow);
                        rec.mnemonic = "imul";
                    }
                    6 => {
                        // DIV r/m8: AX / r/m8 → AL=quotient, AH=remainder.
                        if a == 0 {
                            rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                        } else {
                            let q = self.regs.ax / u16::from(a);
                            let r = self.regs.ax % u16::from(a);
                            if q > 0xFF {
                                rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                            } else {
                                self.regs.set_al(q as u8);
                                self.regs.set_ah(r as u8);
                                rec.mnemonic = "div";
                            }
                        }
                    }
                    _ => {
                        // IDIV r/m8.
                        if a == 0 {
                            rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                        } else {
                            let dividend = self.regs.ax as i16;
                            let divisor = i16::from(a as i8);
                            let q = dividend / divisor;
                            let r = dividend % divisor;
                            if i8::try_from(q).is_err() {
                                rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                            } else {
                                self.regs.set_al(q as u8);
                                self.regs.set_ah(r as u8);
                                rec.mnemonic = "idiv";
                            }
                        }
                    }
                }
            }
            0xF7 => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let a = self.read_rm16(modrm, override_seg);
                match sub {
                    0 | 1 => {
                        let imm = self.fetch_u16();
                        let (_, f) = alu::and16(a, imm);
                        self.regs.flags = f;
                        rec.mnemonic = "test";
                    }
                    2 => {
                        let v = alu::not16(a);
                        self.write_rm16(modrm, override_seg, v);
                        rec.mnemonic = "not";
                    }
                    3 => {
                        let (v, f) = alu::neg16(a);
                        self.regs.flags = f;
                        self.write_rm16(modrm, override_seg, v);
                        rec.mnemonic = "neg";
                    }
                    4 => {
                        // MUL r/m16: DX:AX = AX * r/m16.
                        let result = u32::from(self.regs.ax) * u32::from(a);
                        self.regs.ax = result as u16;
                        self.regs.dx = (result >> 16) as u16;
                        let nonzero_high = self.regs.dx != 0;
                        self.regs.flags.set(Flags::CF, nonzero_high);
                        self.regs.flags.set(Flags::OF, nonzero_high);
                        rec.mnemonic = "mul";
                    }
                    5 => {
                        // IMUL r/m16: DX:AX = AX * r/m16 (signed).
                        let result = i32::from(self.regs.ax as i16) * i32::from(a as i16);
                        self.regs.ax = result as u16;
                        self.regs.dx = (result >> 16) as u16;
                        let truncated = (result as i16) as i32;
                        let overflow = truncated != result;
                        self.regs.flags.set(Flags::CF, overflow);
                        self.regs.flags.set(Flags::OF, overflow);
                        rec.mnemonic = "imul";
                    }
                    6 => {
                        // DIV r/m16: DX:AX / r/m16 → AX=q, DX=r.
                        if a == 0 {
                            rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                        } else {
                            let dividend =
                                (u32::from(self.regs.dx) << 16) | u32::from(self.regs.ax);
                            let q = dividend / u32::from(a);
                            let r = dividend % u32::from(a);
                            if q > 0xFFFF {
                                rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                            } else {
                                self.regs.ax = q as u16;
                                self.regs.dx = r as u16;
                                rec.mnemonic = "div";
                            }
                        }
                    }
                    _ => {
                        // IDIV r/m16.
                        if a == 0 {
                            rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                        } else {
                            let dividend =
                                (i32::from(self.regs.dx as i16) << 16) | i32::from(self.regs.ax);
                            let divisor = i32::from(a as i16);
                            let q = dividend / divisor;
                            let r = dividend % divisor;
                            if i16::try_from(q).is_err() {
                                rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                            } else {
                                self.regs.ax = q as u16;
                                self.regs.dx = r as u16;
                                rec.mnemonic = "idiv";
                            }
                        }
                    }
                }
            }

            // ---- stack ----
            // PUSH r16 — 50..57.
            0x50..=0x57 => {
                let v = self.read_reg16(Reg16::from_code(op - 0x50));
                self.push_u16(v);
                rec.mnemonic = "push";
            }
            // POP r16 — 58..5F.
            0x58..=0x5F => {
                let v = self.pop_u16();
                self.write_reg16(Reg16::from_code(op - 0x58), v);
                rec.mnemonic = "pop";
            }
            // PUSHF / POPF — 9C / 9D. The 8086 has only the low byte of FLAGS
            // populated by ALU ops, but the documented bits map onto the
            // bit positions in our `Flags` already.
            0x9C => {
                self.push_u16(self.regs.flags.0);
                rec.mnemonic = "pushf";
            }
            0x9D => {
                self.regs.flags.0 = self.pop_u16();
                rec.mnemonic = "popf";
            }
            // PUSH segreg — 06 (ES), 0E (CS), 16 (SS), 1E (DS).
            0x06 => {
                self.push_u16(self.regs.es);
                rec.mnemonic = "push";
            }
            0x0E => {
                self.push_u16(self.regs.cs);
                rec.mnemonic = "push";
            }
            0x16 => {
                self.push_u16(self.regs.ss);
                rec.mnemonic = "push";
            }
            0x1E => {
                self.push_u16(self.regs.ds);
                rec.mnemonic = "push";
            }
            // POP segreg — 07 (ES), 17 (SS), 1F (DS). 0F was POP CS on 8086
            // but is undefined and we leave it unimplemented.
            0x07 => {
                self.regs.es = self.pop_u16();
                rec.mnemonic = "pop";
            }
            0x17 => {
                self.regs.ss = self.pop_u16();
                rec.mnemonic = "pop";
            }
            0x1F => {
                self.regs.ds = self.pop_u16();
                rec.mnemonic = "pop";
            }
            // POP r/m16 — 8F /0.
            0x8F => {
                let modrm = self.fetch_u8();
                let v = self.pop_u16();
                self.write_rm16(modrm, override_seg, v);
                rec.mnemonic = "pop";
            }

            // ---- control flow ----
            // JMP rel8 — EB
            0xEB => {
                let rel = self.fetch_u8() as i8 as i16 as u16;
                self.regs.ip = self.regs.ip.wrapping_add(rel);
                rec.mnemonic = "jmp";
            }
            // JMP rel16 — E9
            0xE9 => {
                let rel = self.fetch_u16();
                self.regs.ip = self.regs.ip.wrapping_add(rel);
                rec.mnemonic = "jmp";
            }
            // Conditional jumps — 70..7F (rel8).
            0x70..=0x7F => {
                let rel = self.fetch_u8() as i8 as i16 as u16;
                if self.jcc_taken(op) {
                    self.regs.ip = self.regs.ip.wrapping_add(rel);
                }
                rec.mnemonic = "jcc";
            }
            // LOOPNZ/LOOPNE rel8 — E0
            // LOOPZ/LOOPE rel8  — E1
            // LOOP rel8         — E2
            // JCXZ rel8         — E3
            0xE0..=0xE3 => {
                let rel = self.fetch_u8() as i8 as i16 as u16;
                let take = match op {
                    0xE0 => {
                        self.regs.cx = self.regs.cx.wrapping_sub(1);
                        self.regs.cx != 0 && !self.regs.flags.get(Flags::ZF)
                    }
                    0xE1 => {
                        self.regs.cx = self.regs.cx.wrapping_sub(1);
                        self.regs.cx != 0 && self.regs.flags.get(Flags::ZF)
                    }
                    0xE2 => {
                        self.regs.cx = self.regs.cx.wrapping_sub(1);
                        self.regs.cx != 0
                    }
                    _ /* 0xE3 */ => self.regs.cx == 0,
                };
                if take {
                    self.regs.ip = self.regs.ip.wrapping_add(rel);
                }
                rec.mnemonic = match op {
                    0xE0 => "loopnz",
                    0xE1 => "loopz",
                    0xE2 => "loop",
                    _ => "jcxz",
                };
            }
            // CALL rel16 — E8 — push IP (after instr), then IP += rel16.
            0xE8 => {
                let rel = self.fetch_u16();
                let ret = self.regs.ip;
                self.push_u16(ret);
                self.regs.ip = self.regs.ip.wrapping_add(rel);
                rec.mnemonic = "call";
            }
            // RET — C3 (near).
            0xC3 => {
                self.regs.ip = self.pop_u16();
                rec.mnemonic = "ret";
            }

            // ---- string ops ----
            // MOVSB/MOVSW (A4/A5), CMPSB/CMPSW (A6/A7), STOSB/STOSW (AA/AB),
            // LODSB/LODSW (AC/AD), SCASB/SCASW (AE/AF). Honors a REP/REPE/REPNE
            // prefix; for MOVS/STOS/LODS the prefix's E/NE bit is ignored.
            0xA4..=0xA7 | 0xAA..=0xAF => {
                self.run_string_op(op, rep, override_seg);
                rec.mnemonic = match op {
                    0xA4 => "movsb",
                    0xA5 => "movsw",
                    0xA6 => "cmpsb",
                    0xA7 => "cmpsw",
                    0xAA => "stosb",
                    0xAB => "stosw",
                    0xAC => "lodsb",
                    0xAD => "lodsw",
                    0xAE => "scasb",
                    _ => "scasw",
                };
            }

            // INT n — software interrupt. We intercept DOS-style services
            // and route the rest through `handle_int` (currently most are
            // unimplemented). The full IVT-driven path is deferred until
            // we need real interrupt handlers in user code.
            0xCD => {
                let n = self.fetch_u8();
                self.handle_int(n, ip_before, &mut rec);
            }
            // INT 3 (CC) — debugger trap.
            0xCC => {
                self.handle_int(3, ip_before, &mut rec);
            }
            // IRET — pop IP, CS, FLAGS. Matches the order INT pushes
            // (FLAGS first, then CS, then IP). For now this is only
            // exercised by host-pushed interrupt handlers; reaching it
            // from a guest INT n would need the IVT path.
            0xCF => {
                self.regs.ip = self.pop_u16();
                self.regs.cs = self.pop_u16();
                self.regs.flags.0 = self.pop_u16();
                rec.mnemonic = "iret";
            }

            // ---- shifts and rotates ----
            // D0 r/m8, 1   ; D1 r/m16, 1   ; D2 r/m8, CL   ; D3 r/m16, CL
            // sub-op (mod-r/m reg field):
            //   0 ROL | 1 ROR | 2 RCL | 3 RCR | 4 SHL | 5 SHR | 6 SHL alias | 7 SAR
            0xD0..=0xD3 => {
                let modrm = self.fetch_u8();
                let sub = (modrm >> 3) & 0b111;
                let count: u8 = if op & 0b10 == 0 { 1 } else { self.regs.cl() };
                let prev = self.regs.flags;
                if op & 0b01 == 0 {
                    // 8-bit form.
                    let a = self.read_rm8(modrm, override_seg);
                    let (v, f, name) = match sub {
                        0 => {
                            let (v, f) = alu::rol8(a, count, prev);
                            (v, f, "rol")
                        }
                        1 => {
                            let (v, f) = alu::ror8(a, count, prev);
                            (v, f, "ror")
                        }
                        2 => {
                            let (v, f) = alu::rcl8(a, count, prev);
                            (v, f, "rcl")
                        }
                        3 => {
                            let (v, f) = alu::rcr8(a, count, prev);
                            (v, f, "rcr")
                        }
                        4 | 6 => {
                            let (v, f) = alu::shl8(a, count, prev);
                            (v, f, "shl")
                        }
                        5 => {
                            let (v, f) = alu::shr8(a, count, prev);
                            (v, f, "shr")
                        }
                        _ => {
                            let (v, f) = alu::sar8(a, count, prev);
                            (v, f, "sar")
                        }
                    };
                    self.regs.flags = f;
                    self.write_rm8(modrm, override_seg, v);
                    rec.mnemonic = name;
                } else {
                    // 16-bit form.
                    let a = self.read_rm16(modrm, override_seg);
                    let (v, f, name) = match sub {
                        0 => {
                            let (v, f) = alu::rol16(a, count, prev);
                            (v, f, "rol")
                        }
                        1 => {
                            let (v, f) = alu::ror16(a, count, prev);
                            (v, f, "ror")
                        }
                        2 => {
                            let (v, f) = alu::rcl16(a, count, prev);
                            (v, f, "rcl")
                        }
                        3 => {
                            let (v, f) = alu::rcr16(a, count, prev);
                            (v, f, "rcr")
                        }
                        4 | 6 => {
                            let (v, f) = alu::shl16(a, count, prev);
                            (v, f, "shl")
                        }
                        5 => {
                            let (v, f) = alu::shr16(a, count, prev);
                            (v, f, "shr")
                        }
                        _ => {
                            let (v, f) = alu::sar16(a, count, prev);
                            (v, f, "sar")
                        }
                    };
                    self.regs.flags = f;
                    self.write_rm16(modrm, override_seg, v);
                    rec.mnemonic = name;
                }
            }
            // RET imm16 — C2 (near, then SP += imm16).
            0xC2 => {
                let imm = self.fetch_u16();
                self.regs.ip = self.pop_u16();
                self.regs.sp = self.regs.sp.wrapping_add(imm);
                rec.mnemonic = "ret";
            }

            // ---- far calls / jumps and BCD / LDS-LES ----
            // RET far — CB. Pop IP, then CS.
            0xCB => {
                self.regs.ip = self.pop_u16();
                self.regs.cs = self.pop_u16();
                rec.mnemonic = "retf";
            }
            // RET imm16 far — CA.
            0xCA => {
                let imm = self.fetch_u16();
                self.regs.ip = self.pop_u16();
                self.regs.cs = self.pop_u16();
                self.regs.sp = self.regs.sp.wrapping_add(imm);
                rec.mnemonic = "retf";
            }
            // CALL far direct — 9A offsetw segment16: push CS, push IP, jump.
            0x9A => {
                let new_ip = self.fetch_u16();
                let new_cs = self.fetch_u16();
                let ret_ip = self.regs.ip;
                let ret_cs = self.regs.cs;
                self.push_u16(ret_cs);
                self.push_u16(ret_ip);
                self.regs.cs = new_cs;
                self.regs.ip = new_ip;
                rec.mnemonic = "call";
            }
            // JMP far direct — EA offsetw segment16.
            0xEA => {
                let new_ip = self.fetch_u16();
                let new_cs = self.fetch_u16();
                self.regs.cs = new_cs;
                self.regs.ip = new_ip;
                rec.mnemonic = "jmp";
            }

            // LDS r16, m32 — C5 /r: r16 ← [m], DS ← [m+2]
            0xC5 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if let Some(ea) = self.decode_ea(modrm) {
                    let lin = self.linear_for(ea, override_seg);
                    let off = self.mem.read_u16(lin);
                    let seg = self.mem.read_u16(lin.wrapping_add(2));
                    self.write_reg16(Reg16::from_code(reg), off);
                    self.regs.ds = seg;
                    rec.mnemonic = "lds";
                } else {
                    rec.stopped = Some(StopReason::Unimplemented {
                        opcode: op,
                        ip: ip_before,
                    });
                }
            }
            // LES r16, m32 — C4 /r: r16 ← [m], ES ← [m+2]
            0xC4 => {
                let modrm = self.fetch_u8();
                let reg = (modrm >> 3) & 0b111;
                if let Some(ea) = self.decode_ea(modrm) {
                    let lin = self.linear_for(ea, override_seg);
                    let off = self.mem.read_u16(lin);
                    let seg = self.mem.read_u16(lin.wrapping_add(2));
                    self.write_reg16(Reg16::from_code(reg), off);
                    self.regs.es = seg;
                    rec.mnemonic = "les";
                } else {
                    rec.stopped = Some(StopReason::Unimplemented {
                        opcode: op,
                        ip: ip_before,
                    });
                }
            }

            // ---- BCD adjust opcodes ----
            // DAA — Decimal Adjust after Addition.
            0x27 => {
                let mut al = self.regs.al();
                let mut cf = self.regs.flags.get(Flags::CF);
                if (al & 0x0F) > 9 || self.regs.flags.get(Flags::AF) {
                    let (new_al, carry) = al.overflowing_add(0x06);
                    al = new_al;
                    cf = cf || carry;
                    self.regs.flags.set(Flags::AF, true);
                } else {
                    self.regs.flags.set(Flags::AF, false);
                }
                if al > 0x9F || cf {
                    al = al.wrapping_add(0x60);
                    cf = true;
                }
                self.regs.set_al(al);
                self.regs.flags.set(Flags::CF, cf);
                self.regs.flags.set(Flags::ZF, al == 0);
                self.regs.flags.set(Flags::SF, (al & 0x80) != 0);
                self.regs.flags.set(Flags::PF, parity_byte(al));
                rec.mnemonic = "daa";
            }
            // DAS — Decimal Adjust after Subtraction.
            0x2F => {
                let mut al = self.regs.al();
                let mut cf = self.regs.flags.get(Flags::CF);
                if (al & 0x0F) > 9 || self.regs.flags.get(Flags::AF) {
                    let (new_al, borrow) = al.overflowing_sub(0x06);
                    al = new_al;
                    cf = cf || borrow;
                    self.regs.flags.set(Flags::AF, true);
                } else {
                    self.regs.flags.set(Flags::AF, false);
                }
                if al > 0x9F || cf {
                    al = al.wrapping_sub(0x60);
                    cf = true;
                }
                self.regs.set_al(al);
                self.regs.flags.set(Flags::CF, cf);
                self.regs.flags.set(Flags::ZF, al == 0);
                self.regs.flags.set(Flags::SF, (al & 0x80) != 0);
                self.regs.flags.set(Flags::PF, parity_byte(al));
                rec.mnemonic = "das";
            }
            // AAA — ASCII Adjust after Addition.
            0x37 => {
                let mut al = self.regs.al();
                let mut ah = self.regs.ah();
                if (al & 0x0F) > 9 || self.regs.flags.get(Flags::AF) {
                    al = al.wrapping_add(6);
                    ah = ah.wrapping_add(1);
                    self.regs.flags.set(Flags::AF, true);
                    self.regs.flags.set(Flags::CF, true);
                } else {
                    self.regs.flags.set(Flags::AF, false);
                    self.regs.flags.set(Flags::CF, false);
                }
                self.regs.set_al(al & 0x0F);
                self.regs.set_ah(ah);
                rec.mnemonic = "aaa";
            }
            // AAS — ASCII Adjust after Subtraction.
            0x3F => {
                let mut al = self.regs.al();
                let mut ah = self.regs.ah();
                if (al & 0x0F) > 9 || self.regs.flags.get(Flags::AF) {
                    al = al.wrapping_sub(6);
                    ah = ah.wrapping_sub(1);
                    self.regs.flags.set(Flags::AF, true);
                    self.regs.flags.set(Flags::CF, true);
                } else {
                    self.regs.flags.set(Flags::AF, false);
                    self.regs.flags.set(Flags::CF, false);
                }
                self.regs.set_al(al & 0x0F);
                self.regs.set_ah(ah);
                rec.mnemonic = "aas";
            }
            // AAM — ASCII Adjust after Multiplication. Two-byte: D4 imm8 (usually 0x0A).
            0xD4 => {
                let base = self.fetch_u8();
                let al = self.regs.al();
                let Some(quot) = al.checked_div(base) else {
                    rec.stopped = Some(StopReason::DivideError { ip: ip_before });
                    self.regs.ip = ip_before;
                    rec.bytes_consumed = 0;
                    return rec;
                };
                self.regs.set_ah(quot);
                self.regs.set_al(al % base);
                let new_al = self.regs.al();
                self.regs.flags.set(Flags::ZF, new_al == 0);
                self.regs.flags.set(Flags::SF, (new_al & 0x80) != 0);
                self.regs.flags.set(Flags::PF, parity_byte(new_al));
                rec.mnemonic = "aam";
            }
            // AAD — ASCII Adjust before Division. Two-byte: D5 imm8 (usually 0x0A).
            0xD5 => {
                let base = self.fetch_u8();
                let v = (u16::from(self.regs.ah()) * u16::from(base))
                    .wrapping_add(u16::from(self.regs.al()))
                    & 0xFF;
                self.regs.set_al(v as u8);
                self.regs.set_ah(0);
                self.regs.flags.set(Flags::ZF, v == 0);
                self.regs.flags.set(Flags::SF, (v & 0x80) != 0);
                self.regs.flags.set(Flags::PF, parity_byte(v as u8));
                rec.mnemonic = "aad";
            }

            // ---- misc utility opcodes ----
            // CBW (98): sign-extend AL into AH.
            0x98 => {
                self.regs.set_ah(if (self.regs.al() & 0x80) != 0 {
                    0xFF
                } else {
                    0
                });
                rec.mnemonic = "cbw";
            }
            // CWD (99): sign-extend AX into DX.
            0x99 => {
                self.regs.dx = if (self.regs.ax & 0x8000) != 0 {
                    0xFFFF
                } else {
                    0
                };
                rec.mnemonic = "cwd";
            }
            // SAHF (9E): low byte of FLAGS = AH (only the documented bits).
            0x9E => {
                let mask: u16 = Flags::CF | Flags::PF | Flags::AF | Flags::ZF | Flags::SF;
                let hi = self.regs.flags.0 & !mask;
                self.regs.flags.0 = hi | (u16::from(self.regs.ah()) & mask);
                rec.mnemonic = "sahf";
            }
            // LAHF (9F): AH = low byte of FLAGS.
            0x9F => {
                self.regs.set_ah((self.regs.flags.0 & 0xFF) as u8);
                rec.mnemonic = "lahf";
            }
            // XLAT/XLATB (D7): AL = [DS:BX+AL].
            0xD7 => {
                let off = self.regs.bx.wrapping_add(u16::from(self.regs.al()));
                let lin = seg_off(self.read_seg(override_seg.unwrap_or(SegReg::Ds)), off);
                self.regs.set_al(self.mem.read_u8(lin));
                rec.mnemonic = "xlat";
            }

            // ---- port I/O ----
            // IN AL, imm8  — E4 imm8
            // IN AX, imm8  — E5 imm8
            // OUT imm8, AL — E6 imm8
            // OUT imm8, AX — E7 imm8
            0xE4 => {
                let port = u16::from(self.fetch_u8());
                let v = self.port_in_u8(port);
                self.regs.set_al(v);
                rec.mnemonic = "in";
            }
            0xE5 => {
                let port = u16::from(self.fetch_u8());
                self.regs.ax = self.port_in_u16(port);
                rec.mnemonic = "in";
            }
            0xE6 => {
                let port = u16::from(self.fetch_u8());
                self.port_out_u8(port, self.regs.al());
                rec.mnemonic = "out";
            }
            0xE7 => {
                let port = u16::from(self.fetch_u8());
                self.port_out_u16(port, self.regs.ax);
                rec.mnemonic = "out";
            }
            // IN AL, DX (EC) ; IN AX, DX (ED) ; OUT DX, AL (EE) ; OUT DX, AX (EF)
            0xEC => {
                let port = self.regs.dx;
                let v = self.port_in_u8(port);
                self.regs.set_al(v);
                rec.mnemonic = "in";
            }
            0xED => {
                let port = self.regs.dx;
                self.regs.ax = self.port_in_u16(port);
                rec.mnemonic = "in";
            }
            0xEE => {
                self.port_out_u8(self.regs.dx, self.regs.al());
                rec.mnemonic = "out";
            }
            0xEF => {
                self.port_out_u16(self.regs.dx, self.regs.ax);
                rec.mnemonic = "out";
            }

            other => {
                rec.stopped = Some(StopReason::Unimplemented {
                    opcode: other,
                    ip: ip_before,
                });
            }
        }

        if matches!(
            rec.stopped,
            Some(StopReason::Unimplemented { .. } | StopReason::DivideError { .. })
        ) {
            self.regs.ip = ip_before;
        }
        rec.bytes_consumed = (self.regs.ip.wrapping_sub(ip_before)) as u8;
        // Record this step into history. We do it for every step,
        // including HLT/Unimplemented/DivideError, so the user can step
        // back across them.
        if recording {
            let mem_writes = self.mem.take_tracking();
            // Maintain the capacity budget by dropping the oldest
            // snapshot when we're full. VecDeque would be tidier but
            // we already have Vec everywhere and the cost of a Vec
            // shift at the cap boundary is amortized fine.
            if self.history.len() >= self.history_capacity {
                self.history.remove(0);
            }
            let keys_popped = std::mem::take(&mut self.keys_popped_this_step);
            self.history.push(Snapshot {
                regs: regs_before,
                halted: halted_before,
                exit_code: exit_code_before,
                mem_writes,
                stdout_len: stdout_len_before,
                out_log_len: out_log_len_before,
                keys_popped,
            });
        }
        rec
    }

    /// Run until the CPU halts, an unimplemented opcode is hit, or `limit`
    /// steps elapse. Returns the number of steps actually taken.
    pub fn run_until_halt(&mut self, limit: usize) -> usize {
        for n in 0..limit {
            let rec = self.step();
            if rec.stopped.is_some() {
                return n + 1;
            }
        }
        limit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(prog: &[u8]) -> Cpu {
        let mut c = Cpu::new();
        c.load_com(prog);
        c.run_until_halt(1024);
        c
    }

    #[test]
    fn nop_then_hlt() {
        // 90 F4 = nop ; hlt
        let c = run(&[0x90, 0xF4]);
        assert!(c.halted);
        assert_eq!(c.regs.ip, 0x102);
    }

    #[test]
    fn mov_al_imm8() {
        // B0 5A = mov al, 0x5A
        let c = run(&[0xB0, 0x5A, 0xF4]);
        assert_eq!(c.regs.al(), 0x5A);
    }

    #[test]
    fn mov_ax_imm16() {
        // B8 CD AB = mov ax, 0xABCD
        let c = run(&[0xB8, 0xCD, 0xAB, 0xF4]);
        assert_eq!(c.regs.ax, 0xABCD);
    }

    #[test]
    fn mov_reg_to_reg_8bit() {
        // B0 11   = mov al, 0x11
        // 88 C3   = mov bl, al    (88 /r, mod=11, reg=AL(0), rm=BL(3))
        // F4
        let c = run(&[0xB0, 0x11, 0x88, 0xC3, 0xF4]);
        assert_eq!(c.regs.bl(), 0x11);
    }

    #[test]
    fn mov_reg_to_reg_16bit() {
        // B8 34 12 = mov ax, 0x1234
        // 89 C3    = mov bx, ax
        // F4
        let c = run(&[0xB8, 0x34, 0x12, 0x89, 0xC3, 0xF4]);
        assert_eq!(c.regs.bx, 0x1234);
    }

    #[test]
    fn mov_rm_imm_8bit() {
        // C6 C1 7F = mov cl, 0x7F  (C6 /0, mod=11, rm=CL(1))
        let c = run(&[0xC6, 0xC1, 0x7F, 0xF4]);
        assert_eq!(c.regs.cl(), 0x7F);
    }

    #[test]
    fn mov_rm_imm_16bit() {
        // C7 C2 EF BE = mov dx, 0xBEEF
        let c = run(&[0xC7, 0xC2, 0xEF, 0xBE, 0xF4]);
        assert_eq!(c.regs.dx, 0xBEEF);
    }

    #[test]
    fn flag_ops() {
        // F9 = stc, FC = cld, FB = sti, F5 = cmc, F4 = hlt
        let c = run(&[0xF9, 0xFC, 0xFB, 0xF5, 0xF4]);
        assert!(!c.regs.flags.get(Flags::CF), "CMC should clear after STC");
        assert!(!c.regs.flags.get(Flags::DF));
        assert!(c.regs.flags.get(Flags::IF));
    }

    #[test]
    fn unimplemented_opcode_halts_at_ip() {
        // 0x9B (WAIT/FWAIT) is intentionally not implemented and acts as a
        // stable canary for the "park IP at the offending byte" behavior.
        let mut c = Cpu::new();
        c.load_com(&[0x9B]);
        let rec = c.step();
        assert!(matches!(
            rec.stopped,
            Some(StopReason::Unimplemented { .. })
        ));
        assert_eq!(c.regs.ip, 0x100);
    }

    #[test]
    fn mov_to_memory_via_bx() {
        // mov bx, 0x0200 ; mov al, 0xAA ; mov [bx], al ; hlt
        // BB 00 02   88 07   F4
        // 88 /reg=AL(0)/rm=[BX](7) → modrm = 0b00000111 = 0x07
        let c = run(&[0xBB, 0x00, 0x02, 0xB0, 0xAA, 0x88, 0x07, 0xF4]);
        assert_eq!(c.regs.bx, 0x0200);
        let lin = seg_off(c.regs.ds, 0x0200);
        assert_eq!(c.mem.read_u8(lin), 0xAA);
    }

    #[test]
    fn mov_from_memory_with_disp8() {
        // Set ds:[bx+4] = 0x42 directly, then read it via mov al, [bx+4].
        let mut c = Cpu::new();
        c.load_com(&[
            0xBB, 0x10, 0x00, // mov bx, 0x0010
            0x8A, 0x47, 0x04, // mov al, [bx+4]   (mod=01, reg=AL, rm=[BX])
            0xF4,
        ]);
        c.mem.write_u8(seg_off(c.regs.ds, 0x14), 0x42);
        c.run_until_halt(64);
        assert_eq!(c.regs.al(), 0x42);
    }

    #[test]
    fn mov_via_direct_address() {
        // mov ax, [0x0234]  →  A1 34 02 ; we pre-place 0xC0DE at DS:0x0234.
        let mut c = Cpu::new();
        c.load_com(&[0xA1, 0x34, 0x02, 0xF4]);
        c.mem.write_u16(seg_off(c.regs.ds, 0x0234), 0xC0DE);
        c.run_until_halt(64);
        assert_eq!(c.regs.ax, 0xC0DE);
    }

    #[test]
    fn bp_addressing_uses_ss_by_default() {
        // mov bp, 0x0050 ; mov al, [bp]  → reads from SS:0x0050, not DS:0x0050.
        let mut c = Cpu::new();
        c.load_com(&[
            0xBD, 0x50, 0x00, // mov bp, 0x0050
            0x8A, 0x46, 0x00, // mov al, [bp+0]  (mod=01, rm=[BP])
            0xF4,
        ]);
        // SS = DS = 0x0700 at load_com, so write at DS to confirm we read from SS.
        // Actually since SS == DS here, plant the byte at SS:0x0050 explicitly.
        c.mem.write_u8(seg_off(c.regs.ss, 0x0050), 0x77);
        c.run_until_halt(64);
        assert_eq!(c.regs.al(), 0x77);
    }

    #[test]
    fn segment_override_es_changes_target() {
        // ES = 0x0900, DS = 0x0700 (default for load_com).
        // Plant a sentinel at DS:0x0040 and a different one at ES:0x0040.
        // mov al, es:[bx]  with bx=0x0040 should pick up the ES sentinel.
        let mut c = Cpu::new();
        c.load_com(&[
            0xBB, 0x40, 0x00, // mov bx, 0x0040
            0x26, 0x8A, 0x07, // es: mov al, [bx]
            0xF4,
        ]);
        c.regs.es = 0x0900;
        c.mem.write_u8(seg_off(c.regs.ds, 0x0040), 0x11);
        c.mem.write_u8(seg_off(c.regs.es, 0x0040), 0x99);
        c.run_until_halt(64);
        assert_eq!(c.regs.al(), 0x99);
    }

    #[test]
    fn lea_computes_offset_only() {
        // mov bx, 0x0020 ; mov si, 0x0003 ; lea ax, [bx+si+0x10] ; hlt
        // LEA opcode 8D, reg=AX(0), mod=01, rm=[BX+SI](0) → modrm = 0x40, disp8=0x10
        let c = run(&[0xBB, 0x20, 0x00, 0xBE, 0x03, 0x00, 0x8D, 0x40, 0x10, 0xF4]);
        assert_eq!(c.regs.ax, 0x0033);
    }

    #[test]
    fn xchg_ax_with_reg() {
        // mov ax, 0x1111 ; mov bx, 0x2222 ; xchg ax, bx (93) ; hlt
        let c = run(&[0xB8, 0x11, 0x11, 0xBB, 0x22, 0x22, 0x93, 0xF4]);
        assert_eq!(c.regs.ax, 0x2222);
        assert_eq!(c.regs.bx, 0x1111);
    }

    #[test]
    fn mov_segreg_round_trip() {
        // mov ax, 0x1234 ; mov es, ax ; mov bx, es ; hlt
        // 8E /reg=ES(0)/rm=AX(0,mod=11) → 8E C0
        // 8C /reg=ES(0)/rm=BX(3,mod=11) → 8C C3
        let c = run(&[0xB8, 0x34, 0x12, 0x8E, 0xC0, 0x8C, 0xC3, 0xF4]);
        assert_eq!(c.regs.es, 0x1234);
        assert_eq!(c.regs.bx, 0x1234);
    }

    // ---- arithmetic opcodes (M1.3) ----

    #[test]
    fn add_al_imm8() {
        // 04 22 = add al, 0x22
        let c = run(&[0xB0, 0x10, 0x04, 0x22, 0xF4]);
        assert_eq!(c.regs.al(), 0x32);
        // 0x32 = 0b00110010 → 3 ones → odd → PF=0; ZF=SF=CF=OF=0.
        assert!(!c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn add_ax_imm16_carries() {
        // mov ax, 0xFFFF ; add ax, 1 ; hlt → AX=0, ZF=1, CF=1
        let c = run(&[0xB8, 0xFF, 0xFF, 0x05, 0x01, 0x00, 0xF4]);
        assert_eq!(c.regs.ax, 0);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn sub_reg_reg_borrows() {
        // mov al, 5 ; sub al, 6 (28 /reg=Bl(3)/rm=AL(0)?) — easier: 2C imm form.
        // 2C 06 = sub al, 6
        let c = run(&[0xB0, 0x05, 0x2C, 0x06, 0xF4]);
        assert_eq!(c.regs.al(), 0xFF);
        assert!(c.regs.flags.get(Flags::CF));
        assert!(c.regs.flags.get(Flags::SF));
    }

    #[test]
    fn cmp_does_not_write_back() {
        // mov ax, 5 ; cmp ax, 5 ; hlt → AX still 5, ZF set, CF clear.
        let c = run(&[0xB8, 0x05, 0x00, 0x3D, 0x05, 0x00, 0xF4]);
        assert_eq!(c.regs.ax, 5);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn and_clears_cf_of_and_sets_zf_when_zero() {
        // mov al, 0xF0 ; and al, 0x0F ; hlt
        // and al, imm8 → 24 0F
        let c = run(&[0xB0, 0xF0, 0x24, 0x0F, 0xF4]);
        assert_eq!(c.regs.al(), 0);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
        assert!(!c.regs.flags.get(Flags::OF));
    }

    #[test]
    fn or_xor_set_correct_result() {
        // mov al, 0xAA ; or al, 0x55 → 0xFF ; xor al, 0x0F → 0xF0
        // OR al,imm8 = 0C ; XOR al,imm8 = 34
        let c = run(&[0xB0, 0xAA, 0x0C, 0x55, 0x34, 0x0F, 0xF4]);
        assert_eq!(c.regs.al(), 0xF0);
    }

    #[test]
    fn inc_reg_preserves_cf() {
        // stc ; mov ax, 0x7FFF ; inc ax ; hlt → AX=0x8000, OF=1, SF=1, CF preserved.
        let c = run(&[0xF9, 0xB8, 0xFF, 0x7F, 0x40, 0xF4]);
        assert_eq!(c.regs.ax, 0x8000);
        assert!(c.regs.flags.get(Flags::OF));
        assert!(c.regs.flags.get(Flags::SF));
        assert!(c.regs.flags.get(Flags::CF), "INC must not clobber CF");
    }

    #[test]
    fn dec_reg_preserves_cf() {
        // stc ; mov ax, 1 ; dec ax ; hlt → AX=0, ZF=1, CF still 1.
        let c = run(&[0xF9, 0xB8, 0x01, 0x00, 0x48, 0xF4]);
        assert_eq!(c.regs.ax, 0);
        assert!(c.regs.flags.get(Flags::ZF));
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn neg_nonzero_sets_cf() {
        // mov al, 5 ; neg al ; hlt → AL=0xFB, CF=1
        // F6 /3 mod=11 rm=AL(0) → F6 D8
        let c = run(&[0xB0, 0x05, 0xF6, 0xD8, 0xF4]);
        assert_eq!(c.regs.al(), 0xFB);
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn not_does_not_touch_flags() {
        // stc ; mov al, 0xAA ; not al ; hlt → AL=0x55, CF still 1.
        // F6 /2 mod=11 rm=AL(0) → F6 D0
        let c = run(&[0xF9, 0xB0, 0xAA, 0xF6, 0xD0, 0xF4]);
        assert_eq!(c.regs.al(), 0x55);
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn alu_imm_form_with_sign_extension() {
        // 83 /5 (SUB r/m16, imm8 sign-extended) — sub bx, -1 → bx + 1.
        // mov bx, 0x1000 ; sub bx, 0xFF (−1) ; hlt → bx = 0x1001
        // 83 EB FF: 83 /5 rm=BX(3) mod=11 → modrm 0xEB
        let c = run(&[0xBB, 0x00, 0x10, 0x83, 0xEB, 0xFF, 0xF4]);
        assert_eq!(c.regs.bx, 0x1001);
    }

    #[test]
    fn test_does_not_modify_operand() {
        // mov al, 0x80 ; test al, 0x80 ; hlt → SF=1, ZF=0, CF=0.
        let c = run(&[0xB0, 0x80, 0xA8, 0x80, 0xF4]);
        assert_eq!(c.regs.al(), 0x80);
        assert!(c.regs.flags.get(Flags::SF));
        assert!(!c.regs.flags.get(Flags::ZF));
        assert!(!c.regs.flags.get(Flags::CF));
    }

    // ---- M1 close-out: far calls/jumps, BCD, LDS/LES ----

    #[test]
    fn far_jmp_sets_cs_and_ip() {
        // EA <off> <seg> — jmp 0x0800:0x0050
        let mut c = Cpu::new();
        c.load_com(&[0xEA, 0x50, 0x00, 0x00, 0x08, 0xF4]);
        // Plant a HLT at 0x0800:0x0050 so the program ends after the jump.
        c.mem.write_u8(seg_off(0x0800, 0x0050), 0xF4);
        c.run_until_halt(64);
        assert_eq!(c.regs.cs, 0x0800);
        // After hlt at 0x0800:0x0050, IP = 0x0051.
        assert_eq!(c.regs.ip, 0x0051);
    }

    #[test]
    fn call_far_and_retf_round_trip() {
        // mov ax, 0x1111 ; call 0x0800:0x0050 ; mov bx, 0x2222 ; hlt
        // At 0x0800:0x0050 we plant: mov dx, 0x9999 ; retf
        let mut c = Cpu::new();
        c.load_com(&[
            0xB8, 0x11, 0x11, // mov ax, 0x1111
            0x9A, 0x50, 0x00, 0x00, 0x08, // call far 0800:0050
            0xBB, 0x22, 0x22, // mov bx, 0x2222
            0xF4, // hlt
        ]);
        // Far function: mov dx, 0x9999 ; retf
        c.mem.write_u8(seg_off(0x0800, 0x0050), 0xBA);
        c.mem.write_u8(seg_off(0x0800, 0x0051), 0x99);
        c.mem.write_u8(seg_off(0x0800, 0x0052), 0x99);
        c.mem.write_u8(seg_off(0x0800, 0x0053), 0xCB);
        c.run_until_halt(64);
        assert_eq!(c.regs.ax, 0x1111);
        assert_eq!(c.regs.dx, 0x9999); // far function ran
        assert_eq!(c.regs.bx, 0x2222); // returned to caller
        assert_eq!(c.regs.sp, 0xFFFE); // SP balanced
    }

    #[test]
    fn lds_loads_offset_and_ds() {
        // mov bx, 0x0200 ; lds si, [bx] ; hlt
        // At DS:0x0200 we plant offset 0x4321 then segment 0x0900.
        // Encoding LDS = C5 /r — reg=SI(6) rm=[BX](7) mod=00 → C5 37
        let mut c = Cpu::new();
        c.load_com(&[
            0xBB, 0x00, 0x02, // mov bx, 0x0200
            0xC5, 0x37, // lds si, [bx]
            0xF4,
        ]);
        c.mem.write_u16(seg_off(c.regs.ds, 0x0200), 0x4321);
        c.mem.write_u16(seg_off(c.regs.ds, 0x0202), 0x0900);
        c.run_until_halt(64);
        assert_eq!(c.regs.si, 0x4321);
        assert_eq!(c.regs.ds, 0x0900);
    }

    #[test]
    fn les_loads_offset_and_es() {
        let mut c = Cpu::new();
        c.load_com(&[
            0xBB, 0x00, 0x02, // mov bx, 0x0200
            0xC4, 0x3F, // les di, [bx] (reg=DI(7), rm=[BX](7), mod=00)
            0xF4,
        ]);
        c.mem.write_u16(seg_off(c.regs.ds, 0x0200), 0xABCD);
        c.mem.write_u16(seg_off(c.regs.ds, 0x0202), 0x0A00);
        c.run_until_halt(64);
        assert_eq!(c.regs.di, 0xABCD);
        assert_eq!(c.regs.es, 0x0A00);
    }

    #[test]
    fn aam_and_aad_are_complementary() {
        // AAM 10: split AL into AH:AL of (AL/10, AL%10).
        // mov ax, 0x0023 ; aam ; hlt → AH=3, AL=5 (35 / 10 = 3 r 5)
        let c = run(&[0xB8, 0x23, 0x00, 0xD4, 0x0A, 0xF4]);
        assert_eq!(c.regs.ah(), 3);
        assert_eq!(c.regs.al(), 5);
        // AAD 10: AL = AH*10 + AL, AH = 0.
        // mov ax, 0x0305 ; aad ; hlt → AL=35, AH=0
        let c2 = run(&[0xB8, 0x05, 0x03, 0xD5, 0x0A, 0xF4]);
        assert_eq!(c2.regs.al(), 35);
        assert_eq!(c2.regs.ah(), 0);
    }

    #[test]
    fn daa_adjusts_after_bcd_addition() {
        // mov al, 0x29 ; add al, 0x18 ; daa ; hlt
        // 0x29 + 0x18 = 0x41. Low nibble is 0x1 (no fix needed). High
        // nibble: 0x4. AF was set during the add (9+8>0xF) — wait,
        // 0x29 + 0x18 = 0x41 with AF=1 since (9+8)>0xF.
        // DAA: low nibble 1 ≤ 9 but AF=1 → add 6 → 0x47.
        // High 4 ≤ 9 and CF=0 → no further fix.
        // Result: AL = 0x47. (Decimal: 29 + 18 = 47. ✓)
        let c = run(&[0xB0, 0x29, 0x04, 0x18, 0x27, 0xF4]);
        assert_eq!(c.regs.al(), 0x47);
    }

    // ---- step_back / time-travel (M4.1) ----

    #[test]
    fn step_back_undoes_register_changes() {
        let mut c = Cpu::new();
        c.set_history_capacity(64);
        c.load_com(&[0xB8, 0x34, 0x12, 0xBB, 0x78, 0x56, 0xF4]);
        // mov ax, 0x1234 ; mov bx, 0x5678 ; hlt
        c.step(); // mov ax
        c.step(); // mov bx
        assert_eq!(c.regs.ax, 0x1234);
        assert_eq!(c.regs.bx, 0x5678);
        assert!(c.step_back()); // undo mov bx
        assert_eq!(c.regs.bx, 0);
        assert_eq!(c.regs.ax, 0x1234);
        assert!(c.step_back()); // undo mov ax
        assert_eq!(c.regs.ax, 0);
        assert!(!c.step_back()); // empty history
    }

    #[test]
    fn step_back_undoes_memory_writes() {
        let mut c = Cpu::new();
        c.set_history_capacity(64);
        c.load_com(&[
            0xBB, 0x00, 0x02, // mov bx, 0x0200
            0xB0, 0xAA, // mov al, 0xAA
            0x88, 0x07, // mov [bx], al
            0xF4,
        ]);
        c.run_until_halt(64);
        let lin = seg_off(c.regs.ds, 0x0200);
        assert_eq!(c.mem.read_u8(lin), 0xAA);
        // Roll back the store: byte at DS:0x0200 should revert to 0.
        c.step_back(); // hlt
        assert!(c.step_back()); // mov [bx], al — the actual write
        assert_eq!(c.mem.read_u8(lin), 0);
    }

    #[test]
    fn step_back_undoes_stdout_emission() {
        let mut c = Cpu::new();
        c.set_history_capacity(64);
        c.load_com(&[
            0xB4, 0x02, // mov ah, 02h
            0xB2, b'X', // mov dl, 'X'
            0xCD, 0x21, // int 21h
            0xF4,
        ]);
        c.run_until_halt(64);
        assert_eq!(c.stdout, b"X");
        c.step_back(); // hlt
        assert!(c.step_back()); // int 21h — must trim the X off stdout
        assert_eq!(c.stdout, b"");
    }

    #[test]
    fn history_capacity_is_a_hard_cap() {
        let mut c = Cpu::new();
        c.set_history_capacity(2);
        // Three independent register writes.
        c.load_com(&[0xB0, 0x01, 0xB0, 0x02, 0xB0, 0x03, 0xF4]);
        for _ in 0..3 {
            c.step();
        }
        assert_eq!(c.history.len(), 2);
        // We can only step back twice; the first write is lost to the cap.
        assert!(c.step_back());
        assert!(c.step_back());
        assert!(!c.step_back());
    }

    // ---- M1.8: MUL/DIV, IN/OUT, misc utility opcodes ----

    #[test]
    fn mul_r_m8_sets_cf_when_high_byte_nonzero() {
        // mov al, 200 ; mov bl, 5 ; mul bl ; hlt
        // F6 /4 mod=11 rm=BL(3) → modrm 0xE3
        let c = run(&[0xB0, 0xC8, 0xB3, 0x05, 0xF6, 0xE3, 0xF4]);
        assert_eq!(c.regs.ax, 1000);
        assert!(c.regs.flags.get(Flags::CF));
        assert!(c.regs.flags.get(Flags::OF));
    }

    #[test]
    fn imul_r_m8_negative_result() {
        // mov al, -2 ; mov bl, 3 ; imul bl ; hlt → AX = -6 = 0xFFFA
        let c = run(&[0xB0, 0xFE, 0xB3, 0x03, 0xF6, 0xEB, 0xF4]);
        assert_eq!(c.regs.ax, 0xFFFA);
    }

    #[test]
    fn div_r_m16_dx_ax_pair() {
        // mov dx, 0 ; mov ax, 1000 ; mov bx, 7 ; div bx ; hlt
        // F7 /6 rm=BX(3) → 0xF3
        let c = run(&[
            0xBA, 0x00, 0x00, 0xB8, 0xE8, 0x03, 0xBB, 0x07, 0x00, 0xF7, 0xF3, 0xF4,
        ]);
        assert_eq!(c.regs.ax, 142); // 1000 / 7
        assert_eq!(c.regs.dx, 6); // 1000 % 7
    }

    #[test]
    fn div_by_zero_traps() {
        // mov ax, 100 ; mov bl, 0 ; div bl ; hlt — should stop with DivideError.
        let mut c = Cpu::new();
        c.load_com(&[0xB8, 0x64, 0x00, 0xB3, 0x00, 0xF6, 0xF3, 0xF4]);
        let mut last = StepRecord::default();
        for _ in 0..10 {
            last = c.step();
            if last.stopped.is_some() {
                break;
            }
        }
        assert!(matches!(last.stopped, Some(StopReason::DivideError { .. })));
    }

    #[test]
    fn cbw_sign_extends_al() {
        // mov al, 0x80 ; cbw ; hlt → AX = 0xFF80
        let c = run(&[0xB0, 0x80, 0x98, 0xF4]);
        assert_eq!(c.regs.ax, 0xFF80);
    }

    #[test]
    fn cwd_sign_extends_ax() {
        // mov ax, 0x8001 ; cwd ; hlt → DX = 0xFFFF
        let c = run(&[0xB8, 0x01, 0x80, 0x99, 0xF4]);
        assert_eq!(c.regs.dx, 0xFFFF);
    }

    #[test]
    fn lahf_loads_low_flags_into_ah() {
        // stc ; lahf ; hlt — AH should have CF bit set.
        let c = run(&[0xF9, 0x9F, 0xF4]);
        assert_eq!(c.regs.ah() & 0x01, 0x01);
    }

    #[test]
    fn out_logs_port_writes() {
        // mov al, 0x42 ; out 0x64, al ; hlt
        let c = run(&[0xB0, 0x42, 0xE6, 0x64, 0xF4]);
        assert_eq!(
            c.out_log,
            vec![PortWrite {
                port: 0x64,
                value: 0x42,
                width: 8
            }]
        );
        assert_eq!(c.ports[0x64], 0x42);
    }

    #[test]
    fn in_reads_port_bytes() {
        // Use a generic port (not 0x60/0x64, which are keyboard ports
        // with FIFO/status semantics).
        let mut c = Cpu::new();
        c.load_com(&[0xE4, 0x80, 0xF4]); // in al, 0x80 ; hlt
        c.ports[0x80] = 0x99;
        c.run_until_halt(16);
        assert_eq!(c.regs.al(), 0x99);
    }

    #[test]
    fn in_al_60_drains_key_buffer() {
        // push two keys, IN AL, 0x60 twice should yield them in order.
        let mut c = Cpu::new();
        c.push_key(b'A');
        c.push_key(b'B');
        c.load_com(&[
            0xE4, 0x60, // in al, 0x60   → AL='A'
            0x88, 0xC4, // mov ah, al    (preserve first key in AH)
            0xE4, 0x60, // in al, 0x60   → AL='B'
            0xF4, // hlt
        ]);
        c.run_until_halt(16);
        assert_eq!(c.regs.ah(), b'A');
        assert_eq!(c.regs.al(), b'B');
        assert!(c.key_buffer.is_empty());
    }

    #[test]
    fn in_al_60_returns_zero_when_buffer_empty() {
        let mut c = Cpu::new();
        c.load_com(&[0xE4, 0x60, 0xF4]); // in al, 0x60 ; hlt
        c.run_until_halt(16);
        assert_eq!(c.regs.al(), 0);
    }

    #[test]
    fn in_al_64_reports_keyboard_status_bit() {
        let mut c = Cpu::new();
        // First read with empty buffer (status=0), then with one key
        // pending (status=1). Use BL to capture the empty case.
        c.load_com(&[
            0xE4, 0x64, // in al, 0x64   → AL=0
            0x88, 0xC3, // mov bl, al
            0xF4, // hlt
        ]);
        c.run_until_halt(16);
        assert_eq!(c.regs.bl(), 0);
        c.push_key(b'X');
        c.regs.ip = 0x100; // restart from program top
        c.halted = false;
        c.run_until_halt(16);
        assert_eq!(c.regs.al(), 1);
        // The status read does NOT consume the byte; it's still pending.
        assert_eq!(c.key_buffer.front().copied(), Some(b'X'));
    }

    #[test]
    fn step_back_restores_consumed_key() {
        // in al, 0x60 ; hlt — but with history recording enabled, we
        // step once to consume the key, then step_back, then verify
        // the key is restored to the FIFO front.
        let mut c = Cpu::new();
        c.set_history_capacity(8);
        c.push_key(b'Z');
        c.load_com(&[0xE4, 0x60, 0xF4]);
        c.step();
        assert_eq!(c.regs.al(), b'Z');
        assert!(c.key_buffer.is_empty());
        assert!(c.step_back());
        assert_eq!(c.key_buffer.front().copied(), Some(b'Z'));
    }

    #[test]
    fn int21_fn01_drains_keyboard_fifo_and_echoes() {
        // mov ah, 1 ; int 21h ; hlt — with 'Q' pre-pushed.
        let mut c = Cpu::new();
        c.push_key(b'Q');
        c.load_com(&[0xB4, 0x01, 0xCD, 0x21, 0xF4]);
        c.run_until_halt(16);
        assert_eq!(c.regs.al(), b'Q');
        assert_eq!(c.stdout, b"Q");
    }

    #[test]
    fn int16_fn00_blocking_read_drains_buffer() {
        // mov ah, 0 ; int 16h ; hlt — pulls AL='K' / AH=0.
        let mut c = Cpu::new();
        c.push_key(b'K');
        c.load_com(&[0xB4, 0x00, 0xCD, 0x16, 0xF4]);
        c.run_until_halt(16);
        assert_eq!(c.regs.al(), b'K');
        assert_eq!(c.regs.ah(), 0);
    }

    #[test]
    fn int16_fn01_peek_reports_zf_and_does_not_consume() {
        // mov ah, 1 ; int 16h ; hlt — twice: empty then with 'p'.
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x01, 0xCD, 0x16, 0xF4]);
        c.run_until_halt(16);
        assert!(c.regs.flags.get(Flags::ZF));
        c.push_key(b'p');
        c.regs.ip = 0x100;
        c.halted = false;
        c.run_until_halt(16);
        assert!(!c.regs.flags.get(Flags::ZF));
        assert_eq!(c.regs.al(), b'p');
        // peek does not pop.
        assert_eq!(c.key_buffer.front().copied(), Some(b'p'));
    }

    #[test]
    fn xlat_indexes_table_via_bx_al() {
        // mov bx, 0x0900 ; mov al, 3 ; xlat ; hlt
        let mut c = Cpu::new();
        c.load_com(&[0xBB, 0x00, 0x09, 0xB0, 0x03, 0xD7, 0xF4]);
        for (i, b) in [10u8, 20, 30, 40, 50].iter().enumerate() {
            c.mem.write_u8(seg_off(c.regs.ds, 0x0900 + i as u16), *b);
        }
        c.run_until_halt(16);
        assert_eq!(c.regs.al(), 40);
    }

    // ---- string ops (M1.7) ----

    #[test]
    fn movsb_with_rep_copies_bytes() {
        let mut c = Cpu::new();
        c.load_com(&[
            0xBE, 0x00, 0x02, // mov si, 0x0200
            0xBF, 0x00, 0x03, // mov di, 0x0300
            0xB9, 0x05, 0x00, // mov cx, 5
            0xFC, // cld
            0xF3, 0xA4, // rep movsb
            0xF4, // hlt
        ]);
        for (i, b) in b"hello".iter().enumerate() {
            c.mem.write_u8(seg_off(c.regs.ds, 0x0200 + i as u16), *b);
        }
        c.run_until_halt(64);
        let mut out = [0u8; 5];
        for (i, slot) in out.iter_mut().enumerate() {
            *slot = c.mem.read_u8(seg_off(c.regs.es, 0x0300 + i as u16));
        }
        assert_eq!(&out, b"hello");
        assert_eq!(c.regs.cx, 0);
        assert_eq!(c.regs.si, 0x0205);
        assert_eq!(c.regs.di, 0x0305);
    }

    #[test]
    fn stosb_with_rep_fills_buffer() {
        let mut c = Cpu::new();
        c.load_com(&[
            0xB0, b'X', 0xBF, 0x00, 0x04, 0xB9, 0x04, 0x00, 0xFC, 0xF3, 0xAA, 0xF4,
        ]);
        c.run_until_halt(64);
        for i in 0..4 {
            assert_eq!(
                c.mem.read_u8(seg_off(c.regs.es, 0x0400 + i)),
                b'X',
                "byte {i}"
            );
        }
        assert_eq!(c.regs.cx, 0);
    }

    #[test]
    fn lodsb_decrements_si_when_df_set() {
        let mut c = Cpu::new();
        c.load_com(&[0xFD, 0xBE, 0x00, 0x05, 0xAC, 0xF4]);
        c.mem.write_u8(seg_off(c.regs.ds, 0x0500), 0x42);
        c.run_until_halt(64);
        assert_eq!(c.regs.al(), 0x42);
        assert_eq!(c.regs.si, 0x04FF);
    }

    #[test]
    fn repe_cmpsb_stops_on_mismatch() {
        let mut c = Cpu::new();
        c.load_com(&[
            0xBE, 0x00, 0x06, // mov si, 0x0600
            0xBF, 0x00, 0x07, // mov di, 0x0700
            0xB9, 0x06, 0x00, // mov cx, 6
            0xFC, // cld
            0xF3, 0xA6, // repe cmpsb
            0xF4, // hlt
        ]);
        for (i, b) in b"abcXef".iter().enumerate() {
            c.mem.write_u8(seg_off(c.regs.ds, 0x0600 + i as u16), *b);
        }
        for (i, b) in b"abcdef".iter().enumerate() {
            c.mem.write_u8(seg_off(c.regs.es, 0x0700 + i as u16), *b);
        }
        c.run_until_halt(64);
        // a,b,c match (CX 6→3), X≠d on iter 4 (CX 3→2 then break), so CX = 2.
        assert_eq!(c.regs.cx, 2);
        assert!(!c.regs.flags.get(Flags::ZF));
    }

    #[test]
    fn scasb_finds_terminator() {
        // strlen via SCASB: AL=0; REPNE SCASB ends on the null terminator.
        let mut c = Cpu::new();
        c.load_com(&[
            0xB0, 0x00, // mov al, 0
            0xBF, 0x00, 0x08, // mov di, 0x0800
            0xB9, 0xFF, 0xFF, // mov cx, 0xFFFF
            0xFC, // cld
            0xF2, 0xAE, // repne scasb
            0xF4, // hlt
        ]);
        for (i, b) in b"world\0".iter().enumerate() {
            c.mem.write_u8(seg_off(c.regs.es, 0x0800 + i as u16), *b);
        }
        c.run_until_halt(64);
        // CX dropped from 0xFFFF by 6 (5 letters + terminator).
        assert_eq!(c.regs.cx, 0xFFF9);
        assert!(c.regs.flags.get(Flags::ZF));
    }

    // ---- INT 21h DOS subset (M1.6) ----

    #[test]
    fn int21_putc_writes_to_stdout() {
        // mov ah, 02h ; mov dl, 'A' ; int 21h ; mov ah, 4Ch ; int 21h
        let c = run(&[0xB4, 0x02, 0xB2, b'A', 0xCD, 0x21, 0xB4, 0x4C, 0xCD, 0x21]);
        assert!(c.halted);
        assert_eq!(c.stdout, b"A");
        assert_eq!(c.exit_code, Some(0));
    }

    #[test]
    fn int21_puts_prints_until_dollar() {
        // mov ah, 09h ; mov dx, 0x200 ; int 21h ; int 20h
        // Place the string at DS:0x0200 manually.
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x09, 0xBA, 0x00, 0x02, 0xCD, 0x21, 0xCD, 0x20]);
        for (i, b) in b"Hello, world!$".iter().enumerate() {
            c.mem.write_u8(seg_off(c.regs.ds, 0x0200 + i as u16), *b);
        }
        c.run_until_halt(64);
        assert!(c.halted);
        assert_eq!(c.stdout, b"Hello, world!");
    }

    #[test]
    fn int21_exit_4c_carries_al_as_exit_code() {
        // mov ax, 4C2A ; int 21h
        let c = run(&[0xB8, 0x2A, 0x4C, 0xCD, 0x21]);
        assert!(c.halted);
        assert_eq!(c.exit_code, Some(0x2A));
    }

    #[test]
    fn int20_terminates() {
        let c = run(&[0xCD, 0x20]);
        assert!(c.halted);
        assert_eq!(c.exit_code, Some(0));
    }

    // ---- INT 21h additions for PR 2 (GAP-100, 101, 102, 103) ----

    #[test]
    fn int21_ah08_reads_char_without_echo() {
        // mov ah, 08h ; int 21h ; hlt — pre-push 'X' so the call drains.
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x08, 0xCD, 0x21, 0xF4]);
        c.push_key(b'X');
        c.run_until_halt(16);
        assert!(c.halted);
        assert_eq!(c.regs.al(), b'X', "AL should hold the keystroke");
        assert!(
            c.stdout.is_empty(),
            "AH=08h must not echo to stdout, got {:?}",
            c.stdout
        );
    }

    #[test]
    fn int21_ah08_returns_zero_when_buffer_empty() {
        // No pre-pushed key: AL should come back 0 (we don't block).
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x08, 0xCD, 0x21, 0xF4]);
        c.run_until_halt(16);
        assert!(c.halted);
        assert_eq!(c.regs.al(), 0);
    }

    #[test]
    fn int21_ah0a_buffered_input_writes_count_and_terminator() {
        // mov ah, 0Ah ; mov dx, 0x200 ; int 21h ; int 20h
        // Buffer at DS:0x200 with max=8. Pre-push "hi\r" so the drain
        // sees an explicit CR end-of-input.
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x0A, 0xBA, 0x00, 0x02, 0xCD, 0x21, 0xCD, 0x20]);
        c.mem.write_u8(seg_off(c.regs.ds, 0x0200), 8); // max byte
        c.push_key(b'h');
        c.push_key(b'i');
        c.push_key(0x0D); // CR ends input
        c.run_until_halt(64);
        assert!(c.halted);
        // buffer[1] = actual count = 2 (CR not counted).
        assert_eq!(c.mem.read_u8(seg_off(c.regs.ds, 0x0201)), 2);
        // buffer[2..4] = "hi", buffer[4] = CR.
        assert_eq!(c.mem.read_u8(seg_off(c.regs.ds, 0x0202)), b'h');
        assert_eq!(c.mem.read_u8(seg_off(c.regs.ds, 0x0203)), b'i');
        assert_eq!(c.mem.read_u8(seg_off(c.regs.ds, 0x0204)), 0x0D);
        // stdout echoes the input including the CR.
        assert_eq!(c.stdout, b"hi\r");
    }

    #[test]
    fn int21_ah0a_respects_capacity_when_user_overruns() {
        // Capacity=4 means at most 3 bytes before the mandatory CR. If
        // the user pre-pushes "abcdef\r" the call must stop at 3 bytes
        // and silently drop the rest.
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x0A, 0xBA, 0x00, 0x02, 0xCD, 0x21, 0xCD, 0x20]);
        c.mem.write_u8(seg_off(c.regs.ds, 0x0200), 4);
        for &b in b"abcdef" {
            c.push_key(b);
        }
        c.push_key(0x0D);
        c.run_until_halt(64);
        assert!(c.halted);
        assert_eq!(c.mem.read_u8(seg_off(c.regs.ds, 0x0201)), 3);
        assert_eq!(c.mem.read_u8(seg_off(c.regs.ds, 0x0205)), 0x0D);
        assert_eq!(c.stdout, b"abc\r");
    }

    #[test]
    fn int21_ah2a_returns_default_clock_date() {
        // Default clock is 2024-01-01 Monday.
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x2A, 0xCD, 0x21, 0xF4]);
        c.run_until_halt(16);
        assert!(c.halted);
        assert_eq!(c.regs.cx, 2024);
        assert_eq!(c.regs.dh(), 1);
        assert_eq!(c.regs.dl(), 1);
        assert_eq!(c.regs.al(), 1, "default clock day_of_week is Monday=1");
    }

    #[test]
    fn int21_ah2c_returns_default_clock_time() {
        // Default clock is 12:00:00.00.
        let mut c = Cpu::new();
        c.load_com(&[0xB4, 0x2C, 0xCD, 0x21, 0xF4]);
        c.run_until_halt(16);
        assert!(c.halted);
        assert_eq!(c.regs.ch(), 12);
        assert_eq!(c.regs.cl(), 0);
        assert_eq!(c.regs.dh(), 0);
        assert_eq!(c.regs.dl(), 0);
    }

    #[test]
    fn int21_set_clock_propagates_to_2a_and_2c() {
        // Host overrides the clock to 2026-05-08 Friday at 14:30:45.50;
        // both AH=2Ah and AH=2Ch must reflect it.
        let mut c = Cpu::new();
        c.set_clock(Clock {
            year: 2026,
            month: 5,
            day: 8,
            day_of_week: 5,
            hour: 14,
            minute: 30,
            second: 45,
            hundredths: 50,
        });
        c.load_com(&[0xB4, 0x2A, 0xCD, 0x21, 0xB4, 0x2C, 0xCD, 0x21, 0xF4]);
        c.run_until_halt(64);
        assert!(c.halted);
        // After AH=2Ah ran first, then AH=2Ch overwrote DH/DL with the
        // time fields. CX still carries the time (CH=hour, CL=minute).
        assert_eq!(c.regs.ch(), 14);
        assert_eq!(c.regs.cl(), 30);
        assert_eq!(c.regs.dh(), 45);
        assert_eq!(c.regs.dl(), 50);
    }

    // ---- shifts and rotates (M1.5) ----

    #[test]
    fn shl_al_by_1() {
        // mov al, 0x81 ; shl al, 1 ; hlt   →  AL = 0x02, CF=1, OF=1
        // SHL r/m8, 1 = D0 /4 ; mod=11 rm=AL → modrm 0xE0
        let c = run(&[0xB0, 0x81, 0xD0, 0xE0, 0xF4]);
        assert_eq!(c.regs.al(), 0x02);
        assert!(c.regs.flags.get(Flags::CF));
        assert!(c.regs.flags.get(Flags::OF));
    }

    #[test]
    fn shr_al_by_cl() {
        // mov al, 0x80 ; mov cl, 3 ; shr al, cl ; hlt → AL = 0x10
        // SHR r/m8, CL = D2 /5 ; mod=11 rm=AL → modrm 0xE8
        let c = run(&[0xB0, 0x80, 0xB1, 0x03, 0xD2, 0xE8, 0xF4]);
        assert_eq!(c.regs.al(), 0x10);
        assert!(!c.regs.flags.get(Flags::CF)); // last-out bit was 0
    }

    #[test]
    fn sar_preserves_sign_runtime() {
        // mov ax, 0x8000 ; mov cl, 4 ; sar ax, cl ; hlt → AX = 0xF800
        // SAR r/m16, CL = D3 /7 ; rm=AX → modrm 0xF8
        let c = run(&[0xB8, 0x00, 0x80, 0xB1, 0x04, 0xD3, 0xF8, 0xF4]);
        assert_eq!(c.regs.ax, 0xF800);
        assert!(c.regs.flags.get(Flags::SF));
    }

    #[test]
    fn rol_then_ror_recovers_value() {
        // mov al, 0xC3 ; rol al, 1 ; ror al, 1 ; hlt → AL back to 0xC3
        // ROL = D0 /0 → modrm 0xC0 ; ROR = D0 /1 → modrm 0xC8
        let c = run(&[0xB0, 0xC3, 0xD0, 0xC0, 0xD0, 0xC8, 0xF4]);
        assert_eq!(c.regs.al(), 0xC3);
    }

    #[test]
    fn rcl_uses_input_carry() {
        // stc ; mov al, 0 ; rcl al, 1 ; hlt → AL = 0x01 (CF rotated in at bottom)
        // RCL = D0 /2 → modrm 0xD0
        let c = run(&[0xF9, 0xB0, 0x00, 0xD0, 0xD0, 0xF4]);
        assert_eq!(c.regs.al(), 0x01);
    }

    // ---- stack + control flow (M1.4) ----

    #[test]
    fn push_then_pop_round_trip() {
        // mov ax, 0x1234 ; push ax ; pop bx ; hlt
        let c = run(&[0xB8, 0x34, 0x12, 0x50, 0x5B, 0xF4]);
        assert_eq!(c.regs.bx, 0x1234);
        // SP returns to 0xFFFE (initial).
        assert_eq!(c.regs.sp, 0xFFFE);
    }

    #[test]
    fn pushf_popf_preserves_flags() {
        // stc ; pushf ; clc ; popf ; hlt → CF should be set again.
        let c = run(&[0xF9, 0x9C, 0xF8, 0x9D, 0xF4]);
        assert!(c.regs.flags.get(Flags::CF));
    }

    #[test]
    fn jmp_short_skips_a_byte() {
        // jmp short +2  ; mov al, 0x11 ; mov al, 0x22 ; hlt
        // After jmp +2 we land on the second mov.
        // EB 02      = jmp +2 (skips 2 bytes, i.e. the first mov al,0x11)
        // B0 11      = mov al, 0x11    (skipped)
        // B0 22      = mov al, 0x22    (executed)
        // F4         = hlt
        let c = run(&[0xEB, 0x02, 0xB0, 0x11, 0xB0, 0x22, 0xF4]);
        assert_eq!(c.regs.al(), 0x22);
    }

    #[test]
    fn jcc_zf_taken_and_not_taken() {
        // mov ax, 0 ; or ax, ax ; jz +2 ; mov al, 0x55 ; hlt
        // (skips the mov al,0x55 because ZF=1)
        // 0B C0 = OR ax, ax (sets ZF)  — encoding 0B /reg=AX(0)/rm=AX(0,mod=11)
        // 74 02 = je rel8=+2
        // B0 55 = mov al, 0x55
        // F4    = hlt
        let c = run(&[0xB8, 0x00, 0x00, 0x0B, 0xC0, 0x74, 0x02, 0xB0, 0x55, 0xF4]);
        assert_eq!(c.regs.al(), 0); // skipped
                                    // Same shape but with non-zero AX so ZF=0 and the mov runs.
        let c2 = run(&[0xB8, 0x07, 0x00, 0x0B, 0xC0, 0x74, 0x02, 0xB0, 0x55, 0xF4]);
        assert_eq!(c2.regs.al(), 0x55);
    }

    #[test]
    fn loop_counts_down() {
        // mov cx, 5 ; xor ax, ax ; INC ax ; LOOP -3 ; HLT
        // B9 05 00 ; 31 C0 ; 40 ; E2 FD ; F4
        // 31 C0 = XOR ax, ax (clear). 40 = INC AX. E2 FD = LOOP rel8=-3.
        let c = run(&[0xB9, 0x05, 0x00, 0x31, 0xC0, 0x40, 0xE2, 0xFD, 0xF4]);
        assert_eq!(c.regs.ax, 5);
        assert_eq!(c.regs.cx, 0);
    }

    #[test]
    fn jcxz_skips_when_cx_zero() {
        // xor cx, cx ; jcxz +2 ; mov al, 0x99 ; hlt
        // 31 C9    XOR CX,CX
        // E3 02    JCXZ +2
        // B0 99    MOV AL, 0x99   (skipped)
        // F4
        let c = run(&[0x31, 0xC9, 0xE3, 0x02, 0xB0, 0x99, 0xF4]);
        assert_eq!(c.regs.al(), 0);
    }

    #[test]
    fn call_and_ret() {
        // Layout:
        // 0x100: BB 11 11   mov bx, 0x1111
        // 0x103: E8 04 00   call +4 (target = 0x10A)
        // 0x106: BB 22 22   mov bx, 0x2222    ← runs after RET
        // 0x109: F4         hlt
        // 0x10A: B8 33 33   mov ax, 0x3333    ← target
        // 0x10D: C3         ret
        let c = run(&[
            0xBB, 0x11, 0x11, 0xE8, 0x04, 0x00, 0xBB, 0x22, 0x22, 0xF4, 0xB8, 0x33, 0x33, 0xC3,
        ]);
        assert_eq!(c.regs.ax, 0x3333);
        assert_eq!(c.regs.bx, 0x2222);
        // SP is back to initial — call+ret balanced.
        assert_eq!(c.regs.sp, 0xFFFE);
    }

    #[test]
    fn ret_with_imm_pops_args() {
        // push 0xAAAA ; push 0xBBBB ; call f ; hlt
        // f: ret 4   ; cleans the two pushed words
        // We emulate "push imm" via mov bx, imm ; push bx (since 8086 has
        // no push imm16 in the base ISA; that came with 80186).
        // Layout:
        //   0x100: BB AA AA         mov bx, 0xAAAA
        //   0x103: 53                push bx
        //   0x104: BB BB BB         mov bx, 0xBBBB
        //   0x107: 53                push bx
        //   0x108: E8 02 00         call +2 (target 0x10D)
        //   0x10B: 90               nop  ← runs after ret 4
        //   0x10C: F4               hlt
        //   0x10D: C2 04 00         ret 4
        let c = run(&[
            0xBB, 0xAA, 0xAA, 0x53, 0xBB, 0xBB, 0xBB, 0x53, 0xE8, 0x02, 0x00, 0x90, 0xF4, 0xC2,
            0x04, 0x00,
        ]);
        // SP back to initial: arguments cleaned by RET 4.
        assert_eq!(c.regs.sp, 0xFFFE);
        assert!(c.halted);
    }

    #[test]
    fn jmp_near_indirect_via_ff() {
        // mov ax, target ; jmp ax  ; (executed: mov bx, 0x42)
        // Use a trick: store target offset via mov bx, 0x10A then jmp through bx.
        //   0x100: BB 0A 01      mov bx, 0x010A
        //   0x103: FF E3          jmp bx        (FF /4 mod=11 rm=BX(3) → modrm 0xE3)
        //   0x105: B8 11 11      mov ax, 0x1111   ← skipped
        //   0x108: 90 90          nop nop        ← skipped
        //   0x10A: B8 42 00      mov ax, 0x0042   ← target
        //   0x10D: F4             hlt
        let c = run(&[
            0xBB, 0x0A, 0x01, 0xFF, 0xE3, 0xB8, 0x11, 0x11, 0x90, 0x90, 0xB8, 0x42, 0x00, 0xF4,
        ]);
        assert_eq!(c.regs.ax, 0x0042);
    }

    #[test]
    fn add_with_carry_chain() {
        // 32-bit add via two 16-bit adds:
        //   mov ax, 0xFFFF ; mov bx, 0x0001
        //   add ax, 0x0001  (CF=1, AX=0)
        //   adc bx, 0x0000  (BX=2 because of CF)
        // 05 imm16 ADD ; 81 /2 imm16 ADC bx → 81 D3 imm
        let c = run(&[
            0xB8, 0xFF, 0xFF, 0xBB, 0x01, 0x00, 0x05, 0x01, 0x00, 0x81, 0xD3, 0x00, 0x00, 0xF4,
        ]);
        assert_eq!(c.regs.ax, 0);
        assert_eq!(c.regs.bx, 0x0002);
    }
}
