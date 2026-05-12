import type { Locale } from "./types";

// Assamese (অসমীয়া) translation of the IDE strings. Assamese shares the
// Eastern Nagari script with Bengali but is a distinct language; the
// most visible orthographic differences are র → ৰ and ব → ৱ (the
// latter only for the "wa" sound). Like Bengali, Assamese does not
// pluralize count nouns, so the count-bearing strings drop the
// singular/plural branch present in en.ts. Numbers are formatted with
// the as-IN locale — Assamese uses the same Indic numeral shapes as
// Bengali (০-৯).

export const as: Locale = {
  id: "as",
  name: "অসমীয়া",
  strings: {
    appTitle: "modern8086",
    appLead:
      "শিক্ষাৰ্থীসকলৰ বাবে এটা আধুনিক, মুক্ত-উৎস ৮০৮৬ এমুলেটৰ আৰু এছেম্বলি IDE। সম্পাদনা কৰক, ক্লিক কৰক ",
    appLeadRunVerb: "চলাওক",

    loadingWasm: "wasm কোৰ লোড হৈ আছে…",
    loadWasmFailed: (m) => `wasm লোড কৰিব পৰা নগ’ল: ${m}`,

    source: "ছ’ৰ্ছ",
    output: "আউটপুট",
    registers: "ৰেজিষ্টাৰ",
    flags: "ফ্লেগ",
    devices: "ডিভাইচ",
    memory: "মেমৰি",

    loadExample: "উদাহৰণ লোড কৰক…",
    loadExampleTooltip: "এডিটৰৰ বিষয়বস্তু লগত অহা এটা উদাহৰণৰে সলনি কৰক",
    reset: "ৰিছেট",
    resetTooltip: "পুনৰ এছেম্বল কৰি ষ্টেপাৰক ০ নম্বৰ নিৰ্দেশলৈ লৈ যায়",
    back: "◀ পিছলৈ",
    backTooltip: "শেহতীয়া স্তৰটো ওভতাই দিয়ক (টাইম-ট্ৰেভেল ডিবাগ)",
    step: "স্তৰ ▶",
    stepTooltip: "এটা নিৰ্দেশ চলাওক (বা আৰম্ভণিৰ পৰা এছেম্বল কৰি এটা স্তৰ চলাওক)",
    run: "চলাওক (Ctrl+Enter)",
    running: "চলি আছে…",
    share: "↗ শ্বেয়াৰ",
    shareTooltip: "এই প্ৰগ্ৰামটো IDE-ত পুনৰ খোলা এটা লিংক কপি কৰক",

    shareCopied: "লিংক ক্লিপব’ৰ্ডত কপি হ’ল",
    shareInUrl: "লিংকটো URL বাৰত আছে",

    noOutputYet: "(এতিয়ালৈকে কোনো আউটপুট নাই — চলাওক টিপক)",
    noRegistersYet: "ৰেজিষ্টাৰ চাবলৈ এটা প্ৰগ্ৰাম চলাওক",

    statusHalted: "প্ৰগ্ৰাম ৰখি গ’ল",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("as-IN")} স্তৰৰ পিছত HLT / INT 21h প্ৰস্থানত উপনীত হ’ল।`,
    statusOutOfSteps: "স্তৰ-সীমাত ৰখি গ’ল",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("as-IN")}টা নিৰ্দেশ চলিল কিন্তু ৰখা নাই — সাধাৰণতে ইয়াৰ অৰ্থ এটা অসীম লুপ, বা শেষত HLT / INT 21h fn 4Ch নথকা।`,
    statusNoStdoutHint:
      "একো ছপা হোৱা নাই। আপুনি যদি সংখ্যা আশা কৰিছিল, প্ৰগ্ৰামত INT 21h AH=02h কল লাগিব। গণনা কৰা মান এতিয়াও মেমৰিত থাকিব পাৰে — মেমৰি হেক্স পেনেল চাওক।",

    errorAt: (stage, line, column, message) =>
      `${stage}-ত ত্ৰুটি, লাইন ${line}, কলাম ${column}: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("as-IN")} বাইট এছেম্বল হ’ল (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("as-IN")} স্তৰ;`,
    exitCodeLabel: "প্ৰস্থান ক’ড",

    stepLogSummary: (n) => `স্তৰ লগ (${n.toLocaleString("as-IN")} স্তৰ)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ফাইল ড্ৰপ",
    dropFileHint:
      ".asm ছ’ৰ্ছ ফাইল এডিটৰ ফ্ৰেমত টানি এৰক। ১ MiB-তকৈ ডাঙৰ ফাইল গ্ৰহণ কৰা নহ’ব।",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 আলফা সংস্কৰণত ৰিলিজ হ’ল; আঠটা লাইভ পেৰিফেৰেল + টাইম-ট্ৰেভেল ডিবাগাৰ + ব্ৰেকপইণ্ট + ৱাচ।",

    languageLabel: "ভাষা",

    themeLabel: "এডিটৰ থিম",
    themeDark: "ডাৰ্ক",
    themeLight: "লাইট",

    nothingToUndo: "ওভতাবলৈ একো নাই",
    fixErrorsFirst: "স্তৰ চলোৱাৰ আগতে ত্ৰুটিবোৰ শুধৰাওক",
    resetDone: "ৰিছেট হ’ল — ০ নম্বৰ নিৰ্দেশলৈ ঘূৰি আহিল",
  },
};
