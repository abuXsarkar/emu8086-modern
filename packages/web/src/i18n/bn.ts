import type { Locale } from "./types";

// Bengali (বাংলা) translation of the IDE strings. Bengali grammar does
// not pluralize count nouns the way English does (one step / many
// steps both use the same noun form), so the count-bearing strings
// drop the singular/plural branch present in en.ts. Numbers are
// formatted with the bn-BD locale so digits render in the Bengali
// numeral system (০-৯).

export const bn: Locale = {
  id: "bn",
  name: "বাংলা",
  strings: {
    appTitle: "modern8086",
    appLead:
      "শিক্ষার্থীদের জন্য একটি আধুনিক, ওপেন-সোর্স ৮০৮৬ এমুলেটর ও অ্যাসেম্বলি আইডিই। সম্পাদনা করুন, ক্লিক করুন ",
    appLeadRunVerb: "চালান",

    loadingWasm: "wasm কোর লোড হচ্ছে…",
    loadWasmFailed: (m) => `wasm লোড করা যায়নি: ${m}`,

    source: "সোর্স",
    output: "আউটপুট",
    registers: "রেজিস্টার",
    flags: "ফ্ল্যাগ",
    devices: "ডিভাইস",
    memory: "মেমরি",

    loadExample: "উদাহরণ লোড করুন…",
    loadExampleTooltip: "এডিটরের বিষয়বস্তু সাথে আসা একটি উদাহরণ দিয়ে প্রতিস্থাপন করে",
    reset: "রিসেট",
    resetTooltip: "পুনরায় অ্যাসেম্বল করে এবং স্টেপারকে ০ নম্বর নির্দেশে নিয়ে যায়",
    back: "◀ পেছনে",
    backTooltip: "শেষ ধাপটি ফিরিয়ে আনে (টাইম-ট্রাভেল ডিবাগ)",
    step: "ধাপ ▶",
    stepTooltip: "একটি নির্দেশ চালায় (বা শুরু থেকে অ্যাসেম্বল করে এক ধাপ চালায়)",
    run: "চালান (Ctrl+Enter)",
    running: "চলছে…",
    share: "↗ শেয়ার",
    shareTooltip: "একটি লিংক কপি করে, যা এই প্রোগ্রামটি IDE-তে আবার খোলে",

    shareCopied: "লিংক ক্লিপবোর্ডে কপি হয়েছে",
    shareInUrl: "লিংকটি URL বারে আছে",

    noOutputYet: "(এখনও কোনো আউটপুট নেই — চালান চাপুন)",
    noRegistersYet: "রেজিস্টার দেখতে একটি প্রোগ্রাম চালান",

    statusHalted: "প্রোগ্রাম থেমেছে",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("bn-BD")} ধাপের পরে HLT / INT 21h প্রস্থানে পৌঁছেছে।`,
    statusOutOfSteps: "ধাপ-সীমায় থেমেছে",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("bn-BD")}টি নির্দেশ চললো কিন্তু থামলো না — সাধারণত এর মানে একটি অসীম লুপ, অথবা শেষে HLT / INT 21h fn 4Ch অনুপস্থিত।`,
    statusNoStdoutHint:
      "কিছুই ছাপা হয়নি। সংখ্যা প্রত্যাশা করলে প্রোগ্রামে INT 21h AH=02h কল লাগবে। হিসাব করা মান এখনও মেমরিতে থাকতে পারে — মেমরি হেক্স প্যানেল দেখুন।",

    errorAt: (stage, line, column, message) =>
      `${stage}-এ ত্রুটি, লাইন ${line}, কলাম ${column}: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("bn-BD")} বাইট অ্যাসেম্বল হয়েছে (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("bn-BD")} ধাপ;`,
    exitCodeLabel: "প্রস্থান কোড",

    stepLogSummary: (n) => `ধাপ লগ (${n.toLocaleString("bn-BD")} ধাপ)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "ফাইল ড্রপ",
    dropFileHint:
      ".asm সোর্স ফাইল এডিটর ফ্রেমে টেনে ছাড়ুন। ১ MiB-এর বড় ফাইল গ্রহণ করা হবে না।",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 আলফা সংস্করণে রিলিজ হয়েছে; আটটি লাইভ পেরিফেরাল + টাইম-ট্রাভেল ডিবাগার + ব্রেকপয়েন্ট + ওয়াচ।",

    languageLabel: "ভাষা",

    themeLabel: "এডিটর থিম",
    themeDark: "ডার্ক",
    themeLight: "লাইট",

    nothingToUndo: "ফেরানোর মতো কিছু নেই",
    fixErrorsFirst: "ধাপ চালানোর আগে ত্রুটি ঠিক করুন",
    resetDone: "রিসেট হয়েছে — ০ নম্বর নির্দেশে ফিরে এসেছে",
  },
};
