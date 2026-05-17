//! m51 — headless Intel 8051 runner.
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
use modern8051_assembler::assemble;
use modern8051_core::{exec, Cpu, Memory, StopReason};
use serde::Serialize;

#[derive(Parser, Debug)]
#[command(
    name = "m51",
    version,
    about = "Headless Intel 8051 runner — assemble + execute from the CLI"
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
    ///   0 = halted at `SJMP $` (clean exit)
    ///   1 = budget exhausted, invalid opcode, breakpoint, or other stop
    ///   2 = failed to assemble or to read the input
    Run {
        input: PathBuf,
        /// Cap on instructions executed. Default = 1 000 000.
        #[arg(long, default_value_t = 1_000_000)]
        max_steps: u64,
        /// Pre-load `SPACE:ADDR=BYTE` into memory before execution.
        /// SPACE is `idata` (default if omitted) or `xdata`.
        /// Addresses + bytes are hex with an optional `H` suffix or
        /// `0x` prefix. Repeat the flag per byte.
        /// Example: `--poke idata:30=12 --poke xdata:1000=AA`
        #[arg(long)]
        poke: Vec<String>,
        /// Comma-separated list of breakpoint PCs (hex).
        /// Example: `--bp 0x0010,0x0020`
        #[arg(long)]
        bp: Option<String>,
        /// Also dump a slice of memory after the run. Format:
        /// `[SPACE:]<addr>,<length>` where SPACE is `idata` (default),
        /// `xdata`, or `code`. Example: `--mem-dump xdata:2000,16`.
        #[arg(long)]
        mem_dump: Option<String>,
    },
}

#[derive(Serialize)]
struct StateOut {
    a: u8,
    b: u8,
    dptr: u16,
    sp: u8,
    pc: u16,
    /// Active register bank R0..R7 (resolved via PSW.RS1:RS0).
    r: [u8; 8],
    cy: bool,
    ac: bool,
    f0: bool,
    rs1: bool,
    rs0: bool,
    ov: bool,
    f1: bool,
    p: bool,
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
            eprintln!("m51: {e:?}");
            ExitCode::from(2)
        }
    }
}

fn run(cli: Cli) -> Result<ExitCode> {
    match cli.cmd {
        Cmd::Version => {
            println!("m51 (core {})", env!("CARGO_PKG_VERSION"));
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
    mem.load_code(out.origin, &out.bytes);
    cpu.pc = out.origin;

    for spec in pokes {
        apply_poke(spec, &mut mem)
            .with_context(|| format!("--poke {spec}: expected [SPACE:]ADDR=BYTE in hex"))?;
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
    let halted = matches!(stop, StopReason::SelfJump(_));

    let mem_dump = match mem_dump_spec {
        None => None,
        Some(spec) => Some(format_mem_dump(spec, &mem)?),
    };

    let bank_base = cpu.psw.bank() * 8;
    let r: [u8; 8] = std::array::from_fn(|i| mem.idata_read(bank_base + i as u8));

    let view = StateOut {
        a: cpu.a,
        b: cpu.b,
        dptr: cpu.dptr,
        sp: cpu.sp,
        pc: cpu.pc,
        r,
        cy: cpu.psw.cy,
        ac: cpu.psw.ac,
        f0: cpu.psw.f0,
        rs1: cpu.psw.rs1,
        rs0: cpu.psw.rs0,
        ov: cpu.psw.ov,
        f1: cpu.psw.f1,
        p: cpu.psw.p,
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

enum Space {
    Idata,
    Xdata,
    Code,
}

fn parse_space(s: &str) -> Result<Space> {
    match s.to_ascii_lowercase().as_str() {
        "idata" | "i" => Ok(Space::Idata),
        "xdata" | "x" => Ok(Space::Xdata),
        "code" | "c" => Ok(Space::Code),
        _ => Err(anyhow!("unknown memory space `{s}` (use idata/xdata/code)")),
    }
}

fn split_space_addr(spec: &str) -> Result<(Space, &str)> {
    if let Some((space, rest)) = spec.split_once(':') {
        Ok((parse_space(space)?, rest))
    } else {
        Ok((Space::Idata, spec))
    }
}

fn apply_poke(spec: &str, mem: &mut Memory) -> Result<()> {
    let (space, rest) = split_space_addr(spec)?;
    let (addr_str, val_str) = rest.split_once('=').ok_or_else(|| anyhow!("missing `=`"))?;
    let val = parse_hex8(val_str)?;
    match space {
        Space::Idata => {
            mem.idata_write(parse_hex8(addr_str)?, val);
        }
        Space::Xdata => {
            mem.xdata_write(parse_hex16(addr_str)?, val);
        }
        Space::Code => return Err(anyhow!("can't --poke into code space")),
    }
    Ok(())
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
    let (space, rest) = split_space_addr(spec)?;
    let (addr_str, len_str) = rest
        .split_once(',')
        .ok_or_else(|| anyhow!("--mem-dump format is [SPACE:]ADDR,LEN"))?;
    let len: usize = len_str
        .trim()
        .parse()
        .map_err(|e| anyhow!("--mem-dump length `{len_str}` is not a number: {e}"))?;
    let mut s = String::with_capacity(len * 2);
    use std::fmt::Write;
    match space {
        Space::Idata => {
            let base = parse_hex8(addr_str)?;
            for i in 0..len {
                let _ = write!(&mut s, "{:02X}", mem.idata_read(base.wrapping_add(i as u8)));
            }
        }
        Space::Xdata => {
            let base = parse_hex16(addr_str)?;
            for i in 0..len {
                let _ = write!(
                    &mut s,
                    "{:02X}",
                    mem.xdata_read(base.wrapping_add(i as u16))
                );
            }
        }
        Space::Code => {
            let base = parse_hex16(addr_str)?;
            for i in 0..len {
                let _ = write!(&mut s, "{:02X}", mem.code_read(base.wrapping_add(i as u16)));
            }
        }
    }
    Ok(s)
}
