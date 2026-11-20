import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleNewOrder, type OrderPayload } from "../lib/verification.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);

  // No admin context means the app was uninstalled; nothing to do.
  if (!admin) return new Response();

  try {
    await handleNewOrder(shop, admin, payload as OrderPayload);
  } catch (e) {
    // Log and return 200 so Shopify does not retry and send duplicate messages.
    console.error(`orders/create failed for ${shop}`, e);
  }
  return new Response();
};
