// Host token: a short HMAC-SHA256 over the room id and creation
// timestamp. The teacher's browser stashes the token alongside the
// room code; any privileged action (broadcast, take-control,
// close-room, kick) requires the teacher's WebSocket connection to
// have presented the token on join.
//
// The rotation pattern is the standard JWT one, scaled down: the
// server holds a primary secret used for signing and verifying, plus
// an optional previous secret used for verify-only. Operators rotate
// by copying the active secret into `_PREVIOUS`, generating a new
// primary, and restarting. Live tokens keep working until `_PREVIOUS`
// is dropped — typically the next morning for a daily rotation
// cadence, weekly otherwise.
//
// Token format on the wire: `<base64url payload>.<base64url sig>`,
// where the payload is `{ roomId, createdAt }` JSON. Compact, easy
// to inspect from a browser dev console without tooling.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface HostTokenPayload {
  roomId: string;
  createdAt: number;
}

function b64urlEncode(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(std, "base64");
}

function sign(payloadB64: string, secret: string): string {
  return b64urlEncode(
    createHmac("sha256", secret).update(payloadB64).digest(),
  );
}

/**
 * Mint a token for a freshly created room. The returned string is
 * what the teacher's client stashes and replays on `join`.
 */
export function signHostToken(payload: HostTokenPayload, primarySecret: string): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = sign(payloadB64, primarySecret);
  return `${payloadB64}.${sig}`;
}

export interface VerifyResult {
  ok: boolean;
  payload?: HostTokenPayload;
  /** Human-readable reason for the failure; intended for server logs, not the wire. */
  reason?: string;
}

/**
 * Verify a token under the active secret first, then the previous
 * secret if one is configured. Either match counts. The expected
 * `roomId` must match the payload — even a valid signature for a
 * different room is rejected, so a token leaked from one room
 * doesn't escalate elsewhere.
 *
 * Constant-time comparison via `timingSafeEqual` so a network
 * observer can't time-attack the secret. The two-secret form is
 * still constant-time because each branch runs the full HMAC.
 */
export function verifyHostToken(
  token: string,
  expectedRoomId: string,
  primarySecret: string,
  previousSecret?: string,
): VerifyResult {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "malformed token" };
  }
  const [payloadB64, sigB64] = token.split(".", 2);
  if (!payloadB64 || !sigB64) {
    return { ok: false, reason: "malformed token" };
  }

  let payload: HostTokenPayload;
  try {
    const json = b64urlDecode(payloadB64).toString("utf8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.roomId !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return { ok: false, reason: "malformed payload" };
    }
    payload = { roomId: parsed.roomId, createdAt: parsed.createdAt };
  } catch {
    return { ok: false, reason: "malformed payload" };
  }

  if (payload.roomId !== expectedRoomId) {
    return { ok: false, reason: "room mismatch" };
  }

  const expected = b64urlDecode(sigB64);
  const candidates = previousSecret
    ? [primarySecret, previousSecret]
    : [primarySecret];

  for (const secret of candidates) {
    const candidateSig = b64urlDecode(sign(payloadB64, secret));
    if (
      candidateSig.length === expected.length &&
      timingSafeEqual(candidateSig, expected)
    ) {
      return { ok: true, payload };
    }
  }
  return { ok: false, reason: "signature mismatch" };
}

/**
 * Convenience: 32 bytes of crypto-random base64url. The format is
 * the same one operators paste into env vars; the byte length is
 * the standard "comfortably above HMAC-SHA256's expected key
 * strength" choice.
 */
export function generateSecret(): string {
  return b64urlEncode(randomBytes(32));
}
