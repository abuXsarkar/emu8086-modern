//! End-to-end: assemble examples/screen.asm and run it through the
//! CLI. The program writes "HELLO" to text-mode video memory and
//! halts. video_text() coverage lives in the wasm-api unit tests; the
//! CLI test just guards that the example assembles + halts cleanly.

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
    p.push("screen.asm");
    p
}

#[test]
fn run_asm_screen_halts_cleanly() {
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
