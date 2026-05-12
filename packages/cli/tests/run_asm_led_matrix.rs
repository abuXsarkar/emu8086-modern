//! End-to-end: assemble examples/led_matrix.asm and run it through the
//! CLI. The program writes 16 bytes (alternating row-address + row-data)
//! to the LED-matrix ports and halts; it produces no console output, so
//! the test asserts a clean exit and an empty stdout. Real device-state
//! verification lives in the wasm-api unit tests, which can read
//! `led_matrix_rows()` directly.

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

fn example_path() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop(); // packages
    p.pop(); // workspace root
    p.push("examples");
    p.push("led_matrix.asm");
    p
}

#[test]
fn run_asm_led_matrix_halts_cleanly() {
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
