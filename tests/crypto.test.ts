import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../app/lib/crypto.server";

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("secret encryption", () => {
  it("round-trips with a key and hides the plain text", () => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const enc = encryptSecret("my-courier-password");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain("my-courier-password");
    expect(decryptSecret(enc)).toBe("my-courier-password");
  });

  it("stores plain text when no key is set (local dev)", () => {
    expect(encryptSecret("abc")).toBe("abc");
    expect(decryptSecret("abc")).toBe("abc");
    expect(decryptSecret(null)).toBeNull();
  });

  it("fails on a tampered value", () => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const enc = encryptSecret("secret");
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
