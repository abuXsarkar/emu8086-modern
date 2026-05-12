//! End-to-end: stackdemo.asm prints "321\n", confirming push/pop LIFO order.

use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    p.pop();
    p.pop();
    p.push(if cfg!(windows) { "m86.exe" } else { "m86" });
    p
}

fn examples_stackdemo() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("stackdemo.asm");
    p
}

#[test]
fn run_asm_stackdemo_prints_321() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(examples_stackdemo())
        .output()
        .expect("spawn cli");

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(String::from_utf8_lossy(&out.stdout), "321\n");
}
