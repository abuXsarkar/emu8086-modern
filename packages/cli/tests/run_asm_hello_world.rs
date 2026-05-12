//! End-to-end: assemble examples/hello.asm and run it through the CLI in
//! one step.

use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    p.pop();
    p.pop();
    p.push(if cfg!(windows) {
        "m86.exe"
    } else {
        "m86"
    });
    p
}

fn examples_hello() -> std::path::PathBuf {
    // Walk up from packages/cli to the workspace root.
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop(); // packages
    p.pop(); // workspace root
    p.push("examples");
    p.push("hello.asm");
    p
}

#[test]
fn run_asm_prints_hello_world() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(examples_hello())
        .output()
        .expect("spawn cli");

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(String::from_utf8_lossy(&out.stdout), "Hello, world!");
}
