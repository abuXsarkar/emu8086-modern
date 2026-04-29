import type { Locale } from "./types";

export const en: Locale = {
  id: "en",
  name: "English",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "A modern, open-source 8086 emulator and assembly IDE for students. Edit, click ",
    appLeadRunVerb: "Run",

    loadingWasm: "Loading wasm core…",
    loadWasmFailed: (m) => `Failed to load wasm: ${m}`,

    source: "source",
    output: "output",
    registers: "registers",
    flags: "flags",
    devices: "devices",
    memory: "memory",

    loadExample: "Load example…",
    loadExampleTooltip: "Replace the editor with one of the bundled examples",
    reset: "Reset",
    resetTooltip: "Re-assemble and point the stepper at instruction 0",
    back: "◀ Back",
    backTooltip: "Undo the last step (time-travel debug)",
    step: "Step ▶",
    stepTooltip: "Execute one instruction (or assemble + step from start)",
    run: "Run (Ctrl+Enter)",
    running: "running…",
    share: "↗ Share",
    shareTooltip: "Copy a URL that re-opens this program in the IDE",

    shareCopied: "link copied to clipboard",
    shareInUrl: "link is in the URL bar",

    noOutputYet: "(no output yet — click Run)",
    noRegistersYet: "run a program to see registers",

    errorAt: (stage, line, column, message) =>
      `${stage} error at line ${line}, column ${column}: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n} bytes assembled (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("en-US")} steps;`,
    exitCodeLabel: "exit code",

    stepLogSummary: (n) => `step log (${n} step${n === 1 ? "" : "s"})`,

    memoryRangeLabel: "DS:0x100..1FF",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "time-travel debugger and virtual peripherals arrive in M4 — see ROADMAP.md.",

    languageLabel: "Language",
  },
};
