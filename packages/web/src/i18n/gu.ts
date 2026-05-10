import type { Locale } from "./types";

// Gujarati (ગુજરાતી) translation. Numbers formatted with gu-IN.

export const gu: Locale = {
  id: "gu",
  name: "ગુજરાતી",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "વિદ્યાર્થીઓ માટે એક આધુનિક, ઓપન-સોર્સ 8086 એમ્યુલેટર અને એસેમ્બલી IDE. સંપાદિત કરો, ક્લિક કરો ",
    appLeadRunVerb: "ચલાવો",

    loadingWasm: "wasm કોર લોડ થઈ રહ્યો છે…",
    loadWasmFailed: (m) => `wasm લોડ કરી શકાયું નહીં: ${m}`,

    source: "સ્ત્રોત",
    output: "આઉટપુટ",
    registers: "રજિસ્ટર",
    flags: "ફ્લેગ",
    devices: "ઉપકરણો",
    memory: "મેમરી",

    loadExample: "ઉદાહરણ લોડ કરો…",
    loadExampleTooltip: "એડિટરને સાથેના ઉદાહરણોમાંથી એક સાથે બદલો",
    reset: "રીસેટ",
    resetTooltip: "ફરીથી એસેમ્બલ કરો અને સ્ટેપરને સૂચના 0 પર લાવો",
    back: "◀ પાછળ",
    backTooltip: "છેલ્લું પગલું પાછું લો (ટાઇમ-ટ્રાવેલ ડિબગ)",
    step: "પગલું ▶",
    stepTooltip: "એક સૂચના ચલાવો (અથવા શરૂઆતથી એસેમ્બલ કરી એક પગલું ચલાવો)",
    run: "ચલાવો (Ctrl+Enter)",
    running: "ચાલી રહ્યું છે…",
    share: "↗ શેર",
    shareTooltip: "આ પ્રોગ્રામને IDE માં ફરીથી ખોલતી URL કૉપિ કરો",

    shareCopied: "લિંક ક્લિપબોર્ડ પર કૉપિ થઈ",
    shareInUrl: "લિંક URL બારમાં છે",

    noOutputYet: "(હજી કોઈ આઉટપુટ નથી — ચલાવો દબાવો)",
    noRegistersYet: "રજિસ્ટર જોવા માટે પ્રોગ્રામ ચલાવો",

    statusHalted: "પ્રોગ્રામ અટકી ગયો",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("gu-IN")} પગલાં પછી HLT / INT 21h બહાર નીકળી ગયું.`,
    statusOutOfSteps: "પગલાં-મર્યાદાએ અટકી ગયો",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("gu-IN")} સૂચનાઓ ચાલી પણ અટકી નહીં — સામાન્ય રીતે આનો અર્થ છે અનંત લૂપ, અથવા અંતે HLT / INT 21h fn 4Ch ગુમ.`,
    statusNoStdoutHint:
      "કંઈ છપાયું નથી. જો તમે અંકોની અપેક્ષા રાખતા હતા, તો પ્રોગ્રામને INT 21h AH=02h કૉલ્સ જોઈએ. ગણતરી કરેલા મૂલ્યો હજી મેમરીમાં હોઈ શકે છે — મેમરી હેક્સ પેનલ તપાસો.",

    errorAt: (stage, line, column, message) =>
      `${stage} ભૂલ લાઇન ${line}, કૉલમ ${column} પર: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("gu-IN")} બાઇટ એસેમ્બલ થયા (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("gu-IN")} પગલાં;`,
    exitCodeLabel: "એક્ઝિટ કોડ",

    stepLogSummary: (n) => `પગલાં લોગ (${n.toLocaleString("gu-IN")} પગલાં)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ફાઇલ ડ્રોપ",
    dropFileHint:
      ".asm સ્ત્રોત ફાઇલને એડિટર ફ્રેમ પર ખેંચીને છોડો. 1 MiB કરતા મોટી ફાઇલો સ્વીકારવામાં આવતી નથી.",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 આલ્ફામાં બહાર પડ્યું; આઠ લાઇવ પેરિફેરલ + ટાઇમ-ટ્રાવેલ ડિબગર + બ્રેકપોઇન્ટ + વોચ.",

    languageLabel: "ભાષા",

    themeLabel: "એડિટર થીમ",
    themeDark: "ડાર્ક",
    themeLight: "લાઇટ",

    nothingToUndo: "પાછું લેવા માટે કંઈ નથી",
    fixErrorsFirst: "પગલાં લેતા પહેલા ભૂલો સુધારો",
    resetDone: "રીસેટ થયું — સૂચના 0 પર પાછા",
  },
};
