// Shape of the IDE's user-visible strings table. Every locale ships an
// implementation of this interface; the `useStrings` hook returns one
// based on the active locale (or English by default).
//
// Strings that need parameters are typed as functions so translators
// can re-order placeholders for natural prose. Plain strings are just
// strings — no template engine needed.

export interface Strings {
  // Header
  appTitle: string;
  appLead: string;
  appLeadRunVerb: string; // word "Run" emphasized in the lead

  // Loading / fatal states
  loadingWasm: string;
  loadWasmFailed: (message: string) => string;

  // Layout headings
  source: string;
  output: string;
  registers: string;
  flags: string;
  devices: string;
  memory: string;

  // Buttons + tooltips
  loadExample: string;
  loadExampleTooltip: string;
  reset: string;
  resetTooltip: string;
  back: string;
  backTooltip: string;
  step: string;
  stepTooltip: string;
  run: string;
  running: string;
  share: string;
  shareTooltip: string;

  // Share toasts
  shareCopied: string;
  shareInUrl: string;

  // Output / state placeholders
  noOutputYet: string;
  noRegistersYet: string;

  // Error block
  errorAt: (stage: string, line: number, column: number, message: string) => string;

  // Status line items (each appears separately when its condition holds)
  bytesAssembled: (n: number, originHex: string) => string;
  stepsCount: (n: number) => string;
  exitCodeLabel: string;

  // Step log <details> summary
  stepLogSummary: (n: number) => string;

  // Memory panel sub-label
  memoryRangeLabel: string;

  // Footer
  footerLink: string;
  footerSeparator: string;
  footerNote: string;

  // Language picker label
  languageLabel: string;
}

export type LocaleId = "en" | "es";

export interface Locale {
  id: LocaleId;
  name: string;
  strings: Strings;
}
