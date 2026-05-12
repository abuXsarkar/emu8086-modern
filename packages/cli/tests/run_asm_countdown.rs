//! End-to-end: countdown.asm prints "10 9 8 7 6 5 4 3 2 1 \n".

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

fn examples_countdown() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("countdown.asm");
    p
}

#[test]
fn run_asm_countdown_prints_10_to_1() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(examples_countdown())
        .output()
        .expect("spawn cli");

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(
        String::from_utf8_lossy(&out.stdout),
        "10 9 8 7 6 5 4 3 2 1 \n"
    );
}
