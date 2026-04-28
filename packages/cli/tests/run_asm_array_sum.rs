//! End-to-end: examples/array_sum.asm walks an array via LODSB and prints 55.

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

fn examples_array_sum() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("array_sum.asm");
    p
}

#[test]
fn run_asm_array_sum_prints_55() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(examples_array_sum())
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
