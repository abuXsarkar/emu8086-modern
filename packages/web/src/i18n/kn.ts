import type { Locale } from "./types";

// Kannada (ಕನ್ನಡ) translation. Numbers formatted with kn-IN.

export const kn: Locale = {
  id: "kn",
  name: "ಕನ್ನಡ",
  strings: {
    appTitle: "modern8086",
    appLead:
      "ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ ಆಧುನಿಕ, ಮುಕ್ತ-ಮೂಲ 8086 ಎಮ್ಯುಲೇಟರ್ ಮತ್ತು ಅಸೆಂಬ್ಲಿ IDE. ಸಂಪಾದಿಸಿ, ಕ್ಲಿಕ್ ಮಾಡಿ ",
    appLeadRunVerb: "ಚಲಾಯಿಸಿ",

    loadingWasm: "wasm ಕೋರ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
    loadWasmFailed: (m) => `wasm ಲೋಡ್ ಮಾಡಲು ವಿಫಲವಾಗಿದೆ: ${m}`,

    source: "ಮೂಲ",
    output: "ಔಟ್‌ಪುಟ್",
    registers: "ರಿಜಿಸ್ಟರ್‌ಗಳು",
    flags: "ಫ್ಲ್ಯಾಗ್‌ಗಳು",
    devices: "ಸಾಧನಗಳು",
    memory: "ಮೆಮೊರಿ",

    loadExample: "ಉದಾಹರಣೆ ಲೋಡ್ ಮಾಡಿ…",
    loadExampleTooltip: "ಎಡಿಟರ್ ಅನ್ನು ಒದಗಿಸಿದ ಉದಾಹರಣೆಗಳಲ್ಲಿ ಒಂದರಿಂದ ಬದಲಾಯಿಸಿ",
    reset: "ಮರುಹೊಂದಿಸಿ",
    resetTooltip: "ಮತ್ತೆ ಅಸೆಂಬಲ್ ಮಾಡಿ ಮತ್ತು ಸ್ಟೆಪ್ಪರ್ ಅನ್ನು ಸೂಚನೆ 0 ಗೆ ತೆಗೆದುಕೊಂಡು ಹೋಗಿ",
    back: "◀ ಹಿಂದೆ",
    backTooltip: "ಕೊನೆಯ ಹಂತವನ್ನು ರದ್ದುಗೊಳಿಸಿ (ಟೈಮ್-ಟ್ರಾವೆಲ್ ಡೀಬಗ್)",
    step: "ಹಂತ ▶",
    stepTooltip: "ಒಂದು ಸೂಚನೆ ಚಲಾಯಿಸಿ (ಅಥವಾ ಪ್ರಾರಂಭದಿಂದ ಅಸೆಂಬಲ್ ಮಾಡಿ ಒಂದು ಹಂತ ಚಲಾಯಿಸಿ)",
    run: "ಚಲಾಯಿಸಿ (Ctrl+Enter)",
    running: "ಚಾಲನೆಯಲ್ಲಿದೆ…",
    share: "↗ ಹಂಚಿಕೊಳ್ಳಿ",
    shareTooltip: "ಈ ಪ್ರೋಗ್ರಾಮ್ ಅನ್ನು IDE ಯಲ್ಲಿ ಮತ್ತೆ ತೆರೆಯುವ URL ಅನ್ನು ನಕಲಿಸಿ",

    shareCopied: "ಲಿಂಕ್ ಕ್ಲಿಪ್‌ಬೋರ್ಡ್‌ಗೆ ನಕಲಿಸಲಾಗಿದೆ",
    shareInUrl: "ಲಿಂಕ್ URL ಬಾರ್‌ನಲ್ಲಿದೆ",

    noOutputYet: "(ಇನ್ನೂ ಯಾವುದೇ ಔಟ್‌ಪುಟ್ ಇಲ್ಲ — ಚಲಾಯಿಸಿ ಒತ್ತಿ)",
    noRegistersYet: "ರಿಜಿಸ್ಟರ್‌ಗಳನ್ನು ನೋಡಲು ಪ್ರೋಗ್ರಾಮ್ ಚಲಾಯಿಸಿ",

    statusHalted: "ಪ್ರೋಗ್ರಾಮ್ ನಿಂತಿತು",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("kn-IN")} ಹಂತಗಳ ನಂತರ HLT / INT 21h ನಿರ್ಗಮನವನ್ನು ತಲುಪಿತು.`,
    statusOutOfSteps: "ಹಂತ-ಮಿತಿಯಲ್ಲಿ ನಿಂತಿತು",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("kn-IN")} ಸೂಚನೆಗಳು ಚಾಲನೆಯಾದವು ಆದರೆ ನಿಲ್ಲಲಿಲ್ಲ — ಸಾಮಾನ್ಯವಾಗಿ ಇದರರ್ಥ ಅನಂತ ಲೂಪ್, ಅಥವಾ ಕೊನೆಯಲ್ಲಿ HLT / INT 21h fn 4Ch ಇಲ್ಲ.`,
    statusNoStdoutHint:
      "ಏನೂ ಮುದ್ರಿಸಲಾಗಿಲ್ಲ. ನೀವು ಅಂಕೆಗಳನ್ನು ನಿರೀಕ್ಷಿಸಿದ್ದರೆ, ಪ್ರೋಗ್ರಾಮ್‌ಗೆ INT 21h AH=02h ಕರೆಗಳು ಬೇಕು. ಲೆಕ್ಕಾಚಾರ ಮಾಡಿದ ಮೌಲ್ಯಗಳು ಇನ್ನೂ ಮೆಮೊರಿಯಲ್ಲಿರಬಹುದು — ಮೆಮೊರಿ ಹೆಕ್ಸ್ ಪ್ಯಾನೆಲ್ ಪರಿಶೀಲಿಸಿ.",

    errorAt: (stage, line, column, message) =>
      `${stage} ದೋಷ ಸಾಲು ${line}, ಕಾಲಮ್ ${column} ರಲ್ಲಿ: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("kn-IN")} ಬೈಟ್‌ಗಳು ಅಸೆಂಬಲ್ ಆಗಿವೆ (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("kn-IN")} ಹಂತಗಳು;`,
    exitCodeLabel: "ನಿರ್ಗಮನ ಕೋಡ್",

    stepLogSummary: (n) => `ಹಂತ ಲಾಗ್ (${n.toLocaleString("kn-IN")} ಹಂತಗಳು)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ಫೈಲ್ ಡ್ರಾಪ್",
    dropFileHint:
      ".asm ಮೂಲ ಫೈಲ್ ಅನ್ನು ಎಡಿಟರ್ ಫ್ರೇಮ್‌ಗೆ ಎಳೆದು ಬಿಡಿ. 1 MiB ಗಿಂತ ದೊಡ್ಡ ಫೈಲ್‌ಗಳನ್ನು ತಿರಸ್ಕರಿಸಲಾಗುತ್ತದೆ.",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 ಆಲ್ಫಾದಲ್ಲಿ ಬಿಡುಗಡೆಯಾಗಿದೆ; ಎಂಟು ಲೈವ್ ಪೆರಿಫೆರಲ್‌ಗಳು + ಟೈಮ್-ಟ್ರಾವೆಲ್ ಡೀಬಗ್ಗರ್ + ಬ್ರೇಕ್‌ಪಾಯಿಂಟ್‌ಗಳು + ವಾಚ್‌ಗಳು.",

    languageLabel: "ಭಾಷೆ",

    themeLabel: "ಎಡಿಟರ್ ಥೀಮ್",
    themeDark: "ಡಾರ್ಕ್",
    themeLight: "ಲೈಟ್",

    nothingToUndo: "ರದ್ದುಗೊಳಿಸಲು ಏನೂ ಇಲ್ಲ",
    fixErrorsFirst: "ಹಂತಕ್ಕೆ ಮುನ್ನ ದೋಷಗಳನ್ನು ಸರಿಪಡಿಸಿ",
    resetDone: "ಮರುಹೊಂದಿಸಲಾಗಿದೆ — ಸೂಚನೆ 0 ಗೆ ಹಿಂತಿರುಗಿದೆ",
  },
};
