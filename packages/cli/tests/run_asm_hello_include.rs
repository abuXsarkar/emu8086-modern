//! End-to-end: `include "lib/stdlib.asm"` resolves at the CLI level
//! before assembly, and the program runs as if the stdlib were inlined.

use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    p.pop();
    p.pop();
    p.push(if cfg!(windows) { "m86.exe" } else { "m86" });
    p
}

fn examples_hello_include() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("hello_include.asm");
    p
}

#[test]
fn run_asm_hello_include_prints_message_and_newline() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(examples_hello_include())
        .output()
        .expect("spawn cli");
    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(String::from_utf8_lossy(&out.stdout), "Hello via include!\n");
}
