//! wasm-bindgen API surface for the web IDE.
//!
//! Exposes one batched call (`compile_and_run`) that takes assembly
//! source, assembles it, executes the image, and returns a JSON-encoded
//! result with stdout, final registers, exit code, and a diagnostic
//! string on failure.
//!
//! Step-by-step debugging will graduate to a stateful API in M3-M4.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc
)]

use emu8086_assembler::{assemble, Dialect};
use emu8086_core::Cpu;
use serde::Serialize;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

#[derive(Serialize, Default)]
pub struct RunResult {
    pub ok: bool,
    pub stdout: String,
    pub stdout_lossy: bool,
    pub exit_code: Option<u8>,
    pub steps: usize,
    pub halted: bool,
    pub error: Option<RunError>,
    pub registers: Registers,
    pub bytes: usize,
    pub origin: u16,
    /// Sorted `(linear_ip, byte_offset_of_mnemonic_in_source)` pairs.
    /// The IDE converts the byte offset into a source line number on
    /// its own (it already has the source text). Empty when the
    /// program failed to assemble.
    pub line_map: Vec<(u16, u32)>,
}

#[derive(Serialize, Default)]
pub struct RunError {
    pub stage: &'static str,
    pub message: String,
    /// 1-based line number, 0 means unknown.
    pub line: u32,
    /// 1-based column number, 0 means unknown.
    pub column: u32,
    /// Inclusive start byte offset.
    pub start: u32,
    pub end: u32,
}

#[derive(Serialize, Default)]
pub struct Registers {
    pub ax: u16,
    pub bx: u16,
    pub cx: u16,
    pub dx: u16,
    pub si: u16,
    pub di: u16,
    pub bp: u16,
    pub sp: u16,
    pub ip: u16,
    pub cs: u16,
    pub ds: u16,
    pub es: u16,
    pub ss: u16,
    pub flags: u16,
}

impl From<&emu8086_core::Registers> for Registers {
    fn from(r: &emu8086_core::Registers) -> Self {
        Self {
            ax: r.ax,
            bx: r.bx,
            cx: r.cx,
            dx: r.dx,
            si: r.si,
            di: r.di,
            bp: r.bp,
            sp: r.sp,
            ip: r.ip,
            cs: r.cs,
            ds: r.ds,
            es: r.es,
            ss: r.ss,
            flags: r.flags.0,
        }
    }
}

fn locate(source: &str, byte_pos: usize) -> (u32, u32) {
    let mut line = 1u32;
    let mut col = 1u32;
    for (i, b) in source.bytes().enumerate() {
        if i == byte_pos {
            return (line, col);
        }
        if b == b'\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

fn run_inner(source: &str, max_steps: usize) -> RunResult {
    let img = match assemble(source, Dialect::default()) {
        Ok(img) => img,
        Err(e) => {
            let (stage, msg, span) = match e {
                emu8086_assembler::AssembleError::Lex(le) => (
                    "lex",
                    le.msg.clone(),
                    emu8086_assembler::Span::new(le.pos, le.pos + 1),
                ),
                emu8086_assembler::AssembleError::Preprocess(pe) => {
                    ("preprocess", pe.message, pe.span)
                }
                emu8086_assembler::AssembleError::Parse(pe) => ("parse", pe.message, pe.span),
                emu8086_assembler::AssembleError::Encode(ee) => ("encode", ee.message, ee.span),
            };
            let (line, col) = locate(source, span.start);
            return RunResult {
                ok: false,
                error: Some(RunError {
                    stage,
                    message: msg,
                    line,
                    column: col,
                    start: span.start as u32,
                    end: span.end as u32,
                }),
                ..Default::default()
            };
        }
    };

    let mut cpu = Cpu::new();
    cpu.load_com(&img.bytes);
    let steps = cpu.run_until_halt(max_steps);

    let stdout_lossy = std::str::from_utf8(&cpu.stdout).is_err();
    let stdout = String::from_utf8_lossy(&cpu.stdout).into_owned();

    RunResult {
        ok: true,
        stdout,
        stdout_lossy,
        exit_code: cpu.exit_code,
        steps,
        halted: cpu.halted,
        error: None,
        registers: Registers::from(&cpu.regs),
        bytes: img.bytes.len(),
        origin: img.origin,
        line_map: img.line_map.clone(),
    }
}

/// JSON-encoded `RunResult`. We return a string instead of `JsValue`
/// directly so the wasm boundary is identical on every host (browser,
/// Node, tests) and we don't need `serde-wasm-bindgen`.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[must_use]
pub fn compile_and_run(source: &str, max_steps: u32) -> String {
    let cap = max_steps as usize;
    let cap = if cap == 0 { 1_000_000 } else { cap };
    let result = run_inner(source, cap);
    serde_json::to_string(&result).unwrap_or_else(|e| {
        format!("{{\"ok\":false,\"error\":{{\"stage\":\"serialize\",\"message\":\"{e}\"}}}}")
    })
}

#[derive(Serialize, Default)]
pub struct StepResultJson {
    pub stdout: String,
    pub exit_code: Option<u8>,
    pub halted: bool,
    pub mnemonic: String,
    pub stopped: Option<String>,
    pub registers: Registers,
}

/// Stateful single-step interface used by the web IDE's Step button.
/// One instance owns one `Cpu`; load a fresh program with `load`, step
/// with `step`, snapshot the current state with `state`. Reset is just
/// "create a new one".
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct Emulator {
    cpu: Cpu,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl Emulator {
    /// Construct an empty emulator; call `load_source` before stepping.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    #[must_use]
    pub fn new() -> Self {
        Self { cpu: Cpu::new() }
    }

    /// Assemble the source and load the resulting image. Returns the
    /// same `RunResult` shape `compile_and_run` does (with `steps = 0`)
    /// on success, or a structured error on failure.
    pub fn load_source(&mut self, source: &str) -> String {
        let img = match assemble(source, Dialect::default()) {
            Ok(img) => img,
            Err(e) => {
                let (stage, msg, span) = match e {
                    emu8086_assembler::AssembleError::Lex(le) => (
                        "lex",
                        le.msg.clone(),
                        emu8086_assembler::Span::new(le.pos, le.pos + 1),
                    ),
                    emu8086_assembler::AssembleError::Preprocess(pe) => {
                        ("preprocess", pe.message, pe.span)
                    }
                    emu8086_assembler::AssembleError::Parse(pe) => ("parse", pe.message, pe.span),
                    emu8086_assembler::AssembleError::Encode(ee) => ("encode", ee.message, ee.span),
                };
                let (line, col) = locate(source, span.start);
                let r = RunResult {
                    ok: false,
                    error: Some(RunError {
                        stage,
                        message: msg,
                        line,
                        column: col,
                        start: span.start as u32,
                        end: span.end as u32,
                    }),
                    ..Default::default()
                };
                return serde_json::to_string(&r).unwrap_or_default();
            }
        };
        self.cpu = Cpu::new();
        // Default history budget for the IDE: the same 1M-step cap that
        // `compile_and_run` uses. Step recording costs ~tens of bytes
        // per step (registers + the few memory writes the step did),
        // so 1M steps × ~30 B is ~30 MB worst-case — but most programs
        // stop in seconds and stay well under that.
        self.cpu.set_history_capacity(1_000_000);
        self.cpu.load_com(&img.bytes);
        let r = RunResult {
            ok: true,
            stdout: String::new(),
            exit_code: None,
            steps: 0,
            halted: false,
            error: None,
            registers: Registers::from(&self.cpu.regs),
            bytes: img.bytes.len(),
            origin: img.origin,
            line_map: img.line_map,
            ..Default::default()
        };
        serde_json::to_string(&r).unwrap_or_default()
    }

    /// Step exactly one instruction. Returns a JSON `StepResultJson`.
    pub fn step(&mut self) -> String {
        let prev_stdout_len = self.cpu.stdout.len();
        let rec = self.cpu.step();
        let mnemonic = rec.mnemonic.to_string();
        let stopped = rec.stopped.as_ref().map(|s| match s {
            emu8086_core::StopReason::Halted => "halted".to_string(),
            emu8086_core::StopReason::Unimplemented { opcode, ip } => {
                format!("unimplemented opcode 0x{opcode:02X} at ip 0x{ip:04X}")
            }
            emu8086_core::StopReason::DivideError { ip } => {
                format!("divide error at ip 0x{ip:04X}")
            }
        });
        // Newly-emitted stdout slice (the program may have called INT 21h).
        let new_stdout = String::from_utf8_lossy(&self.cpu.stdout[prev_stdout_len..]).into_owned();
        let r = StepResultJson {
            stdout: new_stdout,
            exit_code: self.cpu.exit_code,
            halted: self.cpu.halted,
            mnemonic,
            stopped,
            registers: Registers::from(&self.cpu.regs),
        };
        serde_json::to_string(&r).unwrap_or_default()
    }

    /// Read a slice of the emulator's memory as a hex-encoded string.
    /// `seg:off` is the start of the slice; `len` is the number of
    /// bytes to read (capped at 4096 so a runaway request doesn't
    /// hang the host). Output is space-separated two-char hex per
    /// byte, no trailing newline; the IDE re-flows it into rows.
    /// Read one I/O port byte (e.g. port 199 = the 7-seg display).
    #[must_use]
    pub fn port_byte(&self, port: u16) -> u8 {
        self.cpu.ports[port as usize]
    }

    /// Total number of `OUT` writes the program has done since load.
    /// The IDE polls this to decide whether to redraw device panels.
    #[must_use]
    pub fn out_log_len(&self) -> u32 {
        self.cpu.out_log.len() as u32
    }

    /// Snapshot of the 80×25 text-mode video buffer at linear address
    /// 0xB8000 as a string of 25 newline-separated rows of 80
    /// characters. Non-printable bytes are rendered as spaces; the
    /// attribute byte of each cell is dropped (the IDE renders the
    /// monochrome view for now). Returns 25 × (80 + 1) = 2025 chars.
    #[must_use]
    pub fn video_text(&self) -> String {
        const ROWS: usize = 25;
        const COLS: usize = 80;
        const BASE: usize = 0xB_8000;
        let buf = self.cpu.mem.slice(BASE, ROWS * COLS * 2);
        let mut out = String::with_capacity(ROWS * (COLS + 1));
        for row in 0..ROWS {
            for col in 0..COLS {
                let ch = buf.get(row * COLS * 2 + col * 2).copied().unwrap_or(0);
                let c = if (0x20..=0x7E).contains(&ch) {
                    ch as char
                } else {
                    ' '
                };
                out.push(c);
            }
            out.push('\n');
        }
        out
    }

    /// Number of writes the program has issued to port 7 — the
    /// stepper-motor coil drive byte. Used by the IDE to render a
    /// motion / step-count badge alongside the coil indicators.
    /// Walks `out_log` so `step_back` rolls the count back too.
    #[must_use]
    pub fn stepper_steps(&self) -> u32 {
        self.cpu
            .out_log
            .iter()
            .filter(|w| w.port == 7)
            .count()
            .try_into()
            .unwrap_or(u32::MAX)
    }

    /// Reconstruct the 8×8 LED-matrix display by walking `out_log`.
    /// Convention: writes to port 10 (0x0A) select the row index (0..7,
    /// taken modulo 8), writes to port 9 (0x09) latch the row's 8-bit
    /// pixel data into that index. We replay the log from the start so
    /// `step_back`'s truncation of `out_log` is honored automatically.
    /// Returns 8 bytes, row 0 first.
    #[must_use]
    pub fn led_matrix_rows(&self) -> Vec<u8> {
        let mut rows = vec![0u8; 8];
        let mut current: usize = 0;
        for w in &self.cpu.out_log {
            match w.port {
                10 => current = (w.value as usize) & 0x07,
                9 => rows[current] = w.value as u8,
                _ => {}
            }
        }
        rows
    }

    /// The full current console output as a UTF-8 string (replacing
    /// invalid bytes with U+FFFD). Surfaced so the IDE can re-sync
    /// after a `step_back` — that call truncates `cpu.stdout` on the
    /// core side, but the React state has no diff to apply.
    #[must_use]
    pub fn stdout(&self) -> String {
        String::from_utf8_lossy(&self.cpu.stdout).into_owned()
    }

    #[must_use]
    pub fn memory_hex(&self, seg: u16, off: u16, len: u16) -> String {
        use std::fmt::Write as _;
        let len = (len as usize).min(4096);
        let lin = emu8086_core::seg_off(seg, off);
        let slice = self.cpu.mem.slice(lin, len);
        let mut out = String::with_capacity(slice.len() * 3);
        for (i, b) in slice.iter().enumerate() {
            if i > 0 {
                out.push(' ');
            }
            let _ = write!(out, "{b:02X}");
        }
        out
    }

    /// Step backwards by one instruction. Returns a `StepResultJson`
    /// shape, with `mnemonic = "back"` to make the host log readable.
    /// On empty history, returns the current state with `mnemonic = ""`.
    pub fn step_back(&mut self) -> String {
        let took = self.cpu.step_back();
        let r = StepResultJson {
            stdout: String::new(),
            exit_code: self.cpu.exit_code,
            halted: self.cpu.halted,
            mnemonic: if took { "back".into() } else { String::new() },
            stopped: None,
            registers: Registers::from(&self.cpu.regs),
        };
        serde_json::to_string(&r).unwrap_or_default()
    }

    /// Re-run from the start of the currently-loaded image up to
    /// `max_steps` instructions. Convenient for "restart and run to
    /// completion" without re-assembling.
    pub fn run(&mut self, max_steps: u32) -> String {
        let cap = if max_steps == 0 {
            1_000_000
        } else {
            max_steps as usize
        };
        let steps = self.cpu.run_until_halt(cap);
        let stdout = String::from_utf8_lossy(&self.cpu.stdout).into_owned();
        let r = RunResult {
            ok: true,
            stdout,
            stdout_lossy: false,
            exit_code: self.cpu.exit_code,
            steps,
            halted: self.cpu.halted,
            error: None,
            registers: Registers::from(&self.cpu.regs),
            line_map: Vec::new(),
            bytes: 0,
            origin: 0,
        };
        serde_json::to_string(&r).unwrap_or_default()
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
    fn hello_world_runs() {
        let src = "\
            org 100h\n\
            mov dx, msg\n\
            mov ah, 9\n\
            int 21h\n\
            mov ax, 0x4C00\n\
            int 21h\n\
            msg: db \"Hi$\"\n\
        ";
        let out = compile_and_run(src, 10_000);
        assert!(out.contains("\"stdout\":\"Hi\""), "got: {out}");
        assert!(out.contains("\"ok\":true"));
    }

    #[test]
    fn video_text_renders_b8000_writes() {
        // Switch DS to B800 and write "HI" (with attribute byte) to
        // the top-left corner. video_text() should reflect the chars
        // on row 0, columns 0-1, and leave the rest blank.
        let src = "\
            org 100h\n\
            mov ax, 0xB800\n\
            mov ds, ax\n\
            mov di, 0\n\
            mov ax, 0x0748\n\
            mov [di], ax\n\
            add di, 2\n\
            mov ax, 0x0749\n\
            mov [di], ax\n\
            mov ax, 0x4C00\n\
            int 21h\n\
        ";
        let mut e = Emulator::new();
        let load = e.load_source(src);
        assert!(load.contains("\"ok\":true"), "load failed: {load}");
        let _ = e.run(100_000);
        let screen = e.video_text();
        assert!(
            screen.starts_with("HI"),
            "expected `HI` at top-left, got: {screen:?}"
        );
        // The rest of row 0 should be blank.
        let row0 = screen.lines().next().unwrap_or("");
        assert_eq!(row0.len(), 80, "row 0 must be 80 columns, got {row0:?}");
        assert!(
            row0[2..].chars().all(|c| c == ' '),
            "tail of row 0 not blank: {row0:?}"
        );
    }

    #[test]
    fn stepper_steps_counts_port_7_writes() {
        // Drive the 4-coil wave pattern 16 times and assert that the
        // stepper-step count matches the OUT count exactly.
        let src = "\
            org 100h\n\
            mov dx, 7\n\
            xor bx, bx\n\
            mov cx, 16\n\
            step_loop:\n\
            mov si, pattern\n\
            add si, bx\n\
            lodsb\n\
            out dx, al\n\
            inc bx\n\
            cmp bx, 4\n\
            jl  no_wrap\n\
            xor bx, bx\n\
            no_wrap:\n\
            loop step_loop\n\
            mov ax, 0x4C00\n\
            int 21h\n\
            pattern: db 1, 2, 4, 8\n\
        ";
        let mut e = Emulator::new();
        let load = e.load_source(src);
        assert!(load.contains("\"ok\":true"), "load failed: {load}");
        let _ = e.run(100_000);
        assert_eq!(e.stepper_steps(), 16);
        // The final OUT was for index 15 → bx=3 → pattern[3]=8.
        assert_eq!(e.port_byte(7), 8);
    }

    #[test]
    fn led_matrix_rows_reconstructs_from_out_log() {
        // Run the bundled LED-matrix smiley example via the stateful
        // Emulator, then ask for the reconstructed rows. The pattern
        // bytes are the constants from examples/led_matrix.asm.
        let src = "\
            org 100h\n\
            mov si, pattern\n\
            xor cx, cx\n\
            next_row:\n\
            cmp cx, 8\n\
            je  done\n\
            mov al, cl\n\
            mov dx, 10\n\
            out dx, al\n\
            mov al, [si]\n\
            mov dx, 9\n\
            out dx, al\n\
            inc si\n\
            inc cx\n\
            jmp next_row\n\
            done:\n\
            mov ax, 0x4C00\n\
            int 21h\n\
            pattern: db 0x7E, 0x81, 0xA5, 0x81, 0xA5, 0x99, 0x81, 0x7E\n\
        ";
        let mut e = Emulator::new();
        let load = e.load_source(src);
        assert!(load.contains("\"ok\":true"), "load failed: {load}");
        let _ = e.run(100_000);
        assert_eq!(
            e.led_matrix_rows(),
            vec![0x7E, 0x81, 0xA5, 0x81, 0xA5, 0x99, 0x81, 0x7E],
        );
    }

    #[test]
    fn parse_error_carries_line_column() {
        // First line is fine; the comma right after `mov` on line 2 is
        // not a valid operand and triggers a parse error there.
        let src = "nop\nmov ,\n";
        let out = compile_and_run(src, 1000);
        assert!(out.contains("\"ok\":false"));
        assert!(out.contains("\"line\":2"), "got: {out}");
    }
}
