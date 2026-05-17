//! m85 — headless Intel 8085 runner.
//!
//! Same core + assembler as the web IDE; exposed as a binary so CI
//! pipelines, autograders, and lab-submission scripts can drive it
//! without spinning up a browser.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::items_after_statements,
    clippy::doc_markdown,
    clippy::too_many_lines,
    clippy::cast_possible_truncation,
    clippy::cast_lossless,
    clippy::cast_precision_loss,
    clippy::struct_excessive_bools,
    clippy::needless_range_loop,
    clippy::module_name_repetitions
)]

use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use modern8085_assembler::assemble;
use modern8085_core::{exec, Cpu, Memory, StopReason};
use serde::Serialize;

#[derive(Parser, Debug)]
#[command(
    name = "m85",
    version,
    about = "Headless Intel 8085 runner — assemble + execute from the CLI"
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Print the embedded core + assembler versions.
    Version,
    /// Assemble a source file into a raw byte image.
    Assemble {
        input: PathBuf,
        /// Output path. Defaults to the input with `.bin` extension.
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Assemble + execute a source file. Prints final CPU + flag state
    /// as JSON to stdout. Exit code mirrors the stop reason:
    ///   0 = halted (clean exit)
    ///   1 = budget exhausted, invalid opcode, IO trap, or other stop
    ///   2 = failed to assemble or to read the input
    Run {
        input: PathBuf,
        /// Cap on instructions executed. Default = 1 000 000.
        #[arg(long, default_value_t = 1_000_000)]
        max_steps: u64,
        /// Pre-load `ADDR=BYTE` into memory before execution. Repeat
        /// the flag per byte. Address + byte are hex with an optional
        /// `H` suffix or `0x` prefix.
        /// Example: `--poke 2050=12H --poke 2051=34H`
        #[arg(long)]
        poke: Vec<String>,
        /// Comma-separated list of breakpoint addresses (hex).
        /// Example: `--bp 2010,2017`
        #[arg(long)]
        bp: Option<String>,
        /// Also dump a slice of memory after the run. Format:
        /// `<addr>,<length>` (hex). Example: `--mem-dump 3050,16`.
        #[arg(long)]
        mem_dump: Option<String>,
    },
}

#[derive(Serialize)]
struct StateOut {
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
    halted: bool,
    stop: String,
    bytes_loaded: usize,
    origin: u16,
    mem_dump: Option<String>,
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("m85: {e:?}");
            ExitCode::from(2)
        }
    }
}

fn run(cli: Cli) -> Result<ExitCode> {
    match cli.cmd {
        Cmd::Version => {
            println!("m85 (core {})", env!("CARGO_PKG_VERSION"));
            Ok(ExitCode::SUCCESS)
        }
        Cmd::Assemble { input, output } => cmd_assemble(&input, output),
        Cmd::Run {
            input,
            max_steps,
            poke,
            bp,
            mem_dump,
        } => cmd_run(&input, max_steps, &poke, bp.as_deref(), mem_dump.as_deref()),
    }
}

fn cmd_assemble(input: &PathBuf, output: Option<PathBuf>) -> Result<ExitCode> {
    let source =
        fs::read_to_string(input).with_context(|| format!("reading {}", input.display()))?;
    let out = assemble(&source).map_err(|e| anyhow!("assemble failed: {e}"))?;
    let dest = output.unwrap_or_else(|| input.with_extension("bin"));
    fs::write(&dest, &out.bytes).with_context(|| format!("writing {}", dest.display()))?;
    eprintln!(
        "wrote {} bytes to {} (origin {:#06X})",
        out.bytes.len(),
        dest.display(),
        out.origin
    );
    Ok(ExitCode::SUCCESS)
}

fn cmd_run(
    input: &PathBuf,
    max_steps: u64,
    pokes: &[String],
    bp_csv: Option<&str>,
    mem_dump_spec: Option<&str>,
) -> Result<ExitCode> {
    let source =
        fs::read_to_string(input).with_context(|| format!("reading {}", input.display()))?;
    let out = assemble(&source).map_err(|e| anyhow!("assemble failed: {e}"))?;

    let mut cpu = Cpu::new();
    let mut mem = Memory::new();
    mem.load(out.origin, &out.bytes);
    cpu.pc = out.origin;
    cpu.sp = 0xFFFE;

    for spec in pokes {
        let (addr, val) = parse_poke(spec)
            .with_context(|| format!("--poke {spec}: expected ADDR=BYTE in hex"))?;
        mem.write(addr, val);
    }

    let bps: Vec<u16> = match bp_csv {
        None => Vec::new(),
        Some(csv) => csv
            .split(',')
            .map(parse_hex16)
            .collect::<Result<Vec<_>>>()
            .context("parsing --bp")?,
    };

    let stop = exec::run(&mut cpu, &mut mem, max_steps, &bps);
    let halted = matches!(stop, StopReason::Halted);

    let mem_dump = match mem_dump_spec {
        None => None,
        Some(spec) => Some(format_mem_dump(spec, &mem)?),
    };

    let view = StateOut {
        a: cpu.a,
        b: cpu.b,
        c: cpu.c,
        d: cpu.d,
        e: cpu.e,
        h: cpu.h,
        l: cpu.l,
        sp: cpu.sp,
        pc: cpu.pc,
        s: cpu.flags.s,
        z: cpu.flags.z,
        ac: cpu.flags.ac,
        p: cpu.flags.p,
        cy: cpu.flags.cy,
        halted,
        stop: format!("{stop:?}"),
        bytes_loaded: out.bytes.len(),
        origin: out.origin,
        mem_dump,
    };
    println!("{}", serde_json::to_string_pretty(&view)?);

    Ok(if halted {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    })
}

fn parse_poke(spec: &str) -> Result<(u16, u8)> {
    let (addr_str, val_str) = spec.split_once('=').ok_or_else(|| anyhow!("missing `=`"))?;
    let addr = parse_hex16(addr_str)?;
    let val = parse_hex8(val_str)?;
    Ok((addr, val))
}

fn parse_hex16(s: &str) -> Result<u16> {
    let raw = strip_hex_suffix(s.trim());
    u16::from_str_radix(raw, 16).map_err(|e| anyhow!("`{s}` is not a 16-bit hex value: {e}"))
}

fn parse_hex8(s: &str) -> Result<u8> {
    let raw = strip_hex_suffix(s.trim());
    u8::from_str_radix(raw, 16).map_err(|e| anyhow!("`{s}` is not an 8-bit hex value: {e}"))
}

fn strip_hex_suffix(s: &str) -> &str {
    let s = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .unwrap_or(s);
    s.strip_suffix('H')
        .or_else(|| s.strip_suffix('h'))
        .unwrap_or(s)
}

fn format_mem_dump(spec: &str, mem: &Memory) -> Result<String> {
    let (addr_str, len_str) = spec
        .split_once(',')
        .ok_or_else(|| anyhow!("--mem-dump format is ADDR,LEN"))?;
    let addr = parse_hex16(addr_str)?;
    let len: usize = len_str
        .trim()
        .parse()
        .map_err(|e| anyhow!("--mem-dump length `{len_str}` is not a number: {e}"))?;
    let mut s = String::with_capacity(len * 2);
    for i in 0..len {
        use std::fmt::Write;
        let _ = write!(&mut s, "{:02X}", mem.read(addr.wrapping_add(i as u16)));
    }
    Ok(s)
}
