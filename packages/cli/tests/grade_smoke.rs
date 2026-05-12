//! End-to-end: the autograder accepts a YAML spec + sample submission
//! and reports the right pass/fail counts. Also verifies the JUnit XML
//! output is well-formed when `--junit` is passed.

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

fn assignment_root() -> std::path::PathBuf {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let mut p = std::path::PathBuf::from(manifest);
    p.pop();
    p.pop();
    p.push("examples");
    p.push("assignments");
    p.push("sum10");
    p
}

#[test]
fn grade_passing_submission_reports_one_of_one_pass() {
    let dir = assignment_root();
    let spec = dir.join("spec.yml");
    let sub = dir.join("submission.asm");
    let out = Command::new(cli_path())
        .arg("grade")
        .arg(&spec)
        .arg(&sub)
        .output()
        .expect("spawn cli");
    assert!(
        out.status.success(),
        "grade exit non-zero: status={:?} stderr={:?}",
        out.status,
        String::from_utf8_lossy(&out.stderr),
    );
    let s = String::from_utf8_lossy(&out.stdout);
    assert!(s.contains("1/1 passed"), "got: {s}");
}

#[test]
fn grade_emits_junit_xml_when_requested() {
    let dir = assignment_root();
    let spec = dir.join("spec.yml");
    let sub = dir.join("submission.asm");
    let xml_path = std::env::temp_dir().join("m86_grade_junit.xml");
    let _ = std::fs::remove_file(&xml_path);

    let out = Command::new(cli_path())
        .arg("grade")
        .arg("--junit")
        .arg(&xml_path)
        .arg(&spec)
        .arg(&sub)
        .output()
        .expect("spawn cli");
    assert!(out.status.success());

    let xml = std::fs::read_to_string(&xml_path).expect("read junit xml");
    assert!(xml.contains("<testsuite"));
    assert!(xml.contains("tests=\"1\""));
    assert!(xml.contains("failures=\"0\""));
    let _ = std::fs::remove_file(&xml_path);
}
