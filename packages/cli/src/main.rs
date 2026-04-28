//! emu8086 — headless runner and autograder.
//!
//! M0 status: subcommand wiring only. Real behavior lands milestone-by-milestone.

#![forbid(unsafe_code)]
#![warn(clippy::all, clippy::pedantic)]

use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "emu8086", version, about = "Headless 8086 runner and autograder")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Print the embedded core version (M0 hello-world).
    Version,
    /// Assemble a source file (M2).
    Assemble { input: String },
    /// Run an assembled image (M1).
    Run { image: String },
    /// Trace a program and emit JSON (M1).
    Trace { input: String },
    /// Grade a submission against a YAML spec (M5).
    Grade { spec: String, submission: String },
    /// Walk a directory and report compatibility issues (M2).
    CompatReport { path: String },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Version => {
            println!("emu8086-core {}", emu8086_core::version());
            Ok(())
        }
        Cmd::Assemble { .. }
        | Cmd::Run { .. }
        | Cmd::Trace { .. }
        | Cmd::Grade { .. }
        | Cmd::CompatReport { .. } => {
            anyhow::bail!("subcommand not yet implemented; see ROADMAP.md")
        }
    }
}
