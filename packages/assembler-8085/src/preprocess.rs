//! Tolerance-mode source preprocessor.
//!
//! Applies a small set of forgiving textual rewrites *before* the
//! lexer sees the source, so that programs pasted from sim8085,
//! GNUSim8085, OshonSoft, GeeksforGeeks, and Indian lab-manual PDFs
//! mostly assemble on the first try without student edits.
//!
//! Each rewrite returns a (line_no, description) hint so the editor
//! can render a non-blocking margin note — the student sees what
//! changed and learns the canonical form.
//!
//! See `docs/plans/8085-port.md` §0.3 for the full rule rationale.

/// Run the tolerance preprocessor.
///
/// Returns the modified source plus a list of `(line, hint_text)`
/// tuples for each fix that was applied.
#[must_use]
pub fn preprocess(source: &str) -> (String, Vec<(u32, String)>) {
    let mut hints = Vec::new();
    let mut out_lines = Vec::new();

    // Rule 18: strip UTF-8 BOM if present at file start.
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);

    for (idx, raw_line) in source.lines().enumerate() {
        let line_no = (idx + 1) as u32;
        let mut line = raw_line.to_string();

        // Rule 7: convert `// comment` and `# comment` to `;` comments.
        // Only when the marker appears outside a string literal — for
        // now we keep the check naive (8085 string literals are rare
        // outside DB).
        if let Some(pos) = find_unquoted(&line, "//") {
            line.replace_range(pos..pos + 2, ";");
            hints.push((line_no, "// comments rewritten to ;".to_string()));
        }
        // Rule 9: normalize curly/smart quotes to ASCII before further
        // textual rules.
        if line.contains('\u{2018}')
            || line.contains('\u{2019}')
            || line.contains('\u{201c}')
            || line.contains('\u{201d}')
        {
            line = line
                .replace(['\u{2018}', '\u{2019}'], "'")
                .replace(['\u{201c}', '\u{201d}'], "\"");
            hints.push((line_no, "smart quotes normalized to ASCII".to_string()));
        }

        // Rule 4: strip a leading `#` from immediate operands
        // (e.g. `MVI A, #5` → `MVI A, 5`). Conservative: only when
        // `#` directly follows a comma + optional whitespace.
        if let Some(stripped) = strip_hash_immediate(&line) {
            if stripped != line {
                hints.push((line_no, "stripped `#` immediate prefix".to_string()));
                line = stripped;
            }
        }

        // Rule 1: hex literal `FFH` / `A0h` (starts A–F, no leading 0).
        // Rule 2: hex literal `0xNN` → `0NNH`.
        // Both are normalised in one pass.
        let (rewritten, changed) = rewrite_hex_literals(&line);
        if changed {
            hints.push((line_no, "hex literal normalised".to_string()));
            line = rewritten;
        }

        out_lines.push(line);
    }

    (out_lines.join("\n"), hints)
}

/// Find an occurrence of `needle` in `hay` that isn't inside a single-
/// or double-quoted string. Returns the byte offset of the first
/// unquoted hit.
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

/// Apply rule 4 conservatively: `, #N` → `, N`. Returns a fresh string
/// (only allocates if a substitution happened).
fn strip_hash_immediate(line: &str) -> Option<String> {
    if !line.contains('#') {
        return None;
    }
    let mut out = String::with_capacity(line.len());
    let mut prev_non_ws: Option<char> = None;
    let mut changed = false;
    for c in line.chars() {
        if c == '#' && matches!(prev_non_ws, Some(',') | Some('(')) {
            changed = true;
            continue;
        }
        out.push(c);
        if !c.is_whitespace() {
            prev_non_ws = Some(c);
        }
    }
    if changed {
        Some(out)
    } else {
        None
    }
}

/// Apply hex-literal rules 1 (FFH → 0FFH) and 2 (0xNN → 0NNH).
/// Returns `(new_string, changed?)`.
fn rewrite_hex_literals(line: &str) -> (String, bool) {
    // First handle 0x-prefixed hex: scan tokens.
    let mut out = String::with_capacity(line.len());
    let bytes = line.as_bytes();
    let mut i = 0;
    let mut changed = false;

    while i < bytes.len() {
        let c = bytes[i] as char;

        // `0xNN` or `0XNN` form: convert to `0NNH`.
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
            // Need a leading 0 if first char is A-F to keep it
            // unambiguous in the post-rewrite source.
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

        // Detect bare hex like `FFH` (alpha-led + H suffix). The token
        // must be word-bounded at the start (not preceded by an
        // identifier-character) and must end in 'H' or 'h'.
        if c.is_ascii_alphabetic() && c != 'h' && c != 'H' {
            let prev = if i == 0 { b' ' } else { bytes[i - 1] };
            let prev_c = prev as char;
            if !prev_c.is_ascii_alphanumeric() && prev_c != '_' && prev_c != '?' && prev_c != '@' {
                // Look ahead: a run of hex digits ending in H/h, preceded
                // by an alpha hex digit (A-F).
                let mut end = i;
                while end < bytes.len() && (bytes[end] as char).is_ascii_hexdigit() {
                    end += 1;
                }
                if end > i
                    && end < bytes.len()
                    && (bytes[end] == b'H' || bytes[end] == b'h')
                    // and the next char isn't an identifier char (so
                    // we don't grab the leading letters of a label
                    // like `HLT` or `FALSE`).
                    && bytes.get(end + 1).is_none_or(|&n| {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_change_passes_through() {
        let (out, hints) = preprocess("MVI A, 0FFH ; ok\nHLT");
        assert_eq!(out, "MVI A, 0FFH ; ok\nHLT");
        assert!(hints.is_empty());
    }

    #[test]
    fn ffh_gets_leading_zero() {
        let (out, hints) = preprocess("MVI A, FFH");
        assert_eq!(out, "MVI A, 0FFH");
        assert_eq!(hints.len(), 1);
    }

    #[test]
    fn zero_x_hex_normalised() {
        let (out, _) = preprocess("MVI A, 0x42");
        assert_eq!(out, "MVI A, 42H");
    }

    #[test]
    fn zero_x_hex_with_alpha_gets_leading_zero() {
        let (out, _) = preprocess("MVI A, 0xFF");
        assert_eq!(out, "MVI A, 0FFH");
    }

    #[test]
    fn double_slash_comment_becomes_semicolon() {
        let (out, hints) = preprocess("MVI A, 5 // hello");
        assert_eq!(out, "MVI A, 5 ; hello");
        assert_eq!(hints.len(), 1);
    }

    #[test]
    fn hash_immediate_stripped() {
        let (out, hints) = preprocess("MVI A, #5");
        assert_eq!(out, "MVI A, 5");
        assert_eq!(hints.len(), 1);
    }

    #[test]
    fn mnemonics_like_hlt_arent_grabbed_as_hex() {
        // HLT must not be mistaken for hex `HLT` — it doesn't have
        // hex digits beyond the leading char anyway, but be safe.
        let (out, _) = preprocess("HLT");
        assert_eq!(out, "HLT");
    }

    #[test]
    fn bom_stripped() {
        let src = "\u{feff}MVI A, 5";
        let (out, _) = preprocess(src);
        assert_eq!(out, "MVI A, 5");
    }
}
