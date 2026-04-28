//! End-to-end: examples/sum.asm computes 1+...+10 = 55 and prints it.

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

fn examples_sum() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("sum.asm");
    p
}

#[test]
fn run_asm_prints_sum_55() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(examples_sum())
        .output()
        .expect("spawn cli");

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(String::from_utf8_lossy(&out.stdout), "55\n");
}
