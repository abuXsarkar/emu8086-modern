//! Tolerance-mode source preprocessor for 8051 assembly.
//!
//! Mirrors the 8085 preprocess module. Applies the top-yield
//! rewrites from the research dialect agent so paste-in from SDCC
//! asx8051, AS31, TASM, and lab-manual PDFs assembles without
//! student edits.

#[must_use]
pub fn preprocess(source: &str) -> (String, Vec<(u32, String)>) {
    let mut hints = Vec::new();
    let mut out_lines = Vec::new();

    // Rule 18: strip UTF-8 BOM if present at file start.
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);

    for (idx, raw_line) in source.lines().enumerate() {
        let line_no = (idx + 1) as u32;
        let mut line = raw_line.to_string();

        // Rule 1: `//` line comment → `;`.
        if let Some(pos) = find_unquoted(&line, "//") {
            line.replace_range(pos..pos + 2, ";");
            hints.push((line_no, "// comments rewritten to ;".into()));
        }

        // Rule 12: smart quotes → ASCII.
        if line.contains('\u{2018}')
            || line.contains('\u{2019}')
            || line.contains('\u{201c}')
            || line.contains('\u{201d}')
        {
            line = line
                .replace(['\u{2018}', '\u{2019}'], "'")
                .replace(['\u{201c}', '\u{201d}'], "\"");
            hints.push((line_no, "smart quotes normalized".into()));
        }

        // Rule 2 + 4: rewrite hex literals — 0xNN → 0NNH, FFH → 0FFH.
        let (rewritten, hex_changed) = rewrite_hex_literals(&line);
        if hex_changed {
            hints.push((line_no, "hex literal normalised".into()));
            line = rewritten;
        }

        // Rule 6: dot-prefixed directives → bare.
        let (dotted, dot_changed) = strip_dot_directives(&line);
        if dot_changed {
            hints.push((line_no, "stripped `.` from directive".into()));
            line = dotted;
        }

        out_lines.push(line);
    }

    (out_lines.join("\n"), hints)
}

fn find_unquoted(hay: &str, needle: &str) -> Option<usize> {
    let bytes = hay.as_bytes();
    let n = needle.as_bytes();
    let mut i = 0;
    let mut in_single = false;
    let mut in_double = false;
    while i + n.len() <= bytes.len() {
        let c = bytes[i] as char;
        if c == '\'' && !in_double {
            in_single = !in_single;
        } else if c == '"' && !in_single {
            in_double = !in_double;
        } else if !in_single && !in_double && &bytes[i..i + n.len()] == n {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn rewrite_hex_literals(line: &str) -> (String, bool) {
    let mut out = String::with_capacity(line.len());
    let bytes = line.as_bytes();
    let mut i = 0;
    let mut changed = false;

    while i < bytes.len() {
        let c = bytes[i] as char;

        // `0xNN` / `0XNN` → `0NNH` (leading 0 if first hex digit is alpha).
        if c == '0'
            && i + 1 < bytes.len()
            && (bytes[i + 1] == b'x' || bytes[i + 1] == b'X')
            && i + 2 < bytes.len()
            && (bytes[i + 2] as char).is_ascii_hexdigit()
        {
            let start = i + 2;
            let mut end = start;
            while end < bytes.len() && (bytes[end] as char).is_ascii_hexdigit() {
                end += 1;
            }
            let hex = std::str::from_utf8(&bytes[start..end]).unwrap();
            if let Some(first) = hex.chars().next() {
                if first.is_ascii_alphabetic() {
                    out.push('0');
                }
            }
            out.push_str(hex);
            out.push('H');
            i = end;
            changed = true;
            continue;
        }

        // Bare `FFH` style → `0FFH`. Same logic as 8085 preprocess.
        if c.is_ascii_alphabetic() && c != 'h' && c != 'H' {
            let prev_c = if i == 0 { ' ' } else { bytes[i - 1] as char };
            if !prev_c.is_ascii_alphanumeric() && prev_c != '_' && prev_c != '?' && prev_c != '@' {
                let mut end = i;
                while end < bytes.len() && (bytes[end] as char).is_ascii_hexdigit() {
                    end += 1;
                }
                if end > i
                    && end < bytes.len()
                    && (bytes[end] == b'H' || bytes[end] == b'h')
                    && bytes.get(end + 1).map_or(true, |&n| {
                        let nc = n as char;
                        !(nc.is_ascii_alphanumeric() || nc == '_' || nc == '?' || nc == '@')
                    })
                {
                    out.push('0');
                    out.push_str(std::str::from_utf8(&bytes[i..=end]).unwrap());
                    i = end + 1;
                    changed = true;
                    continue;
                }
            }
        }

        out.push(c);
        i += 1;
    }

    (out, changed)
}

fn strip_dot_directives(line: &str) -> (String, bool) {
    // Aliases from asx8051 / AS31.
    let mut out = line.to_string();
    let mut changed = false;
    for (dotted, bare) in [
        (".org", "ORG"),
        (".equ", "EQU"),
        (".db", "DB"),
        (".byte", "DB"),
        (".dw", "DW"),
        (".word", "DW"),
        (".ds", "DS"),
        (".blkb", "DS"),
        (".end", "END"),
    ] {
        // Replace only at word boundaries — typically dotted directives
        // are at column 0 or after whitespace, so a naïve replace at
        // start-of-line works. Avoid mangling `.area` etc.
        let lower = out.to_lowercase();
        if let Some(pos) = lower.find(dotted) {
            let prev = if pos == 0 {
                ' '
            } else {
                lower.as_bytes()[pos - 1] as char
            };
            let next = lower
                .as_bytes()
                .get(pos + dotted.len())
                .copied()
                .unwrap_or(b' ') as char;
            if !prev.is_ascii_alphanumeric() && !next.is_ascii_alphanumeric() {
                out.replace_range(pos..pos + dotted.len(), bare);
                changed = true;
            }
        }
    }
    (out, changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_change_passes_through() {
        let (out, hints) = preprocess("MOV A, #0FFH ; ok\nNOP");
        assert_eq!(out, "MOV A, #0FFH ; ok\nNOP");
        assert!(hints.is_empty());
    }

    #[test]
    fn ffh_gets_leading_zero() {
        let (out, hints) = preprocess("MOV A, #FFH");
        assert_eq!(out, "MOV A, #0FFH");
        assert!(!hints.is_empty());
    }

    #[test]
    fn zero_x_hex_normalised() {
        let (out, _) = preprocess("MOV A, #0x42");
        assert_eq!(out, "MOV A, #42H");
    }

    #[test]
    fn double_slash_comment_becomes_semicolon() {
        let (out, _) = preprocess("MOV A, #5 // hello");
        assert_eq!(out, "MOV A, #5 ; hello");
    }

    #[test]
    fn dot_org_normalised() {
        let (out, _) = preprocess(".org 0\nNOP");
        assert_eq!(out, "ORG 0\nNOP");
    }
}
