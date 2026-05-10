import { describe, expect, it } from "vitest";
import {
  COLORS,
  ANIMALS,
  generateRoomCode,
  isPlausibleRoomCode,
} from "../src/wordlist.js";

describe("wordlist", () => {
  it("color and animal lists are non-empty and lowercase a-z", () => {
    expect(COLORS.length).toBeGreaterThan(20);
    expect(ANIMALS.length).toBeGreaterThan(40);
    const word = /^[a-z]+$/;
    for (const c of COLORS) expect(c).toMatch(word);
    for (const a of ANIMALS) expect(a).toMatch(word);
  });

  it("there are no duplicate words in either list", () => {
    expect(new Set(COLORS).size).toBe(COLORS.length);
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length);
  });

  it("generated codes match the canonical color-animal-NN shape", () => {
    const code = generateRoomCode(() => false);
    expect(code).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]$/);
    expect(isPlausibleRoomCode(code)).toBe(true);
  });

  it("retries on collision and eventually returns an unused code", () => {
    let calls = 0;
    const code = generateRoomCode((_c) => {
      calls++;
      return calls < 5; // first four attempts collide, fifth wins
    });
    expect(code).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]$/);
    expect(calls).toBe(5);
  });

  it("throws when every attempt collides", () => {
    expect(() => generateRoomCode(() => true, 8)).toThrow(/non-colliding/);
  });

  it("isPlausibleRoomCode rejects garbage", () => {
    expect(isPlausibleRoomCode("blue-fox-42")).toBe(true);
    expect(isPlausibleRoomCode("BLUE-FOX-42")).toBe(false);
    expect(isPlausibleRoomCode("blue-fox-9")).toBe(false); // single digit
    expect(isPlausibleRoomCode("blue-fox-100")).toBe(false); // 3 digits
    expect(isPlausibleRoomCode("blue_fox_42")).toBe(false);
    expect(isPlausibleRoomCode("")).toBe(false);
    expect(isPlausibleRoomCode(42)).toBe(false);
    expect(isPlausibleRoomCode(null)).toBe(false);
  });
});
