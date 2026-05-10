import type { Locale } from "./types";

// Hindi (हिन्दी) translation. Like Bengali, Hindi count nouns are not
// pluralized the way English does, so the singular/plural branch is
// dropped on count strings. Numbers are formatted with hi-IN; the
// numbering system defaults to Latin in modern engines, which is fine
// for technical contexts like step counts and byte counts.

export const hi: Locale = {
  id: "hi",
  name: "हिन्दी",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "छात्रों के लिए एक आधुनिक, ओपन-सोर्स 8086 एमुलेटर और असेम्बली IDE। संपादित करें, क्लिक करें ",
    appLeadRunVerb: "चलाएँ",

    loadingWasm: "wasm कोर लोड हो रहा है…",
    loadWasmFailed: (m) => `wasm लोड नहीं हो सका: ${m}`,

    source: "स्रोत",
    output: "आउटपुट",
    registers: "रजिस्टर",
    flags: "फ़्लैग",
    devices: "डिवाइस",
    memory: "मेमोरी",

    loadExample: "उदाहरण लोड करें…",
    loadExampleTooltip: "एडिटर को साथ आने वाले उदाहरणों में से किसी एक से बदलें",
    reset: "रीसेट",
    resetTooltip: "फिर से असेम्बल करें और स्टेपर को निर्देश 0 पर ले जाएँ",
    back: "◀ पीछे",
    backTooltip: "पिछला स्टेप वापस लें (टाइम-ट्रैवल डिबग)",
    step: "स्टेप ▶",
    stepTooltip: "एक निर्देश चलाएँ (या शुरू से असेम्बल करके एक स्टेप चलाएँ)",
    run: "चलाएँ (Ctrl+Enter)",
    running: "चल रहा है…",
    share: "↗ शेयर",
    shareTooltip: "एक URL कॉपी करें जो इस प्रोग्राम को IDE में फिर से खोल दे",

    shareCopied: "लिंक क्लिपबोर्ड पर कॉपी हो गया",
    shareInUrl: "लिंक URL बार में है",

    noOutputYet: "(अभी कोई आउटपुट नहीं — चलाएँ दबाएँ)",
    noRegistersYet: "रजिस्टर देखने के लिए कोई प्रोग्राम चलाएँ",

    statusHalted: "प्रोग्राम रुक गया",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("hi-IN")} स्टेप के बाद HLT / INT 21h बाहर निकलने पर पहुँचा।`,
    statusOutOfSteps: "स्टेप-सीमा पर रुका",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("hi-IN")} निर्देश चले पर रुके नहीं — आमतौर पर इसका मतलब है एक अनंत लूप, या अंत में HLT / INT 21h fn 4Ch की कमी।`,
    statusNoStdoutHint:
      "कुछ भी प्रिंट नहीं हुआ। अगर आप अंक देखने की उम्मीद कर रहे थे, तो प्रोग्राम को INT 21h AH=02h कॉल चाहिए। गणना किए गए मान अभी भी मेमोरी में हो सकते हैं — मेमोरी हेक्स पैनल देखें।",

    errorAt: (stage, line, column, message) =>
      `${stage} त्रुटि लाइन ${line}, कॉलम ${column} पर: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("hi-IN")} बाइट असेम्बल हुए (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("hi-IN")} स्टेप;`,
    exitCodeLabel: "एग्ज़िट कोड",

    stepLogSummary: (n) => `स्टेप लॉग (${n.toLocaleString("hi-IN")} स्टेप)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "फ़ाइल ड्रॉप",
    dropFileHint:
      ".asm स्रोत फ़ाइल को एडिटर फ्रेम पर खींचकर छोड़ें। 1 MiB से बड़ी फ़ाइलें अस्वीकार की जाती हैं।",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 अल्फा संस्करण में रिलीज़; आठ लाइव पेरीफ़ेरल + टाइम-ट्रैवल डिबगर + ब्रेकपॉइंट + वॉच।",

    languageLabel: "भाषा",

    themeLabel: "एडिटर थीम",
    themeDark: "डार्क",
    themeLight: "लाइट",

    nothingToUndo: "वापस लेने के लिए कुछ नहीं है",
    fixErrorsFirst: "स्टेप करने से पहले त्रुटियाँ ठीक करें",
    resetDone: "रीसेट हुआ — निर्देश 0 पर वापस",
  },
};
