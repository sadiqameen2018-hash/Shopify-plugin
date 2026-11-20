import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { normalizePhone } from "../lib/phone";
import { getSettings } from "../lib/settings.server";

/** GDPR: delete stored data for a customer. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const orderIds: string[] = (payload.orders_to_redact ?? []).map(
    (id: number) => `gid://shopify/Order/${id}`,
  );
  const settings = await getSettings(shop);
  const phone = normalizePhone(payload.customer?.phone, settings.defaultCountryCode);

  await db.orderVerification.deleteMany({
    where: {
      shop,
      OR: [{ orderId: { in: orderIds } }, ...(phone ? [{ phone }] : [])],
    },
  });
  await db.shipment.deleteMany({
    where: {
      shop,
      OR: [{ orderId: { in: orderIds } }, ...(phone ? [{ phone }] : [])],
    },
  });
  return new Response();
};
