//! End-to-end: assemble examples/proc_hello.asm and run it through the
//! CLI. The example exercises the lab-manual idiom of `.MODEL SMALL`,
//! `main PROC NEAR ... main ENDP`, and `END main` boilerplate; if any
//! of those stop being treated as no-ops / labeled blocks the test
//! breaks loudly.

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

fn example_path() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop(); // packages
    p.pop(); // workspace root
    p.push("examples");
    p.push("proc_hello.asm");
    p
}

#[test]
fn run_asm_proc_hello_prints_message() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(example_path())
        .output()
        .expect("spawn cli");

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(String::from_utf8_lossy(&out.stdout), "Hello from PROC!");
}
