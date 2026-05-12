//! End-to-end: assemble examples/stepper.asm and run it through the
//! CLI. The program drives the 4-coil wave pattern 16 times and halts;
//! it produces no console output. wasm-api unit tests verify the
//! step count + final coil pattern; this test just guards that the
//! example assembles and halts cleanly via the CLI.

use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    p.pop();
    p.pop();
    p.push(if cfg!(windows) { "m86.exe" } else { "m86" });
    p
}

fn example_path() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop(); // packages
    p.pop(); // workspace root
    p.push("examples");
    p.push("stepper.asm");
    p
}

#[test]
fn run_asm_stepper_halts_cleanly() {
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
    assert_eq!(String::from_utf8_lossy(&out.stdout), "");
}
