import type { Locale } from "./types";

// Odia (ଓଡ଼ିଆ) translation. Numbers formatted with or-IN.

export const or: Locale = {
  id: "or",
  name: "ଓଡ଼ିଆ",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "ଛାତ୍ରଛାତ୍ରୀଙ୍କ ପାଇଁ ଏକ ଆଧୁନିକ, ଓପନ-ସୋର୍ସ 8086 ଏମୁଲେଟର ଏବଂ ଆସେମ୍ବଲି IDE। ସମ୍ପାଦନ କରନ୍ତୁ, କ୍ଲିକ୍ କରନ୍ତୁ ",
    appLeadRunVerb: "ଚଳାନ୍ତୁ",

    loadingWasm: "wasm କୋର ଲୋଡ୍ ହେଉଛି…",
    loadWasmFailed: (m) => `wasm ଲୋଡ୍ ହେଲା ନାହିଁ: ${m}`,

    source: "ସୋର୍ସ",
    output: "ଆଉଟପୁଟ୍",
    registers: "ରେଜିଷ୍ଟର",
    flags: "ଫ୍ଲାଗ୍",
    devices: "ଡିଭାଇସ୍",
    memory: "ମେମୋରୀ",

    loadExample: "ଉଦାହରଣ ଲୋଡ୍ କରନ୍ତୁ…",
    loadExampleTooltip: "ଏଡିଟରକୁ ସାଥରେ ଆସୁଥିବା ଉଦାହରଣମାନଙ୍କ ମଧ୍ୟରୁ ଗୋଟିଏ ସହିତ ବଦଳାନ୍ତୁ",
    reset: "ରିସେଟ୍",
    resetTooltip: "ପୁନର୍ବାର ଆସେମ୍ବଲ କରନ୍ତୁ ଏବଂ ଷ୍ଟେପରକୁ ନିର୍ଦ୍ଦେଶ 0କୁ ନିଅନ୍ତୁ",
    back: "◀ ପଛକୁ",
    backTooltip: "ଶେଷ ପଦକ୍ଷେପ ପଛକୁ ନିଅନ୍ତୁ (ଟାଇମ-ଟ୍ରାଭେଲ ଡିବଗ୍)",
    step: "ପଦକ୍ଷେପ ▶",
    stepTooltip: "ଗୋଟିଏ ନିର୍ଦ୍ଦେଶ ଚଳାନ୍ତୁ (କିମ୍ବା ଆରମ୍ଭରୁ ଆସେମ୍ବଲ କରି ଗୋଟିଏ ପଦକ୍ଷେପ ଚଳାନ୍ତୁ)",
    run: "ଚଳାନ୍ତୁ (Ctrl+Enter)",
    running: "ଚାଲୁଛି…",
    share: "↗ ସେୟାର",
    shareTooltip: "ଏହି ପ୍ରୋଗ୍ରାମକୁ IDE ରେ ପୁନର୍ବାର ଖୋଲୁଥିବା URL କପି କରନ୍ତୁ",

    shareCopied: "ଲିଙ୍କ୍ କ୍ଲିପବୋର୍ଡକୁ କପି ହୋଇଛି",
    shareInUrl: "ଲିଙ୍କ୍ URL ବାରରେ ଅଛି",

    noOutputYet: "(ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଆଉଟପୁଟ୍ ନାହିଁ — ଚଳାନ୍ତୁ ଦବାନ୍ତୁ)",
    noRegistersYet: "ରେଜିଷ୍ଟର ଦେଖିବାକୁ ଗୋଟିଏ ପ୍ରୋଗ୍ରାମ ଚଳାନ୍ତୁ",

    statusHalted: "ପ୍ରୋଗ୍ରାମ ବନ୍ଦ ହୋଇଗଲା",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("or-IN")} ପଦକ୍ଷେପ ପରେ HLT / INT 21h ବାହାରକୁ ପହଞ୍ଚିଲା।`,
    statusOutOfSteps: "ପଦକ୍ଷେପ-ସୀମାରେ ବନ୍ଦ ହୋଇଗଲା",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("or-IN")}ଟି ନିର୍ଦ୍ଦେଶ ଚାଲିଲା କିନ୍ତୁ ବନ୍ଦ ହୋଇନଥିଲା — ସାଧାରଣତଃ ଏହାର ଅର୍ଥ ଏକ ଅସୀମ ଲୁପ୍, କିମ୍ବା ଶେଷରେ HLT / INT 21h fn 4Ch ନାହିଁ।`,
    statusNoStdoutHint:
      "କିଛି ମୁଦ୍ରଣ ହୋଇନାହିଁ। ଯଦି ଆପଣ ଅଙ୍କ ଆଶା କରିଥିଲେ, ତେବେ ପ୍ରୋଗ୍ରାମକୁ INT 21h AH=02h କଲ୍ ଆବଶ୍ୟକ। ଗଣନା କରାଯାଇଥିବା ମୂଲ୍ୟ ଏଠାରେ ମେମୋରୀରେ ଥାଇପାରେ — ମେମୋରୀ ହେକ୍ସ ପ୍ୟାନେଲ ଯାଞ୍ଚ କରନ୍ତୁ।",

    errorAt: (stage, line, column, message) =>
      `${stage} ତ୍ରୁଟି ଲାଇନ ${line}, ସ୍ତମ୍ଭ ${column} ରେ: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("or-IN")} ବାଇଟ୍ ଆସେମ୍ବଲ ହୋଇଛି (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("or-IN")} ପଦକ୍ଷେପ;`,
    exitCodeLabel: "ଏକ୍ସିଟ୍ କୋଡ୍",

    stepLogSummary: (n) => `ପଦକ୍ଷେପ ଲଗ୍ (${n.toLocaleString("or-IN")} ପଦକ୍ଷେପ)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ଫାଇଲ୍ ଡ୍ରପ୍",
    dropFileHint:
      ".asm ସୋର୍ସ ଫାଇଲକୁ ଏଡିଟର ଫ୍ରେମ ଉପରେ ଟାଣି ଛାଡନ୍ତୁ। 1 MiB ରୁ ବଡ ଫାଇଲ ଗ୍ରହଣ କରାଯିବ ନାହିଁ।",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 ଆଲଫାରେ ରିଲିଜ୍ ହୋଇଛି; ଆଠଟି ଲାଇଭ ପେରିଫେରାଲ + ଟାଇମ-ଟ୍ରାଭେଲ ଡିବଗର + ବ୍ରେକପଏଣ୍ଟ + ୱାଚ୍।",

    languageLabel: "ଭାଷା",

    themeLabel: "ଏଡିଟର ଥିମ",
    themeDark: "ଡାର୍କ",
    themeLight: "ଲାଇଟ",

    nothingToUndo: "ଫେରାଇବାକୁ କିଛି ନାହିଁ",
    fixErrorsFirst: "ପଦକ୍ଷେପ ନେବା ପୂର୍ବରୁ ତ୍ରୁଟି ସୁଧାରନ୍ତୁ",
    resetDone: "ରିସେଟ୍ ହୋଇଗଲା — ନିର୍ଦ୍ଦେଶ 0 କୁ ଫେରିଗଲା",
  },
};
