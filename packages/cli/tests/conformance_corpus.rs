//! Integration test: every program in `tests/conformance/` must
//! assemble cleanly under the current dialect. Adding a new program
//! to the directory automatically widens the assertion.
//!
//! The corpus is the regression net for the assembler. If a future
//! change breaks ADC, the BCD adjusts, or one of the 16 conditional
//! jumps, exactly one program in there stops assembling and CI
//! flags it. Each file is feature-grouped so the failing path
//! points at exactly which slice broke.

use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    p.pop();
    p.pop();
    p.push(if cfg!(windows) {
        "emu8086.exe"
    } else {
        "emu8086"
    });
    p
}

fn corpus_dir() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop(); // packages
    p.pop(); // workspace root
    p.push("tests");
    p.push("conformance");
    p
}

#[test]
fn conformance_corpus_all_pass() {
    let out = Command::new(cli_path())
        .arg("compat-report")
        .arg(corpus_dir())
        .output()
        .expect("spawn cli");

    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        out.status.success(),
        "compat-report failed: stdout={stdout}\nstderr={}",
        String::from_utf8_lossy(&out.stderr),
    );

    // The trailing tally must say n/n with no failures. We don't lock
    // in the exact count so adding more programs doesn't churn this
    // test — but we do require at least 6 to guard against an empty
    // corpus silently passing.
    let last_line = stdout.lines().rfind(|l| l.contains("pass")).unwrap_or("");
    let summary = last_line.replace("---", "").trim().to_string();
    let head = summary.split_whitespace().next().unwrap_or("");
    let parts: Vec<&str> = head.split('/').collect();
    assert_eq!(parts.len(), 2, "expected n/m header, got {head:?}");
    let pass: u32 = parts[0].parse().expect("pass count");
    let total: u32 = parts[1].parse().expect("total count");
    assert_eq!(pass, total, "conformance: {pass}/{total} pass");
    assert!(
        total >= 6,
        "expected ≥6 conformance programs, found {total}",
    );
}
