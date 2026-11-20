import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { handleReply } from "../lib/verification.server";
import { parseButtonReplies, verifySignature } from "../lib/whatsapp.server";

/**
 * WhatsApp Cloud API webhook: /whatsapp/webhook
 * GET  = Meta's one-time verification handshake.
 * POST = incoming messages (customer button replies).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  for (const reply of parseButtonReplies(body)) {
    try {
      await handleReply(reply);
    } catch (e) {
      console.error("WhatsApp reply handling failed", e);
    }
  }
  // Always 200 so Meta does not retry.
  return new Response("OK");
};
