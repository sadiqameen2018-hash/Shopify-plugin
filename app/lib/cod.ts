const COD_PATTERNS = [/cash on delivery/i, /\bcod\b/i, /cash_on_delivery/i];

/**
 * Decide whether an order (webhook payload) was placed with Cash on Delivery.
 * Shopify's built-in manual method is called "Cash on Delivery (COD)", but
 * merchants often rename it, so we match loosely.
 */
export function isCodOrder(order: {
  payment_gateway_names?: string[] | null;
  gateway?: string | null;
  financial_status?: string | null;
}): boolean {
  const names = [...(order.payment_gateway_names ?? []), order.gateway ?? ""];
  const matches = names.some((n) => COD_PATTERNS.some((re) => re.test(n)));
  if (!matches) return false;
  // A COD order is unpaid when it is created.
  return order.financial_status == null || order.financial_status === "pending";
}
