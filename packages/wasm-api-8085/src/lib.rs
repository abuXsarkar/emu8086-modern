//! wasm-bindgen API for the modern8085 web IDE.
//!
//! Exports:
//!
//! - `version()` — bootstrap probe used by the IDE on startup.
//! - `assemble(source)` — one-shot assemble; returns a JSON string
//!   (bytes + symbols + hints + source-map + origin) or an error JSON.
//! - `Emulator` — stateful class wrapping CPU + memory + the last
//!   assembled image. Methods: `new`, `reset`, `load(source)`,
//!   `step()`, `run(budget, breakpoints)`, `state()`, `mem(addr, len)`,
//!   `set_pc(value)`.
//!
//! The IDE creates one `Emulator`, loads source via `load()`, then
//! drives single-step / chunked-run cycles from a Web Worker. All
//! state inspection (`state()`, `mem()`) returns JSON strings so the
//! JS side can deserialise with the same shape it uses for the 8086
//! emulator (kept close on purpose for code reuse in the IDE).

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::module_name_repetitions,
    clippy::doc_markdown,
    clippy::needless_pass_by_value,
    clippy::similar_names,
    clippy::struct_excessive_bools,
    clippy::too_many_lines,
    clippy::unreadable_literal,
    clippy::default_trait_access
)]

use modern8085_assembler::{assemble as asm_inner, Output};
use modern8085_core::{exec, Cpu, Memory, StopReason};
use serde::Serialize;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

/// Bootstrap probe.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[must_use]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[derive(Serialize)]
struct AssembleOk {
    ok: bool,
    origin: u16,
    bytes: Vec<u8>,
    source_map: Vec<u32>,
    hints: Vec<(u32, String)>,
    symbols: Vec<(String, u16)>,
}

#[derive(Serialize)]
struct AssembleErr {
    ok: bool,
    error: String,
    line: u32,
}

/// One-shot convenience: assemble `source` and return a JSON string.
/// On success: `{ok: true, origin, bytes, source_map, hints, symbols}`.
/// On failure: `{ok: false, error, line}`.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[must_use]
pub fn assemble(source: &str) -> String {
    match asm_inner(source) {
        Ok(out) => serde_json::to_string(&AssembleOk {
            ok: true,
            origin: out.origin,
            bytes: out.bytes,
            source_map: out.source_map,
            hints: out.hints,
            symbols: out.symbols,
        })
        .unwrap_or_else(|_| r#"{"ok":false,"error":"serialise","line":0}"#.to_string()),
        Err(e) => serde_json::to_string(&AssembleErr {
            ok: false,
            error: e.to_string(),
            line: error_line(&e),
        })
        .unwrap_or_else(|_| r#"{"ok":false,"error":"serialise","line":0}"#.to_string()),
    }
}

fn error_line(e: &modern8085_assembler::Error) -> u32 {
    use modern8085_assembler::Error;
    match e {
        Error::Lex { line, .. }
        | Error::Parse { line, .. }
        | Error::Encode { line, .. }
        | Error::ValueOutOfRange { line, .. }
        | Error::UndefinedLabel { line, .. }
        | Error::DuplicateLabel { line, .. } => *line,
    }
}

#[derive(Serialize)]
struct StateView {
    a: u8,
    b: u8,
    c: u8,
    d: u8,
    e: u8,
    h: u8,
    l: u8,
    sp: u16,
    pc: u16,
    s: bool,
    z: bool,
    ac: bool,
    p: bool,
    cy: bool,
    ie: bool,
    im: u8,
    origin: u16,
    bytes_loaded: u32,
    last_stop: Option<String>,
    halted: bool,
    cycles: u64,
}

#[derive(Serialize)]
struct LoadResult {
    ok: bool,
    error: Option<String>,
    line: u32,
    origin: u16,
    bytes_loaded: u32,
    hints: Vec<(u32, String)>,
    symbols: Vec<(String, u16)>,
}

/// Stateful emulator that the IDE drives across steps.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct Emulator {
    cpu: Cpu,
    mem: Memory,
    origin: u16,
    bytes_loaded: u32,
    last_stop: Option<StopReason>,
    halted: bool,
    cycles: u64,
    source_map: Vec<u32>,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl Emulator {
    /// Build a fresh emulator with zeroed memory and CPU. SP is left
    /// at 0xFFFE so PUSH/POP work out of the box.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    #[must_use]
    pub fn new() -> Self {
        let mut cpu = Cpu::new();
        cpu.sp = 0xFFFE;
        Self {
            cpu,
            mem: Memory::new(),
            origin: 0x2000,
            bytes_loaded: 0,
            last_stop: None,
            halted: false,
            cycles: 0,
            source_map: Vec::new(),
        }
    }

    /// Reset CPU + memory + counters. Keeps the default SP.
    pub fn reset(&mut self) {
        self.cpu = Cpu::new();
        self.cpu.sp = 0xFFFE;
        self.mem = Memory::new();
        self.origin = 0x2000;
        self.bytes_loaded = 0;
        self.last_stop = None;
        self.halted = false;
        self.cycles = 0;
        self.source_map.clear();
    }

    /// Assemble and load `source`. Returns a JSON `LoadResult`.
    /// PC is set to the assembled origin so the next `step()` runs the
    /// first instruction.
    #[must_use]
    pub fn load(&mut self, source: &str) -> String {
        match asm_inner(source) {
            Ok(out) => {
                self.apply_image(&out);
                let r = LoadResult {
                    ok: true,
                    error: None,
                    line: 0,
                    origin: out.origin,
                    bytes_loaded: out.bytes.len() as u32,
                    hints: out.hints,
                    symbols: out.symbols,
                };
                serde_json::to_string(&r).unwrap_or_default()
            }
            Err(e) => {
                let r = LoadResult {
                    ok: false,
                    error: Some(e.to_string()),
                    line: error_line(&e),
                    origin: self.origin,
                    bytes_loaded: self.bytes_loaded,
                    hints: Vec::new(),
                    symbols: Vec::new(),
                };
                serde_json::to_string(&r).unwrap_or_default()
            }
        }
    }

    fn apply_image(&mut self, out: &Output) {
        // Wipe memory before loading so a previous run doesn't leak
        // bytes into the new image.
        self.mem = Memory::new();
        self.mem.load(out.origin, &out.bytes);
        self.origin = out.origin;
        self.bytes_loaded = out.bytes.len() as u32;
        self.cpu.pc = out.origin;
        self.cpu.sp = 0xFFFE;
        self.cpu.flags = Default::default();
        self.last_stop = None;
        self.halted = false;
        self.cycles = 0;
        self.source_map.clone_from(&out.source_map);
    }

    /// Execute exactly one instruction. Returns the current state as
    /// JSON. If the previous step halted, this is a no-op.
    #[must_use]
    pub fn step(&mut self) -> String {
        if !self.halted {
            match exec::step(&mut self.cpu, &mut self.mem) {
                Ok(rec) => {
                    self.cycles += u64::from(rec.cycles);
                    self.last_stop = None;
                }
                Err(stop) => {
                    if matches!(stop, StopReason::Halted) {
                        self.halted = true;
                    }
                    self.last_stop = Some(stop);
                }
            }
        }
        self.state()
    }

    /// Run up to `budget` instructions or until the program halts /
    /// hits a breakpoint / triggers IO / hits an invalid opcode. The
    /// IDE calls this in a Web Worker with a small budget per tick to
    /// keep the main thread responsive.
    ///
    /// `breakpoints_csv` is a comma-separated list of hex addresses
    /// like `"2010,2017"` — wasm-bindgen can't take a `Vec<u16>` over
    /// the boundary, so we keep the contract trivially serialisable.
    #[must_use]
    pub fn run(&mut self, budget: u32, breakpoints_csv: &str) -> String {
        let bps: Vec<u16> = breakpoints_csv
            .split(',')
            .filter_map(|s| {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    u16::from_str_radix(t.trim_start_matches("0x"), 16).ok()
                }
            })
            .collect();

        if !self.halted {
            // run_with_cycles sums each StepRecord's cycles internally
            // so the counter we surface to the IDE matches what a
            // T-state-accurate datasheet calculation would say.
            let (stop, cycles) =
                exec::run_with_cycles(&mut self.cpu, &mut self.mem, u64::from(budget), &bps);
            if matches!(stop, StopReason::Halted) {
                self.halted = true;
            }
            self.last_stop = Some(stop);
            self.cycles += cycles;
        }
        self.state()
    }

    /// Return the current CPU + flag state as JSON.
    #[must_use]
    pub fn state(&self) -> String {
        let view = StateView {
            a: self.cpu.a,
            b: self.cpu.b,
            c: self.cpu.c,
            d: self.cpu.d,
            e: self.cpu.e,
            h: self.cpu.h,
            l: self.cpu.l,
            sp: self.cpu.sp,
            pc: self.cpu.pc,
            s: self.cpu.flags.s,
            z: self.cpu.flags.z,
            ac: self.cpu.flags.ac,
            p: self.cpu.flags.p,
            cy: self.cpu.flags.cy,
            ie: self.cpu.ie,
            im: self.cpu.im,
            origin: self.origin,
            bytes_loaded: self.bytes_loaded,
            last_stop: self.last_stop.as_ref().map(|s| format!("{s:?}")),
            halted: self.halted,
            cycles: self.cycles,
        };
        serde_json::to_string(&view).unwrap_or_default()
    }

    /// Read a slice of memory as a hex string. The IDE memory inspector
    /// uses this to render the visible window without copying the whole
    /// 64 KiB across the wasm boundary each redraw.
    #[must_use]
    pub fn mem(&self, addr: u32, len: u32) -> String {
        let start = (addr & 0xFFFF) as usize;
        let mut end = start.saturating_add(len as usize);
        if end > 0x1_0000 {
            end = 0x1_0000;
        }
        let slice = &self.mem.as_slice()[start..end];
        // Hex string, no separator — JS side splits per two chars.
        let mut s = String::with_capacity(slice.len() * 2);
        for b in slice {
            use std::fmt::Write;
            let _ = write!(&mut s, "{b:02X}");
        }
        s
    }

    /// Write a byte to memory — exposed so the IDE can pre-load inputs
    /// at addresses like 2050H before running.
    pub fn poke(&mut self, addr: u32, value: u32) {
        self.mem.write((addr & 0xFFFF) as u16, (value & 0xFF) as u8);
    }

    /// Read the current value of an IO port (0..255) as hex bytes,
    /// same shape as `mem(addr, len)`. Used by JS-side devices
    /// (seven-segment, traffic light, LED matrix) to poll their port
    /// between steps and render whatever the program just wrote.
    #[must_use]
    pub fn ports(&self, addr: u32, len: u32) -> String {
        let start = (addr & 0xFF) as usize;
        let mut end = start.saturating_add(len as usize);
        if end > 0x100 {
            end = 0x100;
        }
        let mut s = String::with_capacity((end - start) * 2);
        for b in &self.cpu.ports[start..end] {
            use std::fmt::Write;
            let _ = write!(&mut s, "{b:02X}");
        }
        s
    }

    /// Write a byte to an IO port — used by JS-side input devices
    /// (hex keypad, switches) to inject a value the program will
    /// read with `IN`.
    pub fn poke_port(&mut self, addr: u32, value: u32) {
        self.cpu.ports[(addr & 0xFF) as usize] = (value & 0xFF) as u8;
    }

    /// Drain the IO log and return every `(port, byte)` pair the
    /// program OUT'd since the previous drain. Encoded as a flat hex
    /// string of `PPVV` pairs — JS slices in pairs of 4 chars.
    /// Empties the log on the Rust side.
    #[must_use]
    pub fn drain_io_log(&mut self) -> String {
        let mut s = String::with_capacity(self.cpu.io_log.len() * 4);
        for (port, byte) in self.cpu.io_log.drain(..) {
            use std::fmt::Write;
            let _ = write!(&mut s, "{port:02X}{byte:02X}");
        }
        s
    }

    /// Override PC (rarely needed; the IDE uses this only when the
    /// student manually moves the run cursor).
    pub fn set_pc(&mut self, value: u32) {
        self.cpu.pc = (value & 0xFFFF) as u16;
    }

    /// Return the source-line that produced the byte at the current
    /// PC, or 0 if PC is outside the loaded image. The IDE line
    /// highlighter calls this every step.
    #[must_use]
    pub fn line_for_pc(&self) -> u32 {
        if self.bytes_loaded == 0 {
            return 0;
        }
        let pc = u32::from(self.cpu.pc);
        let origin = u32::from(self.origin);
        if pc < origin {
            return 0;
        }
        let off = (pc - origin) as usize;
        self.source_map.get(off).copied().unwrap_or(0)
    }
}

impl Default for Emulator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_returns_pkg_version() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn assemble_hlt_returns_one_byte() {
        let json = assemble("HLT");
        assert!(json.contains("\"ok\":true"));
        assert!(json.contains("\"bytes\":[118]")); // 0x76 = 118
    }

    #[test]
    fn assemble_bad_source_returns_error_json() {
        let json = assemble("XYZZY");
        assert!(json.contains("\"ok\":false"));
    }

    #[test]
    fn emulator_load_run_state_end_to_end() {
        let mut e = Emulator::new();
        let load = e.load(
            "ORG 2000H
            MVI A, 0AAH
            HLT",
        );
        assert!(load.contains("\"ok\":true"));
        // Step twice (MVI + HLT)
        let _ = e.step();
        let _ = e.step();
        let state = e.state();
        assert!(state.contains("\"a\":170")); // 0xAA = 170
        assert!(state.contains("\"halted\":true"));
    }

    #[test]
    fn emulator_respects_budget() {
        let mut e = Emulator::new();
        let _ = e.load("ORG 2000H\nJMP 2000H");
        let state = e.run(10, "");
        assert!(state.contains("BudgetExhausted"));
    }

    #[test]
    fn emulator_breakpoint_stops_before_executing() {
        let mut e = Emulator::new();
        let _ = e.load(
            "ORG 2000H
            MVI A, 11H
            MVI A, 22H
            HLT",
        );
        let _ = e.run(100, "2002");
        let state = e.state();
        // Should have stopped before the second MVI executes → A = 0x11 = 17
        assert!(state.contains("\"a\":17"));
        assert!(state.contains("Breakpoint"));
    }

    #[test]
    fn poke_then_load_then_state() {
        let mut e = Emulator::new();
        e.poke(0x2050, 0x42);
        let _ = e.load(
            "ORG 2000H
            LDA 2050H
            HLT",
        );
        // load() wipes memory, so poke() before load is gone — that's
        // intentional. Caller should poke *after* load().
        e.poke(0x2050, 0x42);
        let _ = e.run(100, "");
        let state = e.state();
        assert!(state.contains("\"a\":66")); // 0x42 = 66
    }

    #[test]
    fn mem_returns_uppercase_hex_string() {
        let mut e = Emulator::new();
        e.poke(0x2050, 0xAB);
        let hex = e.mem(0x2050, 1);
        assert_eq!(hex, "AB");
    }

    #[test]
    fn line_for_pc_returns_source_line() {
        let mut e = Emulator::new();
        let _ = e.load(
            "ORG 2000H
HLT",
        );
        // After load, PC = 2000 which is the byte for HLT. That came
        // from source line 2 (1-indexed).
        assert_eq!(e.line_for_pc(), 2);
    }
}
