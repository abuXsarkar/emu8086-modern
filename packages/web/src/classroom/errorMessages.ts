// Maps protocol ErrorCodes to localized user-facing strings.
// The server's `error.message` field is English; this helper picks
// the right translation based on the active locale's Strings table.
//
// Codes that don't have a dedicated translation fall back to
// `classroomErrorGeneric(message)` which prepends "Error:" and the
// server's text — better than dropping the message entirely.

import type { ErrorCode } from "@emu8086/classroom-protocol";
import type { Strings } from "../i18n/types";

export function localizeErrorCode(
  code: ErrorCode,
  serverMessage: string,
  t: Strings,
): string {
  switch (code) {
    case "room_not_found":
    case "room_closed":
      return t.classroomErrorRoomNotFound;
    case "roll_no_taken":
      return t.classroomErrorRollNoTaken;
    case "protocol_mismatch":
      return t.classroomErrorProtocolMismatch;
    case "host_token_invalid":
    case "host_token_required":
      return t.classroomErrorHostInvalid;
    case "roll_no_required":
      return t.classroomJoinRollNoRequired;
    case "display_name_required":
      return t.classroomJoinDisplayNameRequired;
    case "course_required":
      return t.classroomStartCourseRequired;
    case "teacher_name_required":
      return t.classroomStartTeacherRequired;
    case "not_authorized":
    case "too_large":
    case "rate_limited":
    case "internal_error":
      return t.classroomErrorGeneric(serverMessage);
  }
}
