//! m86 — headless runner and autograder.
//!
//! Subcommands grow with each milestone. See ROADMAP.md.

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
    clippy::cast_precision_loss
)]

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use modern8086_assembler::{assemble, AssembleError, Dialect};
use modern8086_core::Cpu;

mod compat;
mod grade;
mod include;

#[derive(Parser, Debug)]
#[command(name = "m86", version, about = "Headless 8086 runner and autograder")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Print the embedded core version.
    Version,
    /// Run a `.com`-style raw image (loaded at CS:0x100).
    Run {
        image: PathBuf,
        #[arg(long, default_value_t = 1_000_000)]
        max_steps: usize,
    },
    /// Assemble a `.asm` source file into a raw image.
    Assemble {
        input: PathBuf,
        /// Output path. Defaults to the input with `.com` extension.
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Assemble and run a `.asm` source file in one step.
    RunAsm {
        input: PathBuf,
        #[arg(long, default_value_t = 1_000_000)]
        max_steps: usize,
    },
    /// Trace a `.asm` source file and emit a JSON array of step records.
    /// One record per executed instruction; useful for autograding,
    /// regression testing, and (later) time-travel debugging.
    Trace {
        input: PathBuf,
        #[arg(long, default_value_t = 1_000_000)]
        max_steps: usize,
    },
    /// Grade a submission against a YAML test spec. Each case seeds
    /// initial memory + register state, runs the program, and asserts
    /// post-run state. Exit 0 = all pass, 1 = any failure, 2 = the
    /// submission failed to assemble or the spec couldn't be read.
    Grade {
        /// Path to the YAML spec.
        spec: PathBuf,
        /// Path to the student submission (.asm).
        submission: PathBuf,
        /// Optionally write a JUnit XML report alongside the
        /// human-readable summary.
        #[arg(long)]
        junit: Option<PathBuf>,
    },
    /// Walk a directory of `.asm` files and report which assemble
    /// cleanly under this dialect. Pass a single file path to check
    /// just that one. Exit 0 if everything passes, 1 otherwise.
    CompatReport {
        path: PathBuf,
        /// Skip files whose relative path contains the given substring.
        /// Repeat the flag for multiple patterns. Common case:
        /// `--exclude lib/` to ignore include-only macro packs that
        /// assemble to zero bytes.
        #[arg(long = "exclude", value_name = "PATTERN")]
        excludes: Vec<String>,
    },
}

fn run_image(image_bytes: &[u8], max_steps: usize) -> anyhow::Result<u8> {
    let mut cpu = Cpu::new();
    cpu.load_com(image_bytes);
    let steps = cpu.run_until_halt(max_steps);

    {
        let mut out = std::io::stdout().lock();
        out.write_all(&cpu.stdout)?;
        out.flush()?;
    }

    if !cpu.halted {
        eprintln!(
            "m86: aborted after {steps} steps (limit reached). \
             Use --max-steps to raise the cap."
        );
        return Ok(1);
    }
    Ok(cpu.exit_code.unwrap_or(0))
}

fn cmd_run(image_path: &Path, max_steps: usize) -> anyhow::Result<u8> {
    let bytes = fs::read(image_path)?;
    run_image(&bytes, max_steps)
}

fn cmd_assemble(input: &Path, output: Option<&Path>) -> anyhow::Result<u8> {
    let raw = fs::read_to_string(input)?;
    let source = include::resolve(&raw, input)?;
    let img = match assemble(&source, Dialect::default()) {
        Ok(img) => img,
        Err(e) => {
            print_assemble_error(input, &source, &e);
            return Ok(2);
        }
    };
    let out_path = if let Some(p) = output {
        p.to_path_buf()
    } else {
        let mut p = input.to_path_buf();
        p.set_extension("com");
        p
    };
    fs::write(&out_path, &img.bytes)?;
    eprintln!(
        "m86: wrote {} bytes to {} (origin={:#06X}, {} labels)",
        img.bytes.len(),
        out_path.display(),
        img.origin,
        img.labels.len()
    );
    Ok(0)
}

fn cmd_trace(input: &Path, max_steps: usize) -> anyhow::Result<u8> {
    let raw = fs::read_to_string(input)?;
    let source = include::resolve(&raw, input)?;
    let img = match assemble(&source, Dialect::default()) {
        Ok(img) => img,
        Err(e) => {
            print_assemble_error(input, &source, &e);
            return Ok(2);
        }
    };
    let mut cpu = Cpu::new();
    cpu.load_com(&img.bytes);

    #[derive(serde::Serialize)]
    struct TraceEntry<'a> {
        n: usize,
        ip_before: u16,
        cs: u16,
        rec: &'a modern8086_core::StepRecord,
        ax: u16,
        bx: u16,
        cx: u16,
        dx: u16,
        si: u16,
        di: u16,
        bp: u16,
        sp: u16,
        flags: u16,
    }

    let mut out = std::io::stdout().lock();
    writeln!(out, "[")?;
    let mut first = true;
    for n in 0..max_steps {
        let ip_before = cpu.regs.ip;
        let cs = cpu.regs.cs;
        let rec = cpu.step();
        let entry = TraceEntry {
            n,
            ip_before,
            cs,
            rec: &rec,
            ax: cpu.regs.ax,
            bx: cpu.regs.bx,
            cx: cpu.regs.cx,
            dx: cpu.regs.dx,
            si: cpu.regs.si,
            di: cpu.regs.di,
            bp: cpu.regs.bp,
            sp: cpu.regs.sp,
            flags: cpu.regs.flags.0,
        };
        if !first {
            writeln!(out, ",")?;
        }
        serde_json::to_writer(&mut out, &entry)?;
        first = false;
        if rec.stopped.is_some() {
            break;
        }
    }
    writeln!(out, "\n]")?;
    Ok(0)
}

fn cmd_run_asm(input: &Path, max_steps: usize) -> anyhow::Result<u8> {
    let raw = fs::read_to_string(input)?;
    let source = include::resolve(&raw, input)?;
    let img = match assemble(&source, Dialect::default()) {
        Ok(img) => img,
        Err(e) => {
            print_assemble_error(input, &source, &e);
            return Ok(2);
        }
    };
    run_image(&img.bytes, max_steps)
}

/// Pretty-print a diagnostic with a source line and caret.
fn print_assemble_error(input: &Path, source: &str, err: &AssembleError) {
    let (span, message) = match err {
        AssembleError::Lex(e) => (
            modern8086_assembler::Span::new(e.pos, e.pos + 1),
            e.msg.clone(),
        ),
        AssembleError::Preprocess(e) => (e.span, e.message.clone()),
        AssembleError::Parse(e) => (e.span, e.message.clone()),
        AssembleError::Encode(e) => (e.span, e.message.clone()),
    };
    let (line_no, col, line_text) = locate_span(source, span.start);
    eprintln!("error: {message}");
    eprintln!("  --> {}:{}:{}", input.display(), line_no, col);
    eprintln!("   |");
    eprintln!("{line_no:3} | {line_text}");
    let caret_col = col.saturating_sub(1);
    let caret_len = (span.end.saturating_sub(span.start)).max(1);
    eprintln!(
        "   | {pad}{caret}",
        pad = " ".repeat(caret_col),
        caret = "^".repeat(caret_len)
    );
}

fn locate_span(source: &str, byte_pos: usize) -> (usize, usize, &str) {
    let mut line_start = 0usize;
    let mut line_no = 1usize;
    for (i, b) in source.bytes().enumerate() {
        if i == byte_pos {
            break;
        }
        if b == b'\n' {
            line_no += 1;
            line_start = i + 1;
        }
    }
    let line_end = source[line_start..]
        .find('\n')
        .map_or(source.len(), |o| line_start + o);
    let col = byte_pos.saturating_sub(line_start) + 1;
    (line_no, col, &source[line_start..line_end])
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let result: anyhow::Result<u8> = match cli.cmd {
        Cmd::Version => {
            println!("modern8086-core {}", modern8086_core::version());
            Ok(0)
        }
        Cmd::Run { image, max_steps } => cmd_run(&image, max_steps),
        Cmd::Assemble { input, output } => cmd_assemble(&input, output.as_deref()),
        Cmd::RunAsm { input, max_steps } => cmd_run_asm(&input, max_steps),
        Cmd::Trace { input, max_steps } => cmd_trace(&input, max_steps),
        Cmd::Grade {
            spec,
            submission,
            junit,
        } => grade::run_spec(&spec, &submission, junit.as_deref()),
        Cmd::CompatReport { path, excludes } => compat::run(&path, &excludes),
    };
    match result {
        Ok(code) => ExitCode::from(code),
        Err(e) => {
            eprintln!("m86: {e}");
            ExitCode::from(1)
        }
    }
}
