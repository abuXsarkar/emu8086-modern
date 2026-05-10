import type { Locale } from "./types";

// Telugu (తెలుగు) translation. Telugu pluralization is more nuanced
// than Hindi/Bengali but we keep count strings in a single form for
// consistency with the other Indic locales. Numbers are formatted
// with te-IN.

export const te: Locale = {
  id: "te",
  name: "తెలుగు",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "విద్యార్థుల కోసం ఒక ఆధునిక, ఓపెన్-సోర్స్ 8086 ఎమ్యులేటర్ మరియు అసెంబ్లీ IDE. సవరించండి, క్లిక్ చేయండి ",
    appLeadRunVerb: "అమలు",

    loadingWasm: "wasm కోర్ లోడ్ అవుతోంది…",
    loadWasmFailed: (m) => `wasm లోడ్ చేయడంలో విఫలమైంది: ${m}`,

    source: "మూలం",
    output: "అవుట్‌పుట్",
    registers: "రిజిస్టర్లు",
    flags: "ఫ్లాగ్‌లు",
    devices: "పరికరాలు",
    memory: "మెమొరీ",

    loadExample: "ఉదాహరణ లోడ్ చేయండి…",
    loadExampleTooltip: "ఎడిటర్‌ను అందించబడిన ఉదాహరణలలో ఒకదానితో భర్తీ చేయండి",
    reset: "రీసెట్",
    resetTooltip: "మళ్లీ అసెంబుల్ చేసి స్టెప్పర్‌ని సూచన 0 వద్దకు తీసుకువెళ్లండి",
    back: "◀ వెనుకకు",
    backTooltip: "చివరి దశను రద్దు చేయండి (టైమ్-ట్రావెల్ డీబగ్)",
    step: "దశ ▶",
    stepTooltip: "ఒక సూచనను అమలు చేయండి (లేదా ప్రారంభం నుండి అసెంబుల్ చేసి ఒక దశ అమలు చేయండి)",
    run: "అమలు (Ctrl+Enter)",
    running: "అమలులో…",
    share: "↗ షేర్",
    shareTooltip: "ఈ ప్రోగ్రామ్‌ను IDE లో మళ్ళీ తెరిచే URL ను కాపీ చేయండి",

    shareCopied: "లింక్ క్లిప్‌బోర్డ్‌కు కాపీ అయింది",
    shareInUrl: "లింక్ URL బార్‌లో ఉంది",

    noOutputYet: "(ఇంకా అవుట్‌పుట్ లేదు — అమలు నొక్కండి)",
    noRegistersYet: "రిజిస్టర్‌లను చూడటానికి ఒక ప్రోగ్రామ్‌ను అమలు చేయండి",

    statusHalted: "ప్రోగ్రామ్ ఆగిపోయింది",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("te-IN")} దశల తర్వాత HLT / INT 21h నిష్క్రమణకు చేరుకుంది.`,
    statusOutOfSteps: "దశ-పరిమితి వద్ద ఆగిపోయింది",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("te-IN")} సూచనలు అమలయ్యాయి కానీ ఆగలేదు — సాధారణంగా దీని అర్థం అనంత లూప్, లేదా చివరలో HLT / INT 21h fn 4Ch లేదు.`,
    statusNoStdoutHint:
      "ఏమీ ముద్రించబడలేదు. మీరు అంకెలు ఆశించినట్లయితే, ప్రోగ్రామ్‌కు INT 21h AH=02h కాల్‌లు అవసరం. లెక్కించిన విలువలు ఇప్పటికీ మెమొరీలో ఉండవచ్చు — మెమొరీ హెక్స్ ప్యానెల్‌ను తనిఖీ చేయండి.",

    errorAt: (stage, line, column, message) =>
      `${stage} లోపం లైన్ ${line}, నిలువు ${column} వద్ద: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("te-IN")} బైట్లు అసెంబుల్ చేయబడ్డాయి (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("te-IN")} దశలు;`,
    exitCodeLabel: "ఎగ్జిట్ కోడ్",

    stepLogSummary: (n) => `దశ లాగ్ (${n.toLocaleString("te-IN")} దశలు)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ఫైల్ డ్రాప్",
    dropFileHint:
      ".asm సోర్స్ ఫైల్‌ను ఎడిటర్ ఫ్రేమ్‌పైకి లాగి వదలండి. 1 MiB కంటే పెద్ద ఫైళ్లు తిరస్కరించబడతాయి.",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 ఆల్ఫాలో విడుదలైంది; ఎనిమిది లైవ్ పెరిఫెరల్స్ + టైమ్-ట్రావెల్ డీబగ్గర్ + బ్రేక్‌పాయింట్‌లు + వాచ్‌లు.",

    languageLabel: "భాష",

    themeLabel: "ఎడిటర్ థీమ్",
    themeDark: "డార్క్",
    themeLight: "లైట్",

    nothingToUndo: "రద్దు చేయడానికి ఏమీ లేదు",
    fixErrorsFirst: "దశలు తీసుకునే ముందు లోపాలను సరిచేయండి",
    resetDone: "రీసెట్ పూర్తయింది — సూచన 0 వద్దకు తిరిగి వచ్చింది",
  },
};
