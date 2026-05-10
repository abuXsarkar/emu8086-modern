import type { CompleteLocale } from "./types";

// English is the source of truth: every key must be present here.
// Other locales fall back to these values when they're missing a
// translation, so leaving a key out elsewhere is graceful — leaving
// one out here would compile-fail because the type is stricter than
// the `Locale` shape used elsewhere.
export const en: CompleteLocale = {
  id: "en",
  name: "English",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "A modern, open-source 8086 emulator and assembly IDE for students. Edit, click ",
    appLeadRunVerb: "Run",

    loadingWasm: "Loading wasm core…",
    loadWasmFailed: (m) => `Failed to load wasm: ${m}`,

    source: "source",
    output: "output",
    registers: "registers",
    flags: "flags",
    devices: "devices",
    memory: "memory",

    loadExample: "Load example…",
    loadExampleTooltip: "Replace the editor with one of the bundled examples",
    reset: "Reset",
    resetTooltip: "Re-assemble and point the stepper at instruction 0",
    back: "◀ Back",
    backTooltip: "Undo the last step (time-travel debug)",
    step: "Step ▶",
    stepTooltip: "Execute one instruction (or assemble + step from start)",
    run: "Run (Ctrl+Enter)",
    running: "running…",
    share: "↗ Share",
    shareTooltip: "Copy a URL that re-opens this program in the IDE",

    shareCopied: "link copied to clipboard",
    shareInUrl: "link is in the URL bar",

    noOutputYet: "(no output yet — click Run)",
    noRegistersYet: "run a program to see registers",

    statusHalted: "Program halted",
    statusHaltedHint: (steps) =>
      `Reached HLT / INT 21h exit after ${steps.toLocaleString("en-US")} step${steps === 1 ? "" : "s"}.`,
    statusOutOfSteps: "Stopped at step limit",
    statusOutOfStepsHint: (steps) =>
      `Ran ${steps.toLocaleString("en-US")} instructions without halting — usually means an infinite loop, or a missing HLT / INT 21h fn 4Ch at the end.`,
    statusNoStdoutHint:
      "No output was printed. If you were expecting digits, the program needs INT 21h AH=02h calls. Computed values may still be in memory — check the memory hex panel.",

    errorAt: (stage, line, column, message) =>
      `${stage} error at line ${line}, column ${column}: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n} bytes assembled (origin = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("en-US")} steps;`,
    exitCodeLabel: "exit code",

    stepLogSummary: (n) => `step log (${n} step${n === 1 ? "" : "s"})`,

    memoryRangeLabel: "DS:0x100..1FF",

    dropFileLabel: "Drop file",
    dropFileHint:
      "Drop an .asm source file onto the editor frame. Files larger than 1 MiB are rejected.",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 shipped at alpha; eight live peripherals + time-travel debugger + breakpoints + watches.",

    languageLabel: "Language",

    themeLabel: "Editor theme",
    themeDark: "Dark",
    themeLight: "Light",

    nothingToUndo: "nothing to undo",
    fixErrorsFirst: "fix the errors before stepping",
    resetDone: "reset — back at instruction 0",

    // Classroom mode
    classroomPill: "Classroom",
    classroomPillHint: "Start or join a live classroom",
    classroomLeave: "Leave classroom",

    classroomStartTab: "Start a classroom",
    classroomJoinTab: "Join with code",

    classroomStartHeading: "Start a new classroom session",
    classroomStartTemplate: "Template",
    classroomStartTemplateNone: "(no template — fill in below)",
    classroomStartTemplateSave: "Save these details as a template for next time",
    classroomStartCourse: "Course",
    classroomStartCourseCode: "Course code",
    classroomStartSection: "Section",
    classroomStartSemester: "Semester",
    classroomStartInstitute: "Institute / University",
    classroomStartDepartment: "Department",
    classroomStartTeacherTitle: "Title",
    classroomStartTeacherName: "Your name",
    classroomStartSessionTitle: "Lab title",
    classroomStartDate: "Date",
    classroomStartLogoUrl: "Logo URL (optional)",
    classroomStartLogoHelp:
      "Loaded by every participant from the URL above; their IPs become visible to that host. Use a logo on the same domain as the IDE, or your institute's CDN.",
    classroomStartSubmit: "Start session",
    classroomStartCancel: "Cancel",
    classroomStartCourseRequired: "Course is required",
    classroomStartTeacherRequired: "Your name is required",

    classroomJoinHeading: "Join a classroom",
    classroomJoinRoomCode: "Room code",
    classroomJoinRollNo: "Roll No.",
    classroomJoinRollNoHint:
      "The student ID assigned by your institute (e.g. CSE-22-001).",
    classroomJoinDisplayName: "Your name",
    classroomJoinSubmit: "Join",
    classroomJoinCancel: "Cancel",
    classroomJoinRollNoRequired: "Roll number is required",
    classroomJoinDisplayNameRequired: "Your name is required",
    classroomJoinRoomCodeRequired: "Room code is required",

    classroomConsentHeading: "Joining the lab",
    classroomConsentBody: (teacherName, rollNo) =>
      `${teacherName} can see your editor in real time and may take control to demonstrate. Your roll number ${rollNo} is visible to other participants.`,
    classroomConsentContinue: "I understand — continue",

    classroomBannerCopy: "Copy room link",
    classroomBannerCopied: "Copied",

    classroomTeacherRoster: "Roster",
    classroomTeacherSubmissions: "Submissions",
    classroomTeacherPrompt: "Prompt",
    classroomTeacherPromptHint: "What students see for this exercise.",
    classroomTeacherEmpty: "No students have joined yet — share the room code.",
    classroomTeacherHandsUp: (n) =>
      n === 1 ? "1 hand up" : `${n} hands up`,
    classroomTeacherCloseRoom: "Close room",
    classroomTeacherDownloadZip: "Download submissions (.zip)",

    classroomStudentConnected: (name) => `Connected as ${name}`,
    classroomStudentRaiseHand: "Raise hand",
    classroomStudentLowerHand: "Lower hand",
    classroomStudentSubmit: "Submit current code",
    classroomStudentFollowingTeacher: "Following teacher's screen",
    classroomStudentControlled: (teacherName) =>
      `${teacherName} is editing your file`,
    classroomStudentPeers: (n) =>
      n === 1 ? "1 other student online" : `${n} other students online`,

    classroomStatusConnecting: "Connecting…",
    classroomStatusReconnecting: "Connection lost — reconnecting…",
    classroomStatusReplacedElsewhere:
      "You connected from another tab; this one is now disconnected.",
    classroomStatusKicked: (reason) => `Removed from the room: ${reason}`,
    classroomStatusRoomClosed: "The teacher has ended this session.",
    classroomStatusRoomReaped: "Session timed out (teacher disconnected).",
    classroomErrorRoomNotFound: "Room not found or already closed.",
    classroomErrorRollNoTaken:
      "That roll number is already in use in this room.",
    classroomErrorProtocolMismatch:
      "App version mismatch — please refresh.",
    classroomErrorHostInvalid:
      "Host token rejected. Try starting a fresh session.",
    classroomErrorGeneric: (message) => `Error: ${message}`,

    classroomDrawerCollapse: "Collapse",
    classroomDrawerExpand: "Expand classroom panel",
    classroomDrawerStudentsCount: (n) =>
      n === 1 ? "1 student" : `${n} students`,

    classroomTeacherLowerHand: "Lower hand",
    classroomTeacherKick: "Remove",
    classroomTeacherKickConfirm: (name) => `Remove ${name} from the classroom?`,
    classroomTeacherCloseRoomConfirm:
      "Close the classroom? All students will be disconnected.",

    classroomStudentSubmitConfirm:
      "Send your current code to the teacher?",
    classroomStudentSubmitDone: "Submitted",

    classroomCommentHeading: "Notes",
    classroomCommentEmpty: "Your teacher hasn't left any notes yet.",
    classroomCommentEmptyTeacher: "No notes for this student yet.",
    classroomCommentPlaceholder: "Leave a note for this student…",
    classroomCommentSend: "Send",
    classroomCommentSeen: "Seen",
    classroomCommentMarkSeen: "Mark as read",
    classroomCommentNew: (n) => (n === 1 ? "1 new note" : `${n} new notes`),
    classroomCommentFromTeacher: "from your teacher",

    classroomTeacherBroadcastOn: "Stop broadcasting",
    classroomTeacherBroadcastOff: "Broadcast my screen",
    classroomTeacherTakeControl: "Take control",
    classroomTeacherReleaseControl: "Release control",
    classroomTeacherControllingNow: (name) => `Controlling ${name}`,
    classroomStudentBroadcastEmpty:
      "Waiting for the teacher to start typing…",

    classroomStatusReconnectingNth: (attempt) =>
      `Reconnecting (attempt ${attempt})…`,
    classroomClosureDismiss: "Dismiss",

    classroomReportPrint: "Print summary",
    classroomReportCsv: "Export CSV",
    classroomReportTitle: "Lab session summary",
    classroomReportSubtitle: (date) => `Session on ${date}`,
    classroomReportColRollNo: "Roll No",
    classroomReportColName: "Name",
    classroomReportColJoined: "Joined",
    classroomReportColHandUp: "Hand",
    classroomReportColSubmissions: "Submissions",
    classroomReportColComments: "Notes",
    classroomReportColLastSubmit: "Latest submission",
    classroomReportPrintHint: "Use your browser's Print dialog (Ctrl+P) to save as PDF.",
  },
};
