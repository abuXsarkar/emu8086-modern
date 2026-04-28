//! emu8086 — headless runner and autograder.
//!
//! Subcommands grow with each milestone. See ROADMAP.md.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]

use std::fs;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use emu8086_core::Cpu;

#[derive(Parser, Debug)]
#[command(
    name = "emu8086",
    version,
    about = "Headless 8086 runner and autograder"
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Print the embedded core version (M0 hello-world).
    Version,
    /// Run a `.com`-style raw image (loaded at CS:0x100 with all segments
    /// equal). Reads bytes from `image`, executes until HLT or step budget,
    /// and writes anything the program sent to DOS console (INT 21h fn 02h
    /// or 09h) to this process's stdout.
    Run {
        /// Path to the raw program image.
        image: PathBuf,
        /// Hard cap on instructions executed before we abort. Prevents a
        /// runaway loop from hanging the runner.
        #[arg(long, default_value_t = 1_000_000)]
        max_steps: usize,
    },
    /// Assemble a source file (M2 — not yet implemented).
    Assemble { input: PathBuf },
    /// Trace a program and emit JSON (M1 — not yet implemented).
    Trace { input: PathBuf },
    /// Grade a submission against a YAML spec (M5 — not yet implemented).
    Grade { spec: PathBuf, submission: PathBuf },
    /// Walk a directory and report compatibility issues (M2 — not yet implemented).
    CompatReport { path: PathBuf },
}

fn cmd_run(image_path: &PathBuf, max_steps: usize) -> anyhow::Result<u8> {
    let bytes = fs::read(image_path)?;
    let mut cpu = Cpu::new();
    cpu.load_com(&bytes);
    let steps = cpu.run_until_halt(max_steps);

    // Always flush whatever the program wrote, even on a runaway abort.
    let mut out = std::io::stdout().lock();
    out.write_all(&cpu.stdout)?;
    out.flush()?;

    if !cpu.halted {
        eprintln!(
            "emu8086: aborted after {steps} steps (limit reached). \
             Use --max-steps to raise the cap."
        );
        return Ok(1);
    }
    Ok(cpu.exit_code.unwrap_or(0))
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let result: anyhow::Result<u8> = match cli.cmd {
        Cmd::Version => {
            println!("emu8086-core {}", emu8086_core::version());
            Ok(0)
        }
        Cmd::Run { image, max_steps } => cmd_run(&image, max_steps),
        Cmd::Assemble { .. } | Cmd::Trace { .. } | Cmd::Grade { .. } | Cmd::CompatReport { .. } => {
            eprintln!("emu8086: subcommand not yet implemented; see ROADMAP.md");
            Ok(2)
        }
    };
    match result {
        Ok(code) => ExitCode::from(code),
        Err(e) => {
            eprintln!("emu8086: {e}");
            ExitCode::from(1)
        }
    }
}
