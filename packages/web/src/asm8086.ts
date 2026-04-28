// Monarch language definition for 8086 assembly. Tokens are tuned for
// the dialect this project's assembler accepts (see
// docs/emu8086-compatibility.md).
import * as monaco from "monaco-editor";

const KEYWORDS = [
  // Mnemonics
  "mov",
  "movsb",
  "movsw",
  "lodsb",
  "lodsw",
  "stosb",
  "stosw",
  "cmpsb",
  "cmpsw",
  "scasb",
  "scasw",
  "rep",
  "repe",
  "repz",
  "repne",
  "repnz",
  "add",
  "sub",
  "adc",
  "sbb",
  "cmp",
  "and",
  "or",
  "xor",
  "test",
  "inc",
  "dec",
  "neg",
  "not",
  "mul",
  "imul",
  "div",
  "idiv",
  "shl",
  "sal",
  "shr",
  "sar",
  "rol",
  "ror",
  "rcl",
  "rcr",
  "push",
  "pop",
  "pushf",
  "popf",
  "xchg",
  "lea",
  "xlat",
  "xlatb",
  "cbw",
  "cwd",
  "lahf",
  "sahf",
  "in",
  "out",
  "int",
  "iret",
  "jmp",
  "call",
  "ret",
  "jo",
  "jno",
  "jb",
  "jc",
  "jnae",
  "jnb",
  "jnc",
  "jae",
  "jz",
  "je",
  "jnz",
  "jne",
  "jbe",
  "jna",
  "ja",
  "jnbe",
  "js",
  "jns",
  "jp",
  "jpe",
  "jnp",
  "jpo",
  "jl",
  "jnge",
  "jge",
  "jnl",
  "jle",
  "jng",
  "jg",
  "jnle",
  "loop",
  "loope",
  "loopz",
  "loopne",
  "loopnz",
  "jcxz",
  "hlt",
  "nop",
  "clc",
  "stc",
  "cmc",
  "cld",
  "std",
  "cli",
  "sti",
];

const DIRECTIVES = ["org", "db", "dw", "equ", "dup", "byte", "word", "ptr"];

const REGISTERS = [
  "ax",
  "bx",
  "cx",
  "dx",
  "sp",
  "bp",
  "si",
  "di",
  "al",
  "bl",
  "cl",
  "dl",
  "ah",
  "bh",
  "ch",
  "dh",
  "cs",
  "ds",
  "es",
  "ss",
];

export const ASM_LANG_ID = "asm8086";

export function registerAsm8086(monacoApi: typeof monaco): void {
  monacoApi.languages.register({ id: ASM_LANG_ID });

  monacoApi.languages.setMonarchTokensProvider(ASM_LANG_ID, {
    ignoreCase: true,
    defaultToken: "",
    tokenPostfix: ".asm8086",

    keywords: KEYWORDS,
    directives: DIRECTIVES,
    registers: REGISTERS,

    brackets: [
      { open: "[", close: "]", token: "delimiter.bracket" },
      { open: "(", close: ")", token: "delimiter.parenthesis" },
    ],

    tokenizer: {
      root: [
        // Comments: ; to end of line.
        [/;.*$/, "comment"],
        // Numbers: hex with `0..h`, binary with `..b`, C-style 0x, decimal.
        [/0[xX][0-9a-fA-F]+/, "number.hex"],
        [/[0-9][0-9a-fA-F]*[hH]\b/, "number.hex"],
        [/[01]+[bB]\b/, "number.binary"],
        [/\d+\b/, "number"],
        // Strings.
        [/"([^"\\]|\\.)*"/, "string"],
        [/'([^'\\]|\\.)*'/, "string"],
        // Labels: ident followed by `:` at line start.
        [/^\s*[A-Za-z_][\w]*\s*:/, "type.identifier"],
        // Identifiers — disambiguate keyword/directive/register.
        [
          /[A-Za-z_][\w]*/,
          {
            cases: {
              "@registers": "variable.predefined",
              "@directives": "keyword.directive",
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        // Punctuation.
        [/[\[\]()+\-*,]/, "delimiter"],
        // Whitespace.
        [/\s+/, ""],
      ],
    },
  });

  monacoApi.languages.setLanguageConfiguration(ASM_LANG_ID, {
    comments: { lineComment: ";" },
    brackets: [
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  monacoApi.languages.registerCompletionItemProvider(ASM_LANG_ID, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };
      const k = monacoApi.languages.CompletionItemKind;
      const snip =
        monacoApi.languages.CompletionItemInsertTextRule
          .InsertAsSnippet;
      return {
        suggestions: [
          {
            label: "hello",
            kind: k.Snippet,
            detail: "DOS hello-world template",
            insertText: [
              "org 100h",
              "",
              "    mov dx, msg",
              "    mov ah, 9",
              "    int 21h",
              "",
              "    mov ax, 4C00h",
              "    int 21h",
              "",
              "msg: db \"${1:Hello, world!}$\"",
            ].join("\n"),
            insertTextRules: snip,
            range,
          },
          {
            label: "putc",
            kind: k.Snippet,
            detail: "INT 21h fn 02h: print one char (DL)",
            insertText: [
              "mov dl, '${1:A}'",
              "mov ah, 02h",
              "int 21h",
            ].join("\n"),
            insertTextRules: snip,
            range,
          },
          {
            label: "puts",
            kind: k.Snippet,
            detail: "INT 21h fn 09h: print $-terminated string at DS:DX",
            insertText: [
              "mov dx, ${1:msg}",
              "mov ah, 9",
              "int 21h",
            ].join("\n"),
            insertTextRules: snip,
            range,
          },
          {
            label: "exit",
            kind: k.Snippet,
            detail: "INT 21h fn 4Ch: terminate with exit code AL",
            insertText: ["mov ax, 4C00h", "int 21h"].join("\n"),
            insertTextRules: snip,
            range,
          },
          {
            label: "loop-cx",
            kind: k.Snippet,
            detail: "Basic LOOP body with CX iterations",
            insertText: [
              "mov cx, ${1:10}",
              "${2:loop_top}:",
              "    ${3:; body}",
              "    loop ${2:loop_top}",
            ].join("\n"),
            insertTextRules: snip,
            range,
          },
          {
            label: "save-regs",
            kind: k.Snippet,
            detail: "Push/pop pattern to preserve registers across a body",
            insertText: [
              "push ax",
              "push bx",
              "push cx",
              "push dx",
              "    ${1:; body}",
              "pop dx",
              "pop cx",
              "pop bx",
              "pop ax",
            ].join("\n"),
            insertTextRules: snip,
            range,
          },
          {
            label: "print-digit",
            kind: k.Snippet,
            detail: "Print AL as a single ASCII decimal digit (0-9)",
            insertText: [
              "mov dl, al",
              "add dl, '0'",
              "mov ah, 02h",
              "int 21h",
            ].join("\n"),
            insertTextRules: snip,
            range,
          },
          {
            label: "newline",
            kind: k.Snippet,
            detail: "Print a single newline (LF)",
            insertText: [
              "mov dl, 10",
              "mov ah, 02h",
              "int 21h",
            ].join("\n"),
            insertTextRules: snip,
            range,
          },
        ],
      };
    },
  });
}
