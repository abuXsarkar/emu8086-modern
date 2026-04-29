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

    statusHalted: "Program halted",
    statusHaltedHint: (steps) =>
      `Reached HLT / INT 21h exit after ${steps.toLocaleString("en-US")} step${steps === 1 ? "" : "s"}.`,
    statusOutOfSteps: "Stopped at step limit",
    statusOutOfStepsHint: (steps) =>
      `Ran ${steps.toLocaleString("en-US")} instructions without halting — usually means an infinite loop, or a missing HLT / INT 21h fn 4Ch at the end.`,
    statusNoStdoutHint:
      "No output was printed. If you were expecting digits, the program needs INT 21h AH=02h calls. Computed values may still be in memory — check the memory hex panel.",

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
      "M0–M5 shipped at alpha; eight live peripherals + time-travel debugger + breakpoints + watches.",

    languageLabel: "Language",

    themeLabel: "Editor theme",
    themeDark: "Dark",
    themeLight: "Light",
  },
};
