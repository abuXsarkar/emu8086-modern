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

  // Run-completion status banner
  statusHalted: string;
  statusHaltedHint: (steps: number) => string;
  statusOutOfSteps: string;
  statusOutOfStepsHint: (steps: number) => string;
  statusNoStdoutHint: string;

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

  // Left rail — file-drop hint
  dropFileLabel: string;
  dropFileHint: string;

  // Footer
  footerLink: string;
  footerSeparator: string;
  footerNote: string;

  // Language picker label
  languageLabel: string;

  // Editor theme picker (header)
  themeLabel: string;
  themeDark: string;
  themeLight: string;

  // Click-feedback toasts for actions that otherwise complete silently
  nothingToUndo: string;
  fixErrorsFirst: string;
  resetDone: string;

  // Classroom mode — header pill
  classroomPill: string;
  classroomPillHint: string;
  classroomLeave: string;

  // Classroom mode — start/join modal
  classroomStartTab: string;
  classroomJoinTab: string;

  // Classroom mode — Start dialog (teacher creates a room)
  classroomStartHeading: string;
  classroomStartTemplate: string;
  classroomStartTemplateNone: string;
  classroomStartTemplateSave: string;
  classroomStartCourse: string;
  classroomStartCourseCode: string;
  classroomStartSection: string;
  classroomStartSemester: string;
  classroomStartInstitute: string;
  classroomStartDepartment: string;
  classroomStartTeacherTitle: string;
  classroomStartTeacherName: string;
  classroomStartSessionTitle: string;
  classroomStartDate: string;
  classroomStartLogoUrl: string;
  classroomStartLogoHelp: string;
  classroomStartSubmit: string;
  classroomStartCancel: string;
  classroomStartCourseRequired: string;
  classroomStartTeacherRequired: string;

  // Classroom mode — Join dialog (student or teacher reconnect)
  classroomJoinHeading: string;
  classroomJoinRoomCode: string;
  classroomJoinRollNo: string;
  classroomJoinRollNoHint: string;
  classroomJoinDisplayName: string;
  classroomJoinSubmit: string;
  classroomJoinCancel: string;
  classroomJoinRollNoRequired: string;
  classroomJoinDisplayNameRequired: string;
  classroomJoinRoomCodeRequired: string;

  // Classroom mode — Consent modal (shown to students at first join)
  classroomConsentHeading: string;
  classroomConsentBody: (teacherName: string, rollNo: string) => string;
  classroomConsentContinue: string;

  // Classroom mode — Banner
  classroomBannerCopy: string;
  classroomBannerCopied: string;

  // Classroom mode — Teacher drawer
  classroomTeacherRoster: string;
  classroomTeacherSubmissions: string;
  classroomTeacherPrompt: string;
  classroomTeacherPromptHint: string;
  classroomTeacherEmpty: string;
  classroomTeacherHandsUp: (n: number) => string;
  classroomTeacherCloseRoom: string;
  classroomTeacherDownloadZip: string;

  // Classroom mode — Student drawer
  classroomStudentConnected: (name: string) => string;
  classroomStudentRaiseHand: string;
  classroomStudentLowerHand: string;
  classroomStudentSubmit: string;
  classroomStudentFollowingTeacher: string;
  classroomStudentControlled: (teacherName: string) => string;
  classroomStudentPeers: (n: number) => string;

  // Classroom mode — connection status / errors
  classroomStatusConnecting: string;
  classroomStatusReconnecting: string;
  classroomStatusReplacedElsewhere: string;
  classroomStatusKicked: (reason: string) => string;
  classroomStatusRoomClosed: string;
  classroomStatusRoomReaped: string;
  classroomErrorRoomNotFound: string;
  classroomErrorRollNoTaken: string;
  classroomErrorProtocolMismatch: string;
  classroomErrorHostInvalid: string;
  classroomErrorServerUnreachable: string;
  classroomErrorConnectTimeout: string;
  classroomErrorGeneric: (message: string) => string;

  // Classroom mode — collapsible drawer
  classroomDrawerCollapse: string;
  classroomDrawerExpand: string;
  classroomDrawerStudentsCount: (n: number) => string;

  // Classroom mode — teacher per-student actions
  classroomTeacherLowerHand: string;
  classroomTeacherKick: string;
  classroomTeacherKickConfirm: (name: string) => string;
  classroomTeacherCloseRoomConfirm: string;

  // Classroom mode — student submit confirmation
  classroomStudentSubmitConfirm: string;
  classroomStudentSubmitDone: string;

  // Classroom mode — per-student comments
  classroomCommentHeading: string;
  classroomCommentEmpty: string;
  classroomCommentEmptyTeacher: string;
  classroomCommentPlaceholder: string;
  classroomCommentSend: string;
  classroomCommentSeen: string;
  classroomCommentMarkSeen: string;
  classroomCommentNew: (n: number) => string;
  classroomCommentFromTeacher: string;

  // Classroom mode — broadcast + take-control affordances
  classroomTeacherBroadcastOn: string;
  classroomTeacherBroadcastOff: string;
  classroomTeacherTakeControl: string;
  classroomTeacherReleaseControl: string;
  classroomTeacherControllingNow: (name: string) => string;
  classroomStudentBroadcastEmpty: string;

  // Classroom mode — reconnect attempt indicator
  classroomStatusReconnectingNth: (attempt: number) => string;
  classroomClosureDismiss: string;

  // Classroom mode — session report + CSV export
  classroomReportPrint: string;
  classroomReportCsv: string;
  classroomReportTitle: string;
  classroomReportSubtitle: (date: string) => string;
  classroomReportColRollNo: string;
  classroomReportColName: string;
  classroomReportColJoined: string;
  classroomReportColHandUp: string;
  classroomReportColSubmissions: string;
  classroomReportColComments: string;
  classroomReportColLastSubmit: string;
  classroomReportPrintHint: string;
}

export type LocaleId =
  | "en"
  | "es"
  | "bn"
  | "as"
  | "hi"
  | "ta"
  | "te"
  | "gu"
  | "mr"
  | "kn"
  | "ml"
  | "pa"
  | "or";

/**
 * Locale registration used by every non-English language file. The
 * `strings` map is `Partial<Strings>`: when a key is missing, the
 * `useStrings` hook falls back to the English value at runtime. The
 * net effect is that adding a new key only forces a translation in
 * `en.ts`; other locales fill in over time without breaking the
 * build or the app.
 *
 * The single English locale is typed more strictly via
 * {@link CompleteLocale} so it's required to cover every key.
 */
export interface Locale {
  id: LocaleId;
  name: string;
  strings: Partial<Strings>;
}

/**
 * The English locale's stricter type. Forces `en.ts` to provide a
 * value for every `Strings` key — it's the source of truth that
 * every other locale falls back to.
 */
export interface CompleteLocale {
  id: "en";
  name: string;
  strings: Strings;
}
