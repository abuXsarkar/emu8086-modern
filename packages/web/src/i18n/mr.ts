import type { Locale } from "./types";

// Marathi (मराठी) translation. Numbers formatted with mr-IN.

export const mr: Locale = {
  id: "mr",
  name: "मराठी",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "विद्यार्थ्यांसाठी एक आधुनिक, ओपन-सोर्स 8086 एमुलेटर आणि असेम्बली IDE. संपादित करा, क्लिक करा ",
    appLeadRunVerb: "चालवा",

    loadingWasm: "wasm कोर लोड होत आहे…",
    loadWasmFailed: (m) => `wasm लोड करण्यात अयशस्वी: ${m}`,

    source: "स्रोत",
    output: "आउटपुट",
    registers: "रजिस्टर",
    flags: "फ्लॅग",
    devices: "उपकरणे",
    memory: "मेमरी",

    loadExample: "उदाहरण लोड करा…",
    loadExampleTooltip: "एडिटरला सोबत आलेल्या उदाहरणांपैकी एकाने बदला",
    reset: "रीसेट",
    resetTooltip: "पुन्हा असेम्बल करा आणि स्टेपरला सूचना 0 वर न्या",
    back: "◀ मागे",
    backTooltip: "शेवटचे पाऊल मागे घ्या (टाइम-ट्रॅव्हल डीबग)",
    step: "पाऊल ▶",
    stepTooltip: "एक सूचना चालवा (किंवा सुरुवातीपासून असेम्बल करून एक पाऊल चालवा)",
    run: "चालवा (Ctrl+Enter)",
    running: "चालू आहे…",
    share: "↗ शेअर",
    shareTooltip: "हा प्रोग्राम IDE मध्ये पुन्हा उघडणारा URL कॉपी करा",

    shareCopied: "लिंक क्लिपबोर्डवर कॉपी झाली",
    shareInUrl: "लिंक URL बारमध्ये आहे",

    noOutputYet: "(अद्याप कोणतेही आउटपुट नाही — चालवा दाबा)",
    noRegistersYet: "रजिस्टर पाहण्यासाठी प्रोग्राम चालवा",

    statusHalted: "प्रोग्राम थांबला",
    statusHaltedHint: (steps) =>
      `${steps.toLocaleString("mr-IN")} पावलांनंतर HLT / INT 21h बाहेर पडण्याकडे पोहोचले.`,
    statusOutOfSteps: "पाऊल-मर्यादेवर थांबले",
    statusOutOfStepsHint: (steps) =>
      `${steps.toLocaleString("mr-IN")} सूचना चालल्या पण थांबल्या नाहीत — सहसा याचा अर्थ अनंत लूप, किंवा शेवटी HLT / INT 21h fn 4Ch नाही.`,
    statusNoStdoutHint:
      "काहीही छापले गेले नाही. जर आपण आकडे पाहण्याची अपेक्षा करत असाल, तर प्रोग्रामला INT 21h AH=02h कॉल आवश्यक आहेत. गणना केलेली मूल्ये अद्याप मेमरीमध्ये असू शकतात — मेमरी हेक्स पॅनेल तपासा.",

    errorAt: (stage, line, column, message) =>
      `${stage} त्रुटी ओळ ${line}, स्तंभ ${column} वर: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n.toLocaleString("mr-IN")} बाइट असेम्बल झाले (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("mr-IN")} पावले;`,
    exitCodeLabel: "एक्झिट कोड",

    stepLogSummary: (n) => `पाऊल लॉग (${n.toLocaleString("mr-IN")} पावले)`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "फाइल ड्रॉप",
    dropFileHint:
      ".asm स्रोत फाइल एडिटर फ्रेमवर ओढून सोडा. 1 MiB पेक्षा मोठ्या फाइल्स नाकारल्या जातात.",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 अल्फामध्ये रिलीज झाले; आठ लाइव्ह पेरीफेरल + टाइम-ट्रॅव्हल डीबगर + ब्रेकपॉइंट + वॉच.",

    languageLabel: "भाषा",

    themeLabel: "एडिटर थीम",
    themeDark: "डार्क",
    themeLight: "लाइट",

    nothingToUndo: "मागे घेण्यासाठी काहीही नाही",
    fixErrorsFirst: "पाऊल टाकण्यापूर्वी त्रुटी दुरुस्त करा",
    resetDone: "रीसेट झाले — सूचना 0 वर परत",
  },
};
