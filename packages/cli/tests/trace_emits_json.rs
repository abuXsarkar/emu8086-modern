//! End-to-end: `m86 trace` emits a JSON array of step records.

use std::process::Command;

fn cli_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("current_exe");
    p.pop();
    p.pop();
    p.push(if cfg!(windows) { "m86.exe" } else { "m86" });
    p
}

fn examples_hello() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("hello.asm");
    p
}

#[test]
fn trace_emits_valid_json_with_step_records() {
    let out = Command::new(cli_path())
        .arg("trace")
        .arg(examples_hello())
        .output()
        .expect("spawn cli");

    assert!(
        out.status.success(),
        "cli exited non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );

    // Parse the JSON output. We expect at least 4 entries: mov dx ;
    // mov ah ; int (puts) ; mov ax ; int (exit). The last entry's
    // `rec.mnemonic` should be `int` and `rec.stopped` should not be
    // null (we halted on the 4Ch terminate call).
    let text = String::from_utf8_lossy(&out.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("trace output not valid JSON: {e}\n--\n{text}\n--"));
    let arr = parsed.as_array().expect("trace output is an array");
    assert!(
        arr.len() >= 4,
        "expected at least 4 step records, got {}",
        arr.len()
    );
    let last = arr.last().unwrap();
    assert_eq!(last["rec"]["mnemonic"], "int");
    assert!(
        !last["rec"]["stopped"].is_null(),
        "last step should report a stop reason"
    );
}
