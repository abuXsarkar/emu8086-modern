//! wasm-bindgen API for the modern8051 web IDE.
//!
//! Mirrors `modern8085-wasm-api` — Emulator class with load / step /
//! run / state / mem / poke / drain_io_log so the IDE chassis the
//! web app uses is identical to the 8085 side.

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
    clippy::too_many_lines,
    clippy::unreadable_literal,
    clippy::default_trait_access,
    // StateView mirrors the 8051 PSW directly; bools are the natural
    // encoding for the IDE's JSON contract.
    clippy::struct_excessive_bools
)]

use modern8051_assembler::{assemble as asm_inner, Output};
use modern8051_core::{exec, Cpu, Memory, StopReason};
use serde::Serialize;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

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
        .unwrap_or_default(),
    }
}

fn error_line(e: &modern8051_assembler::Error) -> u32 {
    use modern8051_assembler::Error;
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
    dptr: u16,
    sp: u8,
    pc: u16,
    cy: bool,
    ac: bool,
    f0: bool,
    rs1: bool,
    rs0: bool,
    ov: bool,
    f1: bool,
    p: bool,
    /// Active register-bank R0..R7 from IDATA, exposed for convenience
    /// so the IDE register pane doesn't have to know about bank math.
    r: [u8; 8],
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
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    #[must_use]
    pub fn new() -> Self {
        Self {
            cpu: Cpu::new(),
            mem: Memory::new(),
            origin: 0x0000,
            bytes_loaded: 0,
            last_stop: None,
            halted: false,
            cycles: 0,
            source_map: Vec::new(),
        }
    }

    pub fn reset(&mut self) {
        self.cpu = Cpu::new();
        self.mem = Memory::new();
        self.origin = 0x0000;
        self.bytes_loaded = 0;
        self.last_stop = None;
        self.halted = false;
        self.cycles = 0;
        self.source_map.clear();
    }

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
        self.mem = Memory::new();
        self.mem.load_code(out.origin, &out.bytes);
        self.origin = out.origin;
        self.bytes_loaded = out.bytes.len() as u32;
        self.cpu = Cpu::new();
        self.cpu.pc = out.origin;
        self.last_stop = None;
        self.halted = false;
        self.cycles = 0;
        self.source_map.clone_from(&out.source_map);
    }

    #[must_use]
    pub fn step(&mut self) -> String {
        if !self.halted {
            match exec::step(&mut self.cpu, &mut self.mem) {
                Ok(rec) => {
                    self.cycles += u64::from(rec.cycles);
                    self.last_stop = None;
                }
                Err(stop) => {
                    if matches!(stop, StopReason::SelfJump(_)) {
                        self.halted = true;
                    }
                    self.last_stop = Some(stop);
                }
            }
        }
        self.state()
    }

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
            let stop = exec::run(&mut self.cpu, &mut self.mem, u64::from(budget), &bps);
            if matches!(stop, StopReason::SelfJump(_)) {
                self.halted = true;
            }
            self.last_stop = Some(stop);
            // Coarse cycle estimate for chunked Run; per-step is
            // accurate.
            self.cycles += u64::from(budget);
        }
        self.state()
    }

    #[must_use]
    pub fn state(&self) -> String {
        let bank_base = self.cpu.psw.bank() * 8;
        let r: [u8; 8] = std::array::from_fn(|i| self.mem.idata_read(bank_base + i as u8));
        let view = StateView {
            a: self.cpu.a,
            b: self.cpu.b,
            dptr: self.cpu.dptr,
            sp: self.cpu.sp,
            pc: self.cpu.pc,
            cy: self.cpu.psw.cy,
            ac: self.cpu.psw.ac,
            f0: self.cpu.psw.f0,
            rs1: self.cpu.psw.rs1,
            rs0: self.cpu.psw.rs0,
            ov: self.cpu.psw.ov,
            f1: self.cpu.psw.f1,
            p: self.cpu.psw.p,
            r,
            origin: self.origin,
            bytes_loaded: self.bytes_loaded,
            last_stop: self.last_stop.as_ref().map(|s| format!("{s:?}")),
            halted: self.halted,
            cycles: self.cycles,
        };
        serde_json::to_string(&view).unwrap_or_default()
    }

    /// Read internal RAM (IDATA + SFRs) as hex. The IDE's memory
    /// inspector defaults to this space.
    #[must_use]
    pub fn idata(&self, addr: u32, len: u32) -> String {
        let start = (addr & 0xFF) as usize;
        let mut end = start.saturating_add(len as usize);
        if end > 0x100 {
            end = 0x100;
        }
        let mut s = String::with_capacity((end - start) * 2);
        for a in start..end {
            use std::fmt::Write;
            let _ = write!(&mut s, "{:02X}", self.mem.idata_read(a as u8));
        }
        s
    }

    /// Read external RAM (XDATA) as hex.
    #[must_use]
    pub fn xdata(&self, addr: u32, len: u32) -> String {
        let start = (addr & 0xFFFF) as usize;
        let mut end = start.saturating_add(len as usize);
        if end > 0x1_0000 {
            end = 0x1_0000;
        }
        let mut s = String::with_capacity((end - start) * 2);
        for a in start..end {
            use std::fmt::Write;
            let _ = write!(&mut s, "{:02X}", self.mem.xdata_read(a as u16));
        }
        s
    }

    /// Read program memory (CODE) as hex.
    #[must_use]
    pub fn code(&self, addr: u32, len: u32) -> String {
        let start = (addr & 0xFFFF) as usize;
        let mut end = start.saturating_add(len as usize);
        if end > 0x1_0000 {
            end = 0x1_0000;
        }
        let mut s = String::with_capacity((end - start) * 2);
        for a in start..end {
            use std::fmt::Write;
            let _ = write!(&mut s, "{:02X}", self.mem.code_read(a as u16));
        }
        s
    }

    pub fn poke_idata(&mut self, addr: u32, value: u32) {
        self.mem
            .idata_write((addr & 0xFF) as u8, (value & 0xFF) as u8);
    }

    pub fn poke_xdata(&mut self, addr: u32, value: u32) {
        self.mem
            .xdata_write((addr & 0xFFFF) as u16, (value & 0xFF) as u8);
    }

    pub fn set_pc(&mut self, value: u32) {
        self.cpu.pc = (value & 0xFFFF) as u16;
    }

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

    /// Drain the IO log — same shape as 8085's: hex string of
    /// PPVV pairs. The 8051 uses ports differently (P0-P3 are SFRs,
    /// not a separate IO space) so for now this surfaces MOVX writes
    /// (port=0xFF marker) and any P0-P3 changes the program made.
    #[must_use]
    pub fn drain_io_log(&mut self) -> String {
        let mut s = String::with_capacity(self.cpu.io_log.len() * 4);
        for (port, byte) in self.cpu.io_log.drain(..) {
            use std::fmt::Write;
            let _ = write!(&mut s, "{port:02X}{byte:02X}");
        }
        s
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
    fn assemble_nop_returns_one_byte() {
        let json = assemble("NOP");
        assert!(json.contains("\"ok\":true"));
        assert!(json.contains("\"bytes\":[0]"));
    }

    #[test]
    fn emulator_load_step_state() {
        let mut e = Emulator::new();
        let r = e.load("ORG 0\nMOV A, #42H\nSJMP $");
        assert!(r.contains("\"ok\":true"));
        let _ = e.step(); // MOV A,#42H
        let state = e.state();
        assert!(state.contains("\"a\":66")); // 0x42
    }
}
