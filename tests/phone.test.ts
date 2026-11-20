import { describe, expect, it } from "vitest";
import { normalizePhone } from "../app/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["0300-1234567", "923001234567"],
    ["+92 300 1234567", "923001234567"],
    ["0092 300 1234567", "923001234567"],
    ["3001234567", "923001234567"],
    ["923001234567", "923001234567"],
  ])("Pakistan: %s -> %s", (input, expected) => {
    expect(normalizePhone(input, "92")).toBe(expected);
  });

  it("keeps numbers with an explicit + country code", () => {
    expect(normalizePhone("+971 50 123 4567", "92")).toBe("971501234567");
  });

  it("rejects empty and too-short numbers", () => {
    expect(normalizePhone("", "92")).toBeNull();
    expect(normalizePhone(null, "92")).toBeNull();
    expect(normalizePhone("12345", "92")).toBeNull();
  });
});
