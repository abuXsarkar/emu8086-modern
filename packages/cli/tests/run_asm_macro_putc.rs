//! End-to-end: a `name MACRO ... ENDM` definition with arguments expands
//! correctly through the preprocessor and runs through the CLI.

use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    p.pop();
    p.pop();
    p.push(if cfg!(windows) { "m86.exe" } else { "m86" });
    p
}

fn examples_macro_putc() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("macro_putc.asm");
    p
}

#[test]
fn run_asm_macro_putc_prints_hi() {
    let out = Command::new(cli_path())
        .arg("run-asm")
        .arg(examples_macro_putc())
        .output()
        .expect("spawn cli");

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(String::from_utf8_lossy(&out.stdout), "Hi\n");
}
