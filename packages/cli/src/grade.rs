//! Autograder. Loads a YAML spec describing test cases (initial
//! memory/registers + expected post-run state) and runs the
//! student's submission against each case in turn. Output is a
//! human-readable summary by default; `--junit <path>` additionally
//! writes a JUnit XML report so the result lands in any standard CI
//! gradebook (GitHub Classroom, GitLab CI, Jenkins, …).

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::Instant;

use anyhow::Context;
use modern8086_assembler::{assemble, Dialect};
use modern8086_core::{seg_off, Cpu, Flags as CoreFlags, Registers};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Spec {
    pub name: Option<String>,
    #[serde(default = "default_max_steps")]
    pub max_steps: u32,
    #[serde(default)]
    pub cases: Vec<Case>,
}

fn default_max_steps() -> u32 {
    1_000_000
}

#[derive(Debug, Deserialize)]
pub struct Case {
    pub name: String,
    #[serde(default)]
    pub setup: Setup,
    #[serde(default)]
    pub expect: Expect,
    /// Optional case-level cap, overrides the spec-level one.
    pub max_steps: Option<u32>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Setup {
    /// Map of "SEG:OFF" → bytes to plant before running.
    #[serde(default)]
    pub memory: BTreeMap<String, Vec<u8>>,
    /// Initial register values. Keys are case-insensitive.
    #[serde(default)]
    pub registers: BTreeMap<String, u16>,
}

#[derive(Debug, Default, Deserialize)]
pub struct Expect {
    /// Expected post-run register values.
    #[serde(default)]
    pub registers: BTreeMap<String, u16>,
    /// Expected post-run flag bits, 0 or 1.
    #[serde(default)]
    pub flags: BTreeMap<String, u8>,
    /// Expected stdout (exact match).
    pub stdout: Option<String>,
}

pub struct CaseResult {
    pub name: String,
    pub passed: bool,
    pub failures: Vec<String>,
    pub elapsed_ms: u128,
}

pub fn run_spec(
    spec_path: &Path,
    submission_path: &Path,
    junit_out: Option<&Path>,
) -> anyhow::Result<u8> {
    let spec_text = fs::read_to_string(spec_path)
        .with_context(|| format!("reading spec {}", spec_path.display()))?;
    let spec: Spec = serde_yaml::from_str(&spec_text)
        .with_context(|| format!("parsing spec {}", spec_path.display()))?;

    let source = fs::read_to_string(submission_path)
        .with_context(|| format!("reading submission {}", submission_path.display()))?;

    let img = match assemble(&source, Dialect::default()) {
        Ok(img) => img,
        Err(e) => {
            eprintln!(
                "m86: submission failed to assemble: {e}\n  -> {}",
                submission_path.display()
            );
            return Ok(2);
        }
    };

    let header = spec.name.unwrap_or_else(|| {
        spec_path
            .file_stem()
            .map_or_else(|| "spec".into(), |s| s.to_string_lossy().into())
    });
    println!("=== {header} ===");

    let mut results: Vec<CaseResult> = Vec::with_capacity(spec.cases.len());
    let cap_default = spec.max_steps;
    for case in &spec.cases {
        let started = Instant::now();
        let cap = case.max_steps.unwrap_or(cap_default) as usize;
        let mut cpu = Cpu::new();
        cpu.load_com(&img.bytes);
        // Seed initial register values from the spec.
        for (name, value) in &case.setup.registers {
            apply_register_setup(&mut cpu.regs, name, *value);
        }
        // Plant initial memory bytes.
        for (key, bytes) in &case.setup.memory {
            match parse_seg_off(key) {
                Some((seg, off)) => {
                    let lin = seg_off(seg, off);
                    cpu.mem.load(lin, bytes);
                }
                None => {
                    eprintln!(
                        "warning: case `{}`: memory key `{key}` is not `SEG:OFF`; skipping",
                        case.name
                    );
                }
            }
        }
        cpu.run_until_halt(cap);

        // Compare expected state.
        let mut failures: Vec<String> = Vec::new();
        for (name, expected) in &case.expect.registers {
            let actual = read_register(&cpu.regs, name);
            if actual != *expected {
                failures.push(format!(
                    "register {} expected 0x{:04X}, got 0x{:04X}",
                    name.to_ascii_uppercase(),
                    expected,
                    actual
                ));
            }
        }
        for (name, expected) in &case.expect.flags {
            let actual = read_flag(cpu.regs.flags, name);
            if actual != *expected {
                failures.push(format!(
                    "flag {} expected {}, got {}",
                    name.to_ascii_uppercase(),
                    expected,
                    actual
                ));
            }
        }
        if let Some(want) = &case.expect.stdout {
            let got = String::from_utf8_lossy(&cpu.stdout);
            if got != *want {
                failures.push(format!(
                    "stdout mismatch:\n  expected: {want:?}\n       got: {got:?}"
                ));
            }
        }
        let elapsed_ms = started.elapsed().as_millis();
        let passed = failures.is_empty();
        if passed {
            println!("  ✓ {} ({elapsed_ms} ms)", case.name);
        } else {
            println!("  ✗ {} ({elapsed_ms} ms)", case.name);
            for f in &failures {
                println!("      {f}");
            }
        }
        results.push(CaseResult {
            name: case.name.clone(),
            passed,
            failures,
            elapsed_ms,
        });
    }

    let total = results.len();
    let passed = results.iter().filter(|r| r.passed).count();
    println!("--- {passed}/{total} passed ---");

    if let Some(p) = junit_out {
        let xml = junit_xml(&header, &results);
        fs::write(p, xml).with_context(|| format!("writing junit xml to {}", p.display()))?;
        eprintln!("m86: wrote {}", p.display());
    }

    Ok(u8::from(passed != total))
}

fn parse_seg_off(s: &str) -> Option<(u16, u16)> {
    let (seg, off) = s.split_once(':')?;
    let seg = u16::from_str_radix(seg.trim_start_matches("0x"), 16).ok()?;
    let off = u16::from_str_radix(off.trim_start_matches("0x"), 16).ok()?;
    Some((seg, off))
}

fn apply_register_setup(regs: &mut Registers, name: &str, value: u16) {
    let lname = name.to_ascii_lowercase();
    match lname.as_str() {
        "ax" => regs.ax = value,
        "bx" => regs.bx = value,
        "cx" => regs.cx = value,
        "dx" => regs.dx = value,
        "si" => regs.si = value,
        "di" => regs.di = value,
        "bp" => regs.bp = value,
        "sp" => regs.sp = value,
        "ds" => regs.ds = value,
        "es" => regs.es = value,
        "ss" => regs.ss = value,
        "cs" => regs.cs = value,
        "ip" => regs.ip = value,
        "al" => regs.set_al(value as u8),
        "bl" => regs.set_bl(value as u8),
        "cl" => regs.set_cl(value as u8),
        "dl" => regs.set_dl(value as u8),
        "ah" => regs.set_ah(value as u8),
        "bh" => regs.set_bh(value as u8),
        "ch" => regs.set_ch(value as u8),
        "dh" => regs.set_dh(value as u8),
        _ => eprintln!("warning: unknown register name `{name}` in setup; skipping"),
    }
}

fn read_register(regs: &Registers, name: &str) -> u16 {
    match name.to_ascii_lowercase().as_str() {
        "ax" => regs.ax,
        "bx" => regs.bx,
        "cx" => regs.cx,
        "dx" => regs.dx,
        "si" => regs.si,
        "di" => regs.di,
        "bp" => regs.bp,
        "sp" => regs.sp,
        "ds" => regs.ds,
        "es" => regs.es,
        "ss" => regs.ss,
        "cs" => regs.cs,
        "ip" => regs.ip,
        "al" => u16::from(regs.al()),
        "bl" => u16::from(regs.bl()),
        "cl" => u16::from(regs.cl()),
        "dl" => u16::from(regs.dl()),
        "ah" => u16::from(regs.ah()),
        "bh" => u16::from(regs.bh()),
        "ch" => u16::from(regs.ch()),
        "dh" => u16::from(regs.dh()),
        _ => 0,
    }
}

fn read_flag(flags: CoreFlags, name: &str) -> u8 {
    let mask = match name.to_ascii_lowercase().as_str() {
        "cf" => CoreFlags::CF,
        "pf" => CoreFlags::PF,
        "af" => CoreFlags::AF,
        "zf" => CoreFlags::ZF,
        "sf" => CoreFlags::SF,
        "tf" => CoreFlags::TF,
        "if" => CoreFlags::IF,
        "df" => CoreFlags::DF,
        "of" => CoreFlags::OF,
        _ => return 0,
    };
    u8::from(flags.get(mask))
}

fn junit_xml(suite: &str, results: &[CaseResult]) -> String {
    use std::fmt::Write as _;
    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let total = results.len();
    let failures = results.iter().filter(|r| !r.passed).count();
    let elapsed_total: u128 = results.iter().map(|r| r.elapsed_ms).sum();
    let _ = writeln!(
        out,
        "<testsuite name=\"{}\" tests=\"{}\" failures=\"{}\" time=\"{}\">",
        xml_escape(suite),
        total,
        failures,
        elapsed_total as f64 / 1000.0,
    );
    for r in results {
        let _ = write!(
            out,
            "  <testcase classname=\"{}\" name=\"{}\" time=\"{}\">",
            xml_escape(suite),
            xml_escape(&r.name),
            r.elapsed_ms as f64 / 1000.0,
        );
        if !r.passed {
            out.push_str("\n    <failure message=\"assertion failed\">");
            out.push_str(&xml_escape(&r.failures.join("\n")));
            out.push_str("</failure>\n  ");
        }
        out.push_str("</testcase>\n");
    }
    out.push_str("</testsuite>\n");
    out
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
