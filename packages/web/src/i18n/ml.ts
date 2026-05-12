import type { Locale } from "./types";

// Malayalam (മലയാളം) translation. Numbers formatted with ml-IN.

export const ml: Locale = {
  id: "ml",
  name: "മലയാളം",
  strings: {
    appTitle: "modern8086",
    appLead:
      "വിദ്യാർത്ഥികൾക്കായി ഒരു ആധുനിക, ഓപ്പൺ-സോഴ്സ് 8086 എമുലേറ്റർ ആൻഡ് അസംബ്ലി IDE. എഡിറ്റ് ചെയ്യുക, ക്ലിക്ക് ചെയ്യുക ",
    appLeadRunVerb: "പ്രവർത്തിപ്പിക്കുക",

    loadingWasm: "wasm കോർ ലോഡ് ചെയ്യുന്നു…",
    loadWasmFailed: (m) => `wasm ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല: ${m}`,

    source: "സ്രോതസ്സ്",
    output: "ഔട്ട്പുട്ട്",
    registers: "രജിസ്റ്ററുകൾ",
    flags: "ഫ്ലാഗുകൾ",
    devices: "ഉപകരണങ്ങൾ",
    memory: "മെമ്മറി",

    loadExample: "ഉദാഹരണം ലോഡ് ചെയ്യുക…",
    loadExampleTooltip: "എഡിറ്ററിനെ കൂടെ വരുന്ന ഉദാഹരണങ്ങളിലൊന്നു കൊണ്ട് മാറ്റുക",
    reset: "റീസെറ്റ്",
    resetTooltip: "വീണ്ടും അസംബിൾ ചെയ്ത് സ്റ്റെപ്പറിനെ നിർദ്ദേശം 0 ലേക്ക് കൊണ്ടുവരുക",
    back: "◀ പിന്നോട്ട്",
    backTooltip: "അവസാന ചുവട് പിന്നോട്ടാക്കുക (ടൈം-ട്രാവൽ ഡിബഗ്)",
    step: "ചുവട് ▶",
    stepTooltip: "ഒരു നിർദ്ദേശം പ്രവർത്തിപ്പിക്കുക (അല്ലെങ്കിൽ തുടക്കത്തിൽ നിന്നു അസംബിൾ ചെയ്ത് ഒരു ചുവട് പ്രവർത്തിപ്പിക്കുക)",
    run: "പ്രവർത്തിപ്പിക്കുക (Ctrl+Enter)",
    running: "പ്രവർത്തിക്കുന്നു…",
    share: "↗ പങ്കിടുക",
    shareTooltip: "ഈ പ്രോഗ്രാം IDE യിൽ വീണ്ടും തുറക്കുന്ന URL പകർത്തുക",

    shareCopied: "ലിങ്ക് ക്ലിപ്പ്ബോർഡിലേക്ക് പകർത്തി",
    shareInUrl: "ലിങ്ക് URL ബാറിൽ ഉണ്ട്",

    noOutputYet: "(ഇതുവരെ ഔട്ട്പുട്ട് ഇല്ല — പ്രവർത്തിപ്പിക്കുക അമർത്തുക)",
    noRegistersYet: "രജിസ്റ്ററുകൾ കാണാൻ ഒരു പ്രോഗ്രാം പ്രവർത്തിപ്പിക്കുക",

    statusHalted: "പ്രോഗ്രാം നിന്നു",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("ml-IN")} ചുവടുകൾക്ക് ശേഷം HLT / INT 21h പുറത്തു കടക്കലിൽ എത്തി.`,
    statusOutOfSteps: "ചുവട്-പരിധിയിൽ നിന്നു",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("ml-IN")} നിർദ്ദേശങ്ങൾ പ്രവർത്തിച്ചു പക്ഷേ നിന്നില്ല — സാധാരണയായി ഇതിനർത്ഥം അനന്ത ലൂപ്പ്, അല്ലെങ്കിൽ അവസാനത്തിൽ HLT / INT 21h fn 4Ch ഇല്ല.`,
    statusNoStdoutHint:
      "ഒന്നും അച്ചടിച്ചില്ല. നിങ്ങൾ അക്കങ്ങൾ പ്രതീക്ഷിച്ചിരുന്നെങ്കിൽ, പ്രോഗ്രാമിന് INT 21h AH=02h കോളുകൾ വേണം. കണക്കാക്കിയ മൂല്യങ്ങൾ ഇപ്പോഴും മെമ്മറിയിൽ ഉണ്ടാകാം — മെമ്മറി ഹെക്സ് പാനൽ പരിശോധിക്കുക.",

    errorAt: (stage, line, column, message) =>
      `${stage} പിശക് വരി ${line}, കോളം ${column} ൽ: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("ml-IN")} ബൈറ്റുകൾ അസംബിൾ ചെയ്തു (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("ml-IN")} ചുവടുകൾ;`,
    exitCodeLabel: "എക്സിറ്റ് കോഡ്",

    stepLogSummary: (n) => `ചുവട് ലോഗ് (${n.toLocaleString("ml-IN")} ചുവടുകൾ)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ഫയൽ ഡ്രോപ്പ്",
    dropFileHint:
      ".asm സ്രോത ഫയൽ എഡിറ്റർ ഫ്രെയിമിലേക്ക് വലിച്ചിടുക. 1 MiB-നേക്കാൾ വലിയ ഫയലുകൾ നിരസിക്കപ്പെടും.",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 ആൽഫയിൽ പുറത്തിറങ്ങി; എട്ട് ലൈവ് പെരിഫെറലുകൾ + ടൈം-ട്രാവൽ ഡിബഗ്ഗർ + ബ്രേക്ക്പോയിന്റുകൾ + വാച്ചുകൾ.",

    languageLabel: "ഭാഷ",

    themeLabel: "എഡിറ്റർ തീം",
    themeDark: "ഡാർക്ക്",
    themeLight: "ലൈറ്റ്",

    nothingToUndo: "പിൻവലിക്കാൻ ഒന്നുമില്ല",
    fixErrorsFirst: "ചുവടെടുക്കും മുമ്പ് പിശകുകൾ പരിഹരിക്കുക",
    resetDone: "റീസെറ്റ് ആയി — നിർദ്ദേശം 0 ലേക്ക് മടങ്ങി",
  },
};
