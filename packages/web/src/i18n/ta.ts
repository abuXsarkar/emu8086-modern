import type { Locale } from "./types";

// Tamil (தமிழ்) translation. Tamil count nouns mostly do not
// pluralize, so the singular/plural branch is dropped. Numbers are
// formatted with ta-IN.

export const ta: Locale = {
  id: "ta",
  name: "தமிழ்",
  strings: {
    appTitle: "modern8086",
    appLead:
      "மாணவர்களுக்கான ஒரு நவீன, திறந்த-மூல 8086 எமுலேட்டர் மற்றும் அசெம்பிளி IDE. திருத்தவும், கிளிக் செய்யவும் ",
    appLeadRunVerb: "இயக்கு",

    loadingWasm: "wasm கோர் ஏற்றப்படுகிறது…",
    loadWasmFailed: (m) => `wasm ஏற்ற முடியவில்லை: ${m}`,

    source: "மூலம்",
    output: "வெளியீடு",
    registers: "பதிவகங்கள்",
    flags: "கொடிகள்",
    devices: "சாதனங்கள்",
    memory: "நினைவகம்",

    loadExample: "உதாரணம் ஏற்று…",
    loadExampleTooltip: "எடிட்டரை வழங்கப்பட்ட உதாரணங்களில் ஒன்றால் மாற்றவும்",
    reset: "மீட்டமை",
    resetTooltip: "மீண்டும் அசெம்பிள் செய்து ஸ்டெப்பரை அறிவுறுத்தல் 0 க்கு கொண்டுவா",
    back: "◀ பின்",
    backTooltip: "கடைசி படியை மீள் (டைம்-ட்ராவல் டிபக்)",
    step: "படி ▶",
    stepTooltip: "ஒரு அறிவுறுத்தலை இயக்கு (அல்லது தொடக்கத்திலிருந்து அசெம்பிள் செய்து ஒரு படி இயக்கு)",
    run: "இயக்கு (Ctrl+Enter)",
    running: "இயங்குகிறது…",
    share: "↗ பகிர்",
    shareTooltip: "இந்த நிரலை IDE-இல் மீண்டும் திறக்கும் URL ஐ நகலெடு",

    shareCopied: "இணைப்பு கிளிப்போர்டில் நகலெடுக்கப்பட்டது",
    shareInUrl: "இணைப்பு URL பட்டியில் உள்ளது",

    noOutputYet: "(இன்னும் வெளியீடு இல்லை — இயக்கு என்பதை அழுத்தவும்)",
    noRegistersYet: "பதிவகங்களைப் பார்க்க ஒரு நிரலை இயக்கவும்",

    statusHalted: "நிரல் நிறுத்தப்பட்டது",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("ta-IN")} படிகளுக்குப் பிறகு HLT / INT 21h வெளியேற்றத்தை அடைந்தது.`,
    statusOutOfSteps: "படி-வரம்பில் நிறுத்தப்பட்டது",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("ta-IN")} அறிவுறுத்தல்கள் இயங்கின ஆனால் நிற்கவில்லை — பொதுவாக ஒரு முடிவில்லாத சுழற்சி, அல்லது இறுதியில் HLT / INT 21h fn 4Ch இல்லை.`,
    statusNoStdoutHint:
      "எதுவும் அச்சிடப்படவில்லை. நீங்கள் இலக்கங்களை எதிர்பார்த்திருந்தால், நிரலுக்கு INT 21h AH=02h கால்கள் தேவை. கணக்கிடப்பட்ட மதிப்புகள் இன்னும் நினைவகத்தில் இருக்கலாம் — நினைவக ஹெக்ஸ் பேனலைச் சரிபார்க்கவும்.",

    errorAt: (stage, line, column, message) =>
      `${stage} பிழை வரி ${line}, நெடுவரிசை ${column}: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("ta-IN")} பைட்டுகள் அசெம்பிள் செய்யப்பட்டன (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("ta-IN")} படிகள்;`,
    exitCodeLabel: "வெளியேறும் குறியீடு",

    stepLogSummary: (n) => `படி பதிவு (${n.toLocaleString("ta-IN")} படிகள்)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "கோப்பு விடு",
    dropFileHint:
      ".asm மூல கோப்பை எடிட்டர் சட்டத்தில் இழுத்து விடவும். 1 MiB-ஐ விட பெரிய கோப்புகள் ஏற்கப்படாது.",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 ஆல்ஃபாவில் வெளியிடப்பட்டது; எட்டு நேரடி பெரிபெரல்கள் + டைம்-ட்ராவல் டிபக்கர் + பிரேக்பாயிண்ட்கள் + வாட்ச்கள்.",

    languageLabel: "மொழி",

    themeLabel: "எடிட்டர் தீம்",
    themeDark: "இருண்ட",
    themeLight: "ஒளி",

    nothingToUndo: "மீள ஏதுமில்லை",
    fixErrorsFirst: "படி எடுக்கும் முன் பிழைகளை சரிசெய்யவும்",
    resetDone: "மீட்டமைக்கப்பட்டது — அறிவுறுத்தல் 0 க்கு திரும்பியது",
  },
};
