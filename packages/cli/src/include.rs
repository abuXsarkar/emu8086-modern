//! File-level resolution of `include "path"` directives. Done at the
//! CLI layer (rather than in the assembler crate) so the wasm bundle
//! doesn't need a virtual filesystem — it has no business reading
//! the host disk anyway.
//!
//! Resolution rules:
//!   * Paths in `include "…"` are interpreted relative to the file
//!     that contains the directive. So `include "lib/stdlib.asm"`
//!     from `~/labs/lab3.asm` reads `~/labs/lib/stdlib.asm`.
//!   * Recursion limit of 16 prevents include cycles from hanging
//!     the CLI; reaching it is a hard error with the offending path.
//!   * The directive must be the first non-whitespace, non-comment
//!     content on its line. Trailing comments (after the closing `"`)
//!     are tolerated.

use std::fs;
use std::path::{Path, PathBuf};

const MAX_DEPTH: usize = 16;

pub fn resolve(source: &str, source_path: &Path) -> anyhow::Result<String> {
    let mut buf = String::new();
    resolve_into(source, source_path, &mut buf, 0)?;
    Ok(buf)
}

fn resolve_into(
    source: &str,
    source_path: &Path,
    out: &mut String,
    depth: usize,
) -> anyhow::Result<()> {
    if depth >= MAX_DEPTH {
        anyhow::bail!(
            "include depth limit ({MAX_DEPTH}) exceeded — likely a cycle near {}",
            source_path.display()
        );
    }
    let dir = source_path.parent().unwrap_or_else(|| Path::new("."));
    for line in source.split_inclusive('\n') {
        if let Some(included) = parse_include(line) {
            let nested_path = resolve_path(dir, &included);
            let nested_text = fs::read_to_string(&nested_path).map_err(|e| {
                anyhow::anyhow!("include {:?} not found: {e}", nested_path.display())
            })?;
            // Wrap the include in begin/end markers so a runtime error
            // in expanded code can still be traced to its origin file.
            use std::fmt::Write as _;
            let _ = writeln!(out, "; --- begin include {included:?} ---");
            resolve_into(&nested_text, &nested_path, out, depth + 1)?;
            let _ = writeln!(out, "; --- end include {included:?} ---");
        } else {
            out.push_str(line);
        }
    }
    Ok(())
}

fn parse_include(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    if !trimmed.starts_with("include ") && !trimmed.starts_with("INCLUDE ") {
        return None;
    }
    let after_kw = trimmed[8..].trim_start();
    let bytes = after_kw.as_bytes();
    if bytes.first().copied() != Some(b'"') {
        return None;
    }
    let mut end = 1;
    while end < bytes.len() && bytes[end] != b'"' {
        end += 1;
    }
    if end >= bytes.len() {
        return None;
    }
    Some(after_kw[1..end].to_string())
}

fn resolve_path(dir: &Path, included: &str) -> PathBuf {
    let p = Path::new(included);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        dir.join(p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_simple_include() {
        assert_eq!(parse_include("include \"foo.inc\""), Some("foo.inc".into()));
        assert_eq!(
            parse_include("    include \"bar.asm\""),
            Some("bar.asm".into())
        );
        assert_eq!(parse_include("INCLUDE \"baz\""), Some("baz".into()));
    }
    #[test]
    fn ignores_non_include_lines() {
        assert_eq!(parse_include("mov ax, 1"), None);
        assert_eq!(parse_include("; include \"trick.inc\""), None);
    }
}
