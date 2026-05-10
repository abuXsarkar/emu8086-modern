import type { Locale } from "./types";

// Punjabi (ਪੰਜਾਬੀ, Gurmukhi script) translation. Numbers formatted
// with pa-IN.

export const pa: Locale = {
  id: "pa",
  name: "ਪੰਜਾਬੀ",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "ਵਿਦਿਆਰਥੀਆਂ ਲਈ ਇੱਕ ਆਧੁਨਿਕ, ਓਪਨ-ਸੋਰਸ 8086 ਐਮੂਲੇਟਰ ਅਤੇ ਅਸੈਂਬਲੀ IDE। ਸੰਪਾਦਿਤ ਕਰੋ, ਕਲਿੱਕ ਕਰੋ ",
    appLeadRunVerb: "ਚਲਾਓ",

    loadingWasm: "wasm ਕੋਰ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…",
    loadWasmFailed: (m) => `wasm ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ: ${m}`,

    source: "ਸਰੋਤ",
    output: "ਆਉਟਪੁੱਟ",
    registers: "ਰਜਿਸਟਰ",
    flags: "ਫਲੈਗ",
    devices: "ਡਿਵਾਈਸ",
    memory: "ਮੈਮੋਰੀ",

    loadExample: "ਉਦਾਹਰਨ ਲੋਡ ਕਰੋ…",
    loadExampleTooltip: "ਐਡੀਟਰ ਨੂੰ ਨਾਲ ਆਉਣ ਵਾਲੀਆਂ ਉਦਾਹਰਨਾਂ ਵਿੱਚੋਂ ਇੱਕ ਨਾਲ ਬਦਲੋ",
    reset: "ਰੀਸੈੱਟ",
    resetTooltip: "ਫਿਰ ਤੋਂ ਅਸੈਂਬਲ ਕਰੋ ਅਤੇ ਸਟੈਪਰ ਨੂੰ ਹਦਾਇਤ 0 ਵੱਲ ਲੈ ਜਾਓ",
    back: "◀ ਪਿੱਛੇ",
    backTooltip: "ਆਖਰੀ ਕਦਮ ਪਿੱਛੇ ਲੈ ਜਾਓ (ਟਾਈਮ-ਟ੍ਰੈਵਲ ਡੀਬਗ)",
    step: "ਕਦਮ ▶",
    stepTooltip: "ਇੱਕ ਹਦਾਇਤ ਚਲਾਓ (ਜਾਂ ਸ਼ੁਰੂ ਤੋਂ ਅਸੈਂਬਲ ਕਰਕੇ ਇੱਕ ਕਦਮ ਚਲਾਓ)",
    run: "ਚਲਾਓ (Ctrl+Enter)",
    running: "ਚੱਲ ਰਿਹਾ ਹੈ…",
    share: "↗ ਸਾਂਝਾ ਕਰੋ",
    shareTooltip: "ਇਹ ਪ੍ਰੋਗਰਾਮ IDE ਵਿੱਚ ਮੁੜ ਖੋਲ੍ਹਣ ਵਾਲਾ URL ਕਾਪੀ ਕਰੋ",

    shareCopied: "ਲਿੰਕ ਕਲਿੱਪਬੋਰਡ 'ਤੇ ਕਾਪੀ ਹੋ ਗਿਆ",
    shareInUrl: "ਲਿੰਕ URL ਬਾਰ ਵਿੱਚ ਹੈ",

    noOutputYet: "(ਅਜੇ ਕੋਈ ਆਉਟਪੁੱਟ ਨਹੀਂ — ਚਲਾਓ ਦਬਾਓ)",
    noRegistersYet: "ਰਜਿਸਟਰ ਵੇਖਣ ਲਈ ਪ੍ਰੋਗਰਾਮ ਚਲਾਓ",

    statusHalted: "ਪ੍ਰੋਗਰਾਮ ਰੁਕ ਗਿਆ",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("pa-IN")} ਕਦਮਾਂ ਬਾਅਦ HLT / INT 21h ਬਾਹਰ ਨਿਕਲਣ ਤੇ ਪਹੁੰਚਿਆ।`,
    statusOutOfSteps: "ਕਦਮ-ਸੀਮਾ 'ਤੇ ਰੁਕ ਗਿਆ",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("pa-IN")} ਹਦਾਇਤਾਂ ਚੱਲੀਆਂ ਪਰ ਰੁਕੀਆਂ ਨਹੀਂ — ਆਮ ਤੌਰ 'ਤੇ ਇਸਦਾ ਮਤਲਬ ਅਨੰਤ ਲੂਪ, ਜਾਂ ਅੰਤ ਵਿੱਚ HLT / INT 21h fn 4Ch ਗੈਰਹਾਜ਼ਰ।`,
    statusNoStdoutHint:
      "ਕੁਝ ਵੀ ਛਾਪਿਆ ਨਹੀਂ ਗਿਆ। ਜੇ ਤੁਸੀਂ ਅੰਕਾਂ ਦੀ ਉਮੀਦ ਕਰ ਰਹੇ ਸੀ, ਤਾਂ ਪ੍ਰੋਗਰਾਮ ਨੂੰ INT 21h AH=02h ਕਾਲਾਂ ਦੀ ਲੋੜ ਹੈ। ਗਿਣੇ ਗਏ ਮੁੱਲ ਅਜੇ ਵੀ ਮੈਮੋਰੀ ਵਿੱਚ ਹੋ ਸਕਦੇ ਹਨ — ਮੈਮੋਰੀ ਹੈਕਸ ਪੈਨਲ ਚੈੱਕ ਕਰੋ।",

    errorAt: (stage, line, column, message) =>
      `${stage} ਗਲਤੀ ਲਾਈਨ ${line}, ਕਾਲਮ ${column} 'ਤੇ: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("pa-IN")} ਬਾਈਟ ਅਸੈਂਬਲ ਹੋਏ (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("pa-IN")} ਕਦਮ;`,
    exitCodeLabel: "ਐਗਜ਼ਿਟ ਕੋਡ",

    stepLogSummary: (n) => `ਕਦਮ ਲੌਗ (${n.toLocaleString("pa-IN")} ਕਦਮ)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ਫਾਈਲ ਡਰੌਪ",
    dropFileHint:
      ".asm ਸਰੋਤ ਫਾਈਲ ਨੂੰ ਐਡੀਟਰ ਫਰੇਮ 'ਤੇ ਘਸੀਟ ਕੇ ਛੱਡੋ। 1 MiB ਤੋਂ ਵੱਡੀਆਂ ਫਾਈਲਾਂ ਅਸਵੀਕਾਰ ਕੀਤੀਆਂ ਜਾਂਦੀਆਂ ਹਨ।",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 ਅਲਫ਼ਾ ਵਿੱਚ ਜਾਰੀ ਹੋਏ; ਅੱਠ ਲਾਈਵ ਪੈਰੀਫਿਰਲ + ਟਾਈਮ-ਟ੍ਰੈਵਲ ਡੀਬੱਗਰ + ਬ੍ਰੇਕਪੁਆਇੰਟ + ਵਾਚ।",

    languageLabel: "ਭਾਸ਼ਾ",

    themeLabel: "ਐਡੀਟਰ ਥੀਮ",
    themeDark: "ਡਾਰਕ",
    themeLight: "ਲਾਈਟ",

    nothingToUndo: "ਪਿੱਛੇ ਲੈਣ ਲਈ ਕੁਝ ਨਹੀਂ",
    fixErrorsFirst: "ਕਦਮ ਲੈਣ ਤੋਂ ਪਹਿਲਾਂ ਗਲਤੀਆਂ ਠੀਕ ਕਰੋ",
    resetDone: "ਰੀਸੈੱਟ ਹੋਇਆ — ਹਦਾਇਤ 0 'ਤੇ ਵਾਪਸ",
  },
};
