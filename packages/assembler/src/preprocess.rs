//! Macro preprocessor. Sits between the lexer and the parser; walks
//! the token stream once, captures `name MACRO ... ENDM` definitions,
//! and inlines them at every use with positional argument
//! substitution.
//!
//! Not implemented in this slice: nested macros, recursive macros,
//! conditional `IF`/`ENDIF` inside macros. Inputs that use those are
//! reported as a parse error from the layer above when the resulting
//! tokens fail to assemble.

use std::collections::HashMap;

use crate::lexer::{Span, Spanned, Token};

#[derive(Debug, thiserror::Error)]
pub struct PreprocessError {
    pub span: Span,
    pub message: String,
}

impl std::fmt::Display for PreprocessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "preprocess error at byte {}-{}: {}",
            self.span.start, self.span.end, self.message
        )
    }
}

#[derive(Debug, Clone)]
struct MacroDef {
    params: Vec<String>,
    body: Vec<Spanned>,
    /// Source span of the `name MACRO ... ENDM` block. Currently
    /// unused; kept so a future error message can show the macro's
    /// definition site when an expansion fails.
    #[allow(dead_code)]
    span: Span,
}

pub fn expand_macros(toks: &[Spanned]) -> Result<Vec<Spanned>, PreprocessError> {
    let mut state = ExpandState::default();
    expand_into(toks, &mut state)
}

#[derive(Default)]
struct ExpandState {
    macros: HashMap<String, MacroDef>,
    local_counter: u32,
}

fn expand_into(toks: &[Spanned], state: &mut ExpandState) -> Result<Vec<Spanned>, PreprocessError> {
    let mut out: Vec<Spanned> = Vec::with_capacity(toks.len());
    let mut i = 0;

    while i < toks.len() {
        // Detect a macro definition: Ident NAME, Ident("MACRO"), then params
        // and body up to a matching Ident("ENDM").
        if let (Some(name_tok), Some(kw_tok)) = (toks.get(i), toks.get(i + 1)) {
            if let (Token::Ident(name), Token::Ident(kw)) = (&name_tok.tok, &kw_tok.tok) {
                if kw.eq_ignore_ascii_case("macro") {
                    let mac_start = name_tok.span;
                    // Skip name + MACRO
                    let mut j = i + 2;
                    // Parse params: comma-separated Idents on the same line.
                    let mut params: Vec<String> = Vec::new();
                    while let Some(t) = toks.get(j) {
                        match &t.tok {
                            Token::Ident(p) => {
                                params.push(p.clone());
                                j += 1;
                            }
                            Token::Comma => {
                                j += 1;
                            }
                            Token::Newline | Token::Eof => break,
                            other => {
                                return Err(PreprocessError {
                                    span: t.span,
                                    message: format!(
                                        "unexpected `{other}` in macro `{name}` parameter list"
                                    ),
                                });
                            }
                        }
                    }
                    // Consume the trailing newline so the body starts on the next line.
                    if matches!(toks.get(j).map(|t| &t.tok), Some(Token::Newline)) {
                        j += 1;
                    }
                    // Walk body until ENDM. Body tokens are recorded
                    // verbatim (including newlines) so their layout is
                    // preserved on expansion.
                    let body_start = j;
                    let mut body_end = body_start;
                    let mut found_endm = false;
                    while body_end < toks.len() {
                        if let Token::Ident(s) = &toks[body_end].tok {
                            if s.eq_ignore_ascii_case("endm") {
                                found_endm = true;
                                break;
                            }
                        }
                        body_end += 1;
                    }
                    if !found_endm {
                        return Err(PreprocessError {
                            span: mac_start,
                            message: format!("macro `{name}` is missing a closing ENDM"),
                        });
                    }
                    let raw_body = toks[body_start..body_end].to_vec();
                    let endm_end = toks[body_end].span.end;
                    // Pre-expand the body using the macros visible at
                    // this point in the source. This makes calls
                    // inside a body resolve at *definition* time, so a
                    // call site doesn't need a second expander pass to
                    // pick them up.
                    let body = expand_into(&raw_body, state)?;
                    // Skip the ENDM token itself, plus its trailing newline.
                    let mut after_endm = body_end + 1;
                    if matches!(toks.get(after_endm).map(|t| &t.tok), Some(Token::Newline)) {
                        after_endm += 1;
                    }
                    state.macros.insert(
                        name.to_ascii_lowercase(),
                        MacroDef {
                            params,
                            body,
                            span: Span::new(mac_start.start, endm_end),
                        },
                    );
                    i = after_endm;
                    continue;
                }
            }
        }

        // Detect a macro call: an Ident whose lowercase form is in the
        // macros table. We only recognize calls at "statement start" —
        // i.e. either at the very beginning of the program, or
        // immediately after a Newline token. This avoids replacing an
        // identifier that happens to share a macro's name when it
        // appears in operand position.
        let at_statement_start = out
            .last()
            .is_none_or(|last| matches!(last.tok, Token::Newline));
        if at_statement_start {
            if let Some(t) = toks.get(i) {
                if let Token::Ident(name) = &t.tok {
                    if let Some(def) = state.macros.get(&name.to_ascii_lowercase()).cloned() {
                        let call_span = t.span;
                        let mut j = i + 1;
                        // Collect positional args: each arg is the
                        // longest comma-free run of tokens up to a
                        // newline (or eof).
                        let mut args: Vec<Vec<Spanned>> = Vec::new();
                        let mut current: Vec<Spanned> = Vec::new();
                        while let Some(at) = toks.get(j) {
                            match &at.tok {
                                Token::Newline | Token::Eof => break,
                                Token::Comma => {
                                    if !current.is_empty() {
                                        args.push(std::mem::take(&mut current));
                                    }
                                    j += 1;
                                }
                                _ => {
                                    current.push(at.clone());
                                    j += 1;
                                }
                            }
                        }
                        if !current.is_empty() {
                            args.push(current);
                        }
                        if args.len() != def.params.len() {
                            return Err(PreprocessError {
                                span: call_span,
                                message: format!(
                                    "macro `{name}` expects {} argument(s), got {}",
                                    def.params.len(),
                                    args.len()
                                ),
                            });
                        }
                        // Build the substitution map (param → arg tokens).
                        let mut sub: HashMap<String, Vec<Spanned>> = HashMap::new();
                        for (p, a) in def.params.iter().zip(args) {
                            sub.insert(p.to_ascii_lowercase(), a);
                        }
                        // Expand: walk body, substituting params and
                        // suffixing local-style `@@…` labels with a
                        // unique counter.
                        state.local_counter += 1;
                        let suffix = format!("__{}", state.local_counter);
                        for tok in &def.body {
                            match &tok.tok {
                                Token::Ident(s) => {
                                    let lower = s.to_ascii_lowercase();
                                    if let Some(v) = sub.get(&lower) {
                                        out.extend(v.iter().cloned());
                                    } else if s.starts_with("@@") {
                                        out.push(Spanned {
                                            tok: Token::Ident(format!("{s}{suffix}")),
                                            span: tok.span,
                                        });
                                    } else {
                                        out.push(tok.clone());
                                    }
                                }
                                _ => out.push(tok.clone()),
                            }
                        }
                        // Consume the trailing newline of the call line
                        // so we don't double-up with the body's final
                        // newline.
                        if matches!(toks.get(j).map(|t| &t.tok), Some(Token::Newline)) {
                            j += 1;
                        }
                        // Always emit a separator newline so the next
                        // line of the source starts cleanly.
                        out.push(Spanned {
                            tok: Token::Newline,
                            span: call_span,
                        });
                        i = j;
                        continue;
                    }
                }
            }
        }

        out.push(toks[i].clone());
        i += 1;
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::tokenize;

    fn tokens_to_strings(toks: &[Spanned]) -> Vec<String> {
        toks.iter().map(|t| format!("{}", t.tok)).collect()
    }

    #[test]
    fn macro_with_no_params_inlines_body() {
        let src = "\
            NEWLINE MACRO\n\
                mov dl, 10\n\
                mov ah, 02h\n\
                int 21h\n\
            ENDM\n\
            NEWLINE\n\
        ";
        let toks = tokenize(src).unwrap();
        let expanded = expand_macros(&toks).unwrap();
        let s = tokens_to_strings(&expanded).join(" ");
        assert!(s.contains("identifier `mov`"));
        assert!(s.contains("number `10`"));
        assert!(s.contains("number `33`"), "expected `int 21h`: {s}");
    }

    #[test]
    fn macro_substitutes_positional_args() {
        let src = "\
            PUTC MACRO ch\n\
                mov dl, ch\n\
                mov ah, 02h\n\
                int 21h\n\
            ENDM\n\
            PUTC 'A'\n\
        ";
        let toks = tokenize(src).unwrap();
        let expanded = expand_macros(&toks).unwrap();
        let s = tokens_to_strings(&expanded).join(" ");
        // The substituted body should contain `mov dl, 0x41` (the 'A'
        // char literal lexes as Number 65).
        assert!(s.contains("number `65`"));
    }

    #[test]
    fn arity_mismatch_is_a_diagnostic() {
        let src = "\
            BIN MACRO a, b\n\
                mov al, a\n\
            ENDM\n\
            BIN 1\n\
        ";
        let toks = tokenize(src).unwrap();
        let err = expand_macros(&toks).unwrap_err();
        assert!(err.message.contains("expects 2 argument"), "got: {err}");
    }

    #[test]
    fn missing_endm_is_a_diagnostic() {
        let src = "FOO MACRO\nmov ax, 1\n";
        let toks = tokenize(src).unwrap();
        let err = expand_macros(&toks).unwrap_err();
        assert!(err.message.contains("missing a closing ENDM"));
    }

    #[test]
    fn local_label_gets_unique_suffix() {
        let src = "\
            LOOPMAC MACRO\n\
                mov cx, 3\n\
            @@top:\n\
                loop @@top\n\
            ENDM\n\
            LOOPMAC\n\
            LOOPMAC\n\
        ";
        let toks = tokenize(src).unwrap();
        let expanded = expand_macros(&toks).unwrap();
        let s = tokens_to_strings(&expanded).join(" ");
        // Two expansions → two distinct suffixed labels.
        assert!(s.contains("@@top__1"));
        assert!(s.contains("@@top__2"));
    }
}
