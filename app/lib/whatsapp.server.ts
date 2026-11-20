import crypto from "node:crypto";
import { decryptSecret } from "./crypto.server";

/**
 * Minimal WhatsApp Cloud API (Meta) client.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

export const REPLY_CONFIRM = "CONFIRM";
export const REPLY_CANCEL = "CANCEL";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

/** The merchant's own number if configured, otherwise the app's shared number. */
export function resolveCredentials(settings: {
  waPhoneNumberId?: string | null;
  waAccessToken?: string | null;
}): WhatsAppCredentials | null {
  const phoneNumberId = settings.waPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = decryptSecret(settings.waAccessToken) || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

export interface ConfirmationMessage {
  to: string;
  templateName: string;
  languageCode: string;
  /** Body variables {{1}}..{{4}}: customer name, store name, order name, total. */
  bodyParams: string[];
  /** Our verification id, echoed back in the button payload. */
  verificationId: string;
}

/**
 * Build the template message payload. The template must be approved in
 * WhatsApp Manager with a body that has 4 variables and two quick-reply
 * buttons: index 0 = confirm, index 1 = cancel (see README).
 */
export function buildConfirmationPayload(msg: ConfirmationMessage) {
  return {
    messaging_product: "whatsapp",
    to: msg.to,
    type: "template",
    template: {
      name: msg.templateName,
      language: { code: msg.languageCode },
      components: [
        {
          type: "body",
          parameters: msg.bodyParams.map((text) => ({ type: "text", text })),
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: `${REPLY_CONFIRM}:${msg.verificationId}` }],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "1",
          parameters: [{ type: "payload", payload: `${REPLY_CANCEL}:${msg.verificationId}` }],
        },
      ],
    },
  };
}

export async function sendWhatsApp(
  creds: WhatsAppCredentials,
  payload: unknown,
): Promise<{ messageId: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!res.ok || !json.messages?.[0]?.id) {
    throw new Error(json.error?.message || `WhatsApp API error (HTTP ${res.status})`);
  }
  return { messageId: json.messages[0].id };
}

/** Plain text message (allowed inside the 24h window after the customer replied). */
export function buildTextPayload(to: string, body: string) {
  return { messaging_product: "whatsapp", to, type: "text", text: { body } };
}

interface IncomingMessage {
  from?: string;
  type?: string;
  button?: { payload?: string };
  interactive?: { button_reply?: { id?: string } };
}

export interface ButtonReply {
  action: typeof REPLY_CONFIRM | typeof REPLY_CANCEL;
  verificationId: string;
  from: string;
}

/**
 * Extract quick-reply button presses from a WhatsApp webhook body.
 * Template quick replies arrive as `type: "button"` with `button.payload`;
 * interactive messages arrive as `type: "interactive"` with `button_reply.id`.
 */
export function parseButtonReplies(body: unknown): ButtonReply[] {
  const replies: ButtonReply[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: { messages?: unknown[] } }[] }[]) {
    for (const change of entry.changes ?? []) {
      for (const m of (change.value?.messages ?? []) as IncomingMessage[]) {
        const payload: string | undefined =
          m.type === "button"
            ? m.button?.payload
            : m.type === "interactive"
              ? m.interactive?.button_reply?.id
              : undefined;
        if (!payload) continue;
        const [action, verificationId] = payload.split(":");
        if ((action === REPLY_CONFIRM || action === REPLY_CANCEL) && verificationId) {
          replies.push({ action, verificationId, from: String(m.from ?? "") });
        }
      }
    }
  }
  return replies;
}

/** Verify Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}
