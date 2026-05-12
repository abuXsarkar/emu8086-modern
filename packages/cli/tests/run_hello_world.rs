//! End-to-end: hand-assembled "Hello, world!" goes through the CLI and
//! comes out on stdout.

use std::io::Write as _;
use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    // tests are at target/debug/deps/run_hello_world-<hash>; we want
    // target/debug/emu8086.
    p.pop(); // deps
    p.pop(); // debug or release
    p.push(if cfg!(windows) { "m86.exe" } else { "m86" });
    p
}

#[test]
fn cli_runs_hand_assembled_hello_world() {
    // Layout (loaded at CS:0x100):
    //   0x100: BA 0F 01     mov dx, 0x010F     ; offset of the string
    //   0x103: B4 09        mov ah, 09h
    //   0x105: CD 21        int 21h
    //   0x107: B8 00 4C     mov ax, 0x4C00
    //   0x10A: CD 21        int 21h
    //   0x10C: 90 90 90     pad to 0x10F
    //   0x10F: "Hello, world!$"
    let mut prog: Vec<u8> = vec![
        0xBA, 0x0F, 0x01, // mov dx, 0x010F
        0xB4, 0x09, // mov ah, 09h
        0xCD, 0x21, // int 21h
        0xB8, 0x00, 0x4C, // mov ax, 0x4C00
        0xCD, 0x21, // int 21h
        0x90, 0x90, 0x90, // padding to 0x10F
    ];
    prog.extend_from_slice(b"Hello, world!$");

    // Write to a temp file. Use `std::env::temp_dir()` directly so we
    // don't pull in a `tempfile` crate dependency just for this.
    let dir = std::env::temp_dir();
    let path = dir.join("m86_e2e_hello.com");
    {
        let mut f = std::fs::File::create(&path).expect("create temp");
        f.write_all(&prog).expect("write temp");
    }

    let out = Command::new(cli_path())
        .arg("run")
        .arg(&path)
        .output()
        .expect("spawn cli");

    let _ = std::fs::remove_file(&path);

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    assert_eq!(
        String::from_utf8_lossy(&out.stdout),
        "Hello, world!",
        "cli stdout mismatch"
    );
}
