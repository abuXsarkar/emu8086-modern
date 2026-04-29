//! `compat-report`: walk a directory of `.asm` files, try to assemble
//! each, and print a table of which ones pass / fail and why. Lets an
//! institute decide whether its existing lab corpus runs on this
//! assembler before adopting it as their teaching tool.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Context;
use emu8086_assembler::{assemble, Dialect};

use crate::include;

pub fn run(root: &Path, excludes: &[String]) -> anyhow::Result<u8> {
    let mut files: Vec<PathBuf> = Vec::new();
    walk(root, &mut files)?;
    files.sort();

    // Honor `--exclude PATTERN`: skip files whose path-relative-to-root
    // contains the pattern as a substring (after normalizing separators
    // to '/'). This is a cheap stand-in for full glob matching that
    // covers the common "skip lib/" case without dragging in a glob
    // crate.
    if !excludes.is_empty() {
        files.retain(|f| {
            let rel = f
                .strip_prefix(root)
                .unwrap_or(f)
                .to_string_lossy()
                .replace('\\', "/");
            !excludes.iter().any(|pat| rel.contains(pat))
        });
    }

    if files.is_empty() {
        eprintln!(
            "compat-report: no .asm files found under {}",
            root.display()
        );
        return Ok(0);
    }

    let mut passed = 0usize;
    let mut failed: Vec<(PathBuf, String)> = Vec::new();
    let mut total_bytes = 0usize;

    println!("=== compat report ({} files) ===", files.len());
    for f in &files {
        let rel = f.strip_prefix(root).unwrap_or(f);
        let raw = fs::read_to_string(f).with_context(|| format!("reading {}", f.display()))?;
        let source = include::resolve(&raw, f).unwrap_or(raw);
        match assemble(&source, Dialect::default()) {
            Ok(img) => {
                passed += 1;
                total_bytes += img.bytes.len();
                println!("  ✓ {} ({} bytes)", rel.display(), img.bytes.len());
            }
            Err(e) => {
                let msg = format!("{e}");
                println!("  ✗ {}", rel.display());
                println!("      {msg}");
                failed.push((rel.to_path_buf(), msg));
            }
        }
    }

    println!(
        "--- {}/{} pass ({} bytes total in passing files) ---",
        passed,
        files.len(),
        total_bytes
    );
    Ok(u8::from(!failed.is_empty()))
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> anyhow::Result<()> {
    if !dir.is_dir() {
        // Allow passing a single file too.
        if dir.extension().is_some_and(|e| e == "asm") {
            out.push(dir.to_path_buf());
        }
        return Ok(());
    }
    for entry in
        fs::read_dir(dir).with_context(|| format!("reading directory {}", dir.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            walk(&path, out)?;
        } else if path.extension().is_some_and(|e| e == "asm") {
            out.push(path);
        }
    }
    Ok(())
}
