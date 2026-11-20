import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { PAID_PLAN_NAMES, type PlanName } from "./plans";

type Admin = Pick<AdminApiContext, "graphql">;

async function run<T = unknown>(admin: Admin, query: string, variables?: Record<string, unknown>) {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

export async function addTags(admin: Admin, orderId: string, tags: string[]) {
  const t = tags.filter(Boolean);
  if (!t.length) return;
  await run(
    admin,
    `#graphql
    mutation codAddTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
    }`,
    { id: orderId, tags: t },
  );
}

export async function removeTags(admin: Admin, orderId: string, tags: string[]) {
  const t = tags.filter(Boolean);
  if (!t.length) return;
  await run(
    admin,
    `#graphql
    mutation codRemoveTags($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) { userErrors { field message } }
    }`,
    { id: orderId, tags: t },
  );
}

/** Replace the pending tag with a final status tag. */
export async function setStatusTag(admin: Admin, orderId: string, remove: string[], add: string) {
  await removeTags(admin, orderId, remove);
  await addTags(admin, orderId, [add]);
}

/**
 * Cancel an unpaid COD order (no refund needed, items restocked).
 * Only used when the merchant turns on "auto-cancel".
 */
export async function cancelOrder(admin: Admin, orderId: string) {
  const data = await run<{
    orderCancel?: { orderCancelUserErrors: { message: string }[] };
  }>(
    admin,
    `#graphql
    mutation codCancelOrder($orderId: ID!) {
      orderCancel(
        orderId: $orderId
        reason: CUSTOMER
        restock: true
        notifyCustomer: false
        refundMethod: { originalPaymentMethodsRefund: false }
        staffNote: "Cancelled by customer via WhatsApp (COD Confirm)"
      ) {
        orderCancelUserErrors { field message code }
      }
    }`,
    { orderId },
  );
  const errors = data?.orderCancel?.orderCancelUserErrors ?? [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
}

/** The shop's active paid plan, or "Free". */
export async function getActivePlan(admin: Admin): Promise<PlanName> {
  const data = await run<{
    currentAppInstallation?: { activeSubscriptions: { name: string; status: string }[] };
  }>(
    admin,
    `#graphql
    query codActivePlan {
      currentAppInstallation { activeSubscriptions { name status } }
    }`,
  );
  const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
  const active = subs.find(
    (s) => s.status === "ACTIVE" && (PAID_PLAN_NAMES as readonly string[]).includes(s.name),
  );
  return (active?.name as PlanName) ?? "Free";
}
