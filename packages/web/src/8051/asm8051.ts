// Monaco / Monarch language registration for Intel 8051 assembly.
// Mirrors asm8085.ts so the editor surface (hover, completion,
// tokenisation) is identical across the family.
import * as monaco from "monaco-editor";
import { OPCODE_DOCS } from "./asm8051_docs";

export const ASM_LANG_ID = "asm8051";

// Full 8051 mnemonic set. Monaco wants lowercase entries here; we
// turn on case-insensitive matching below.
const MNEMONICS = [
  // data transfer
  "mov", "movx", "movc", "push", "pop", "xch", "xchd",
  // arithmetic
  "add", "addc", "subb", "inc", "dec", "mul", "div", "da",
  // logical
  "anl", "orl", "xrl", "clr", "setb", "cpl",
  "rl", "rlc", "rr", "rrc", "swap",
  // branches
  "acall", "lcall", "ret", "reti",
  "ajmp", "ljmp", "sjmp", "jmp",
  "jc", "jnc", "jb", "jnb", "jbc",
  "jz", "jnz", "cjne", "djnz",
  "nop",
];

// 8051 register/SFR names exposed to the tokenizer for highlighting.
const REGISTERS = [
  "a", "b", "c", "ab", "pc", "sp", "dptr", "dpl", "dph",
  "r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7",
  // Common SFRs by name (the assembler also accepts these).
  "acc", "psw", "ie", "ip", "tmod", "tcon", "scon", "pcon",
  "p0", "p1", "p2", "p3",
  "th0", "tl0", "th1", "tl1", "sbuf",
];

const DIRECTIVES = ["org", "equ", "data", "bit", "db", "dw", "ds", "end"];

export function registerAsm8051(monacoInstance: typeof monaco): void {
  if (monacoInstance.languages.getLanguages().some((l) => l.id === ASM_LANG_ID)) {
    return;
  }

  monacoInstance.languages.register({ id: ASM_LANG_ID, extensions: [".asm51", ".a51"] });

  monacoInstance.languages.setMonarchTokensProvider(ASM_LANG_ID, {
    defaultToken: "",
    ignoreCase: true,
    keywords: MNEMONICS,
    registers: REGISTERS,
    directives: DIRECTIVES,
    tokenizer: {
      root: [
        // Label at column 0 or after whitespace
        [/^[A-Za-z_?@][A-Za-z0-9_?@]*(?=:)/, "type.identifier"],
        // Identifiers — classify by membership
        [
          /[A-Za-z_?@][A-Za-z0-9_?@]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@registers": "variable.predefined",
              "@directives": "keyword.control",
              "@default": "identifier",
            },
          },
        ],
        // Hex literal — H/h suffix; deeper validation is the assembler's job.
        [/0?[0-9A-Fa-f]+[Hh]/, "number.hex"],
        // Binary
        [/[01]+[Bb]/, "number.binary"],
        // Decimal
        [/\d+/, "number"],
        // String literals
        [/'[^']*'/, "string"],
        [/"[^"]*"/, "string"],
        // Punctuation — 8051 uses `#`, `@`, `.`, `/` more than 8085 does.
        [/[,:#@./]/, "delimiter"],
        // Comment
        [/;.*$/, "comment"],
      ],
    },
  } as monaco.languages.IMonarchLanguage);

  monacoInstance.languages.setLanguageConfiguration(ASM_LANG_ID, {
    comments: { lineComment: ";" },
    brackets: [
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "'", close: "'", notIn: ["string", "comment"] },
      { open: '"', close: '"', notIn: ["string"] },
    ],
  });

  // Hover provider — looks up the keyword (mnemonic) under the cursor.
  monacoInstance.languages.registerHoverProvider(ASM_LANG_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const key = word.word.toUpperCase();
      const doc = OPCODE_DOCS[key];
      if (!doc) return null;
      const header = doc.cycles
        ? `**${key}** — ${doc.summary}  ·  *${doc.cycles} cyc*`
        : `**${key}** — ${doc.summary}`;
      return {
        range: new monacoInstance.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        ),
        contents: [{ value: header }, { value: doc.detail }],
      };
    },
  });

  monacoInstance.languages.registerCompletionItemProvider(ASM_LANG_ID, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monacoInstance.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      const suggestions: monaco.languages.CompletionItem[] = [];

      for (const m of [...MNEMONICS, ...DIRECTIVES]) {
        const upper = m.toUpperCase();
        const doc = OPCODE_DOCS[upper];
        suggestions.push({
          label: upper,
          kind: DIRECTIVES.includes(m)
            ? monacoInstance.languages.CompletionItemKind.Keyword
            : monacoInstance.languages.CompletionItemKind.Function,
          insertText: upper,
          detail: doc?.summary ?? "",
          documentation: doc ? { value: doc.detail } : undefined,
          range,
        });
      }

      for (const r of REGISTERS) {
        suggestions.push({
          label: r.toUpperCase(),
          kind: monacoInstance.languages.CompletionItemKind.Variable,
          insertText: r.toUpperCase(),
          detail: "register/SFR",
          range,
          sortText: "z" + r,
        });
      }

      return { suggestions };
    },
  });
}
