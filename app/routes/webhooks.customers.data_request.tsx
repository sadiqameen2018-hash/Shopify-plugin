import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * GDPR: a customer asked the merchant for their data. We log what we store
 * (order name, phone, status) so the app owner can send it to the merchant.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const orderIds: string[] = (payload.orders_requested ?? []).map(
    (id: number) => `gid://shopify/Order/${id}`,
  );
  const rows = await db.orderVerification.findMany({
    where: { shop, orderId: { in: orderIds } },
    select: { orderName: true, phone: true, status: true, createdAt: true },
  });
  console.log(`customers/data_request for ${shop}`, JSON.stringify(rows));
  return new Response();
};
