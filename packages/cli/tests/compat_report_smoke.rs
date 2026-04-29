//! End-to-end: `compat-report` walks /examples and reports all ten
//! example programs assemble cleanly under the current dialect.

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

fn examples_dir() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p
}

#[test]
fn compat_report_examples_all_pass() {
    let out = Command::new(cli_path())
        .arg("compat-report")
        .arg(examples_dir())
        .output()
        .expect("spawn cli");
    assert!(
        out.status.success(),
        "compat-report exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    let s = String::from_utf8_lossy(&out.stdout);
    // The trailing tally must say n/n with no failures. We don't lock
    // in the exact count so adding more examples doesn't churn this
    // test.
    assert!(
        s.contains("/") && s.contains("pass"),
        "missing tally line: {s}"
    );
    let last_line = s.lines().rfind(|l| l.contains("pass")).unwrap_or("");
    let summary = last_line.replace("---", "").trim().to_string();
    let head = summary.split_whitespace().next().unwrap_or("");
    let parts: Vec<&str> = head.split('/').collect();
    assert_eq!(parts.len(), 2, "expected n/m header, got {head:?}");
    let pass: u32 = parts[0].parse().expect("pass count");
    let total: u32 = parts[1].parse().expect("total count");
    assert_eq!(pass, total, "compat: {pass}/{total} examples pass");
    assert!(total >= 10, "expected ≥10 examples, found {total}");
}

#[test]
fn compat_report_excludes_filter_files() {
    // `--exclude lib/` should drop examples/lib/stdlib.asm from the
    // walk (it's an include-only macro pack that assembles to zero
    // bytes — counted but uninteresting). The total should drop by at
    // least one and not list `lib/stdlib.asm` in the body.
    let baseline = Command::new(cli_path())
        .arg("compat-report")
        .arg(examples_dir())
        .output()
        .expect("spawn cli");
    let baseline_total: u32 = parse_total(&baseline.stdout);

    let filtered = Command::new(cli_path())
        .arg("compat-report")
        .arg(examples_dir())
        .arg("--exclude")
        .arg("lib/")
        .output()
        .expect("spawn cli");
    let s = String::from_utf8_lossy(&filtered.stdout);
    let filtered_total: u32 = parse_total(&filtered.stdout);

    assert!(
        filtered_total < baseline_total,
        "expected --exclude to drop at least one file (baseline {baseline_total}, filtered {filtered_total})",
    );
    assert!(
        !s.contains("lib/stdlib.asm"),
        "lib/stdlib.asm should have been excluded:\n{s}",
    );
}

fn parse_total(stdout: &[u8]) -> u32 {
    let s = String::from_utf8_lossy(stdout);
    let last_line = s.lines().rfind(|l| l.contains("pass")).unwrap_or("");
    let summary = last_line.replace("---", "").trim().to_string();
    let head = summary.split_whitespace().next().unwrap_or("");
    let total = head.split('/').nth(1).unwrap_or("");
    total.parse().expect("total count")
}
