import { describe, expect, it } from "vitest";
import { AVATAR_ALPHABET, getUserCode } from "./avatar";

describe("public profile identifiers", () => {
  it("keeps six valid characters even when the hash has its sign bit set", () => {
    const code = getUserCode("22222222-2222-4222-8222-222222222222");
    expect(code).toHaveLength(10);
    expect(code.startsWith("AST-")).toBe(true);
    for (const char of code.slice(4)) expect(AVATAR_ALPHABET.includes(char)).toBe(true);
  });
});