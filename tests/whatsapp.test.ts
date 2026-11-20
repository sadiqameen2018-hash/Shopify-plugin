import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildConfirmationPayload,
  parseButtonReplies,
  verifySignature,
} from "../app/lib/whatsapp.server";

describe("buildConfirmationPayload", () => {
  it("puts the verification id in both button payloads", () => {
    const p = buildConfirmationPayload({
      to: "923001234567",
      templateName: "cod_order_confirmation",
      languageCode: "ur",
      bodyParams: ["Ali", "My Store", "#1001", "PKR 2500.00"],
      verificationId: "abc123",
    });
    const buttons = p.template.components.filter((c) => c.type === "button");
    expect(buttons.map((b) => b.parameters[0])).toEqual([
      { type: "payload", payload: "CONFIRM:abc123" },
      { type: "payload", payload: "CANCEL:abc123" },
    ]);
    expect(p.template.language.code).toBe("ur");
  });
});

describe("parseButtonReplies", () => {
  it("reads template quick replies and interactive replies", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "923001234567", type: "button", button: { payload: "CONFIRM:v1" } },
                  { from: "923331112222", type: "interactive", interactive: { button_reply: { id: "CANCEL:v2" } } },
                  { from: "923001234567", type: "text", text: { body: "hello" } },
                  { from: "923001234567", type: "button", button: { payload: "SOMETHING_ELSE" } },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseButtonReplies(body)).toEqual([
      { action: "CONFIRM", verificationId: "v1", from: "923001234567" },
      { action: "CANCEL", verificationId: "v2", from: "923331112222" },
    ]);
  });

  it("handles status-only and malformed bodies", () => {
    expect(parseButtonReplies({ entry: [{ changes: [{ value: { statuses: [] } }] }] })).toEqual([]);
    expect(parseButtonReplies(null)).toEqual([]);
  });
});

describe("verifySignature", () => {
  const secret = "s3cret";
  const body = '{"hello":"world"}';
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature", () => {
    expect(verifySignature(body, sig, secret)).toBe(true);
  });
  it("rejects a wrong or missing signature", () => {
    expect(verifySignature(body + " ", sig, secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha256=abcd", secret)).toBe(false);
  });
});
