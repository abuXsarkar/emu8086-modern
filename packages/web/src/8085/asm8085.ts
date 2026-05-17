// Monaco / Monarch language registration for Intel 8085 assembly,
// using the canonical dialect from docs/plans/8085-port.md §0.2.
import * as monaco from "monaco-editor";
import { OPCODE_DOCS } from "./asm8085_docs";

export const ASM_LANG_ID = "asm8085";

// All ~70 8085 mnemonics. Monaco wants lowercase entries here; we
// turn on case-insensitive matching below.
const MNEMONICS = [
  // data transfer
  "mov", "mvi", "lxi", "lda", "sta", "lhld", "shld", "ldax", "stax", "xchg",
  // arithmetic
  "add", "adc", "adi", "aci", "sub", "sbb", "sui", "sbi",
  "inr", "dcr", "inx", "dcx", "dad", "daa",
  // logical
  "ana", "ani", "ora", "ori", "xra", "xri", "cmp", "cpi",
  "rlc", "rrc", "ral", "rar", "cma", "cmc", "stc",
  // branch
  "jmp", "jnz", "jz", "jnc", "jc", "jpo", "jpe", "jp", "jm",
  "call", "cnz", "cz", "cnc", "cc", "cpo", "cpe", "cp", "cm",
  "ret",  "rnz", "rz", "rnc", "rc", "rpo", "rpe", "rp", "rm",
  "pchl", "rst",
  // stack / IO
  "push", "pop", "xthl", "sphl", "in", "out",
  // control
  "hlt", "nop", "ei", "di", "rim", "sim",
];

const REGISTERS = ["a", "b", "c", "d", "e", "h", "l", "m", "sp", "psw"];

const DIRECTIVES = ["org", "equ", "db", "dw", "ds", "end"];

export function registerAsm8085(monacoInstance: typeof monaco): void {
  if (monacoInstance.languages.getLanguages().some((l) => l.id === ASM_LANG_ID)) {
    return;
  }

  monacoInstance.languages.register({ id: ASM_LANG_ID, extensions: [".asm85", ".a85"] });

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
        // Hex literal: digits + H (we don't deeply validate the
        // leading-zero rule here; the assembler does that).
        [/0?[0-9A-Fa-f]+[Hh]/, "number.hex"],
        // Binary
        [/[01]+[Bb]/, "number.binary"],
        // Decimal
        [/\d+/, "number"],
        // String literals
        [/'[^']*'/, "string"],
        [/"[^"]*"/, "string"],
        // Punctuation
        [/[,:]/, "delimiter"],
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

  // Hover provider — looks up the keyword (mnemonic) under the cursor
  // in OPCODE_DOCS. Fixes pain point #14 (no inline mnemonic help).
  monacoInstance.languages.registerHoverProvider(ASM_LANG_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const key = word.word.toUpperCase();
      const doc = OPCODE_DOCS[key];
      if (!doc) return null;
      const header = doc.cycles
        ? `**${key}** — ${doc.summary}  ·  *${doc.cycles} T-states*`
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

  // Completion provider — when a student types the first letter(s)
  // of a mnemonic, suggest the matching one(s) with the inline doc
  // as detail. Saves the "what was the spelling again" pause that's
  // common for the conditional-jump family (JNZ vs JNC vs JPO …).
  // We surface mnemonics + register names + directives.
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

      // Mnemonics + directives: pull docs so each suggestion's detail
      // line shows the summary.
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

      // Registers: lower priority, only useful in operand position.
      for (const r of REGISTERS) {
        suggestions.push({
          label: r.toUpperCase(),
          kind: monacoInstance.languages.CompletionItemKind.Variable,
          insertText: r.toUpperCase(),
          detail: "register",
          range,
          sortText: "z" + r, // float them below mnemonics in the list
        });
      }

      return { suggestions };
    },
  });
}
