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
    fn parse_error_carries_line_column() {
        // First line is fine; the comma right after `mov` on line 2 is
        // not a valid operand and triggers a parse error there.
        let src = "nop\nmov ,\n";
        let out = compile_and_run(src, 1000);
        assert!(out.contains("\"ok\":false"));
        assert!(out.contains("\"line\":2"), "got: {out}");
    }
}
