import { describe, expect, it } from "vitest";
import {
  generateSecret,
  signHostToken,
  verifyHostToken,
} from "../src/host-token.js";

describe("host-token", () => {
  const ROOM = "blue-fox-42";
  const PAYLOAD = { roomId: ROOM, createdAt: 1_700_000_000_000 };

  it("a freshly minted token verifies under the same secret", () => {
    const s = generateSecret();
    const tok = signHostToken(PAYLOAD, s);
    const r = verifyHostToken(tok, ROOM, s);
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual(PAYLOAD);
  });

  it("a token signed with a different secret fails", () => {
    const a = generateSecret();
    const b = generateSecret();
    const tok = signHostToken(PAYLOAD, a);
    const r = verifyHostToken(tok, ROOM, b);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature mismatch");
  });

  it("rotation: a token signed under the previous secret still verifies", () => {
    const oldSecret = generateSecret();
    const newSecret = generateSecret();
    const tok = signHostToken(PAYLOAD, oldSecret);
    // Operator has rotated: new is primary, old is _PREVIOUS.
    const r = verifyHostToken(tok, ROOM, newSecret, oldSecret);
    expect(r.ok).toBe(true);
  });

  it("rotation: an old token stops verifying once previous is dropped", () => {
    const oldSecret = generateSecret();
    const newSecret = generateSecret();
    const tok = signHostToken(PAYLOAD, oldSecret);
    const r = verifyHostToken(tok, ROOM, newSecret, undefined);
    expect(r.ok).toBe(false);
  });

  it("a valid token is rejected if the room id doesn't match the payload", () => {
    const s = generateSecret();
    const tok = signHostToken(PAYLOAD, s);
    const r = verifyHostToken(tok, "red-cat-99", s);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("room mismatch");
  });

  it("malformed inputs are rejected without throwing", () => {
    const s = generateSecret();
    expect(verifyHostToken("nope", ROOM, s).ok).toBe(false);
    expect(verifyHostToken("a.b.c.d", ROOM, s).ok).toBe(false);
    expect(verifyHostToken(".", ROOM, s).ok).toBe(false);
    // Payload with malformed JSON
    expect(verifyHostToken("aGVsbG8.bm9wZQ", ROOM, s).ok).toBe(false);
  });

  it("generateSecret produces enough entropy that two calls don't collide", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
    // 32 bytes → 43 base64url chars (no padding)
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
