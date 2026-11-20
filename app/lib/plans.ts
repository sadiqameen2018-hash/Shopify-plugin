/** Billing plans. Names must match the keys passed to `billing` in shopify.server.ts. */
export const PLAN_STARTER = "Starter";
export const PLAN_GROWTH = "Growth";
export const PLAN_PRO = "Pro";

export type PlanName = "Free" | typeof PLAN_STARTER | typeof PLAN_GROWTH | typeof PLAN_PRO;

export interface PlanInfo {
  name: PlanName;
  price: number;
  /** COD orders verified per 30 days. null = unlimited. */
  monthlyOrders: number | null;
  features: string[];
}

export const PLANS: PlanInfo[] = [
  {
    name: "Free",
    price: 0,
    monthlyOrders: 50,
    features: ["50 COD orders / month", "WhatsApp confirmation", "Order tagging"],
  },
  {
    name: PLAN_STARTER,
    price: 9.99,
    monthlyOrders: 300,
    features: ["300 COD orders / month", "Risk score", "Automatic reminders", "Leopards & PostEx booking"],
  },
  {
    name: PLAN_GROWTH,
    price: 29.99,
    monthlyOrders: 1500,
    features: ["1,500 COD orders / month", "Auto-book on confirm", "Auto-cancel on refusal", "Own WhatsApp number"],
  },
  {
    name: PLAN_PRO,
    price: 79.99,
    monthlyOrders: null,
    features: ["Unlimited COD orders", "Everything in Growth", "Priority support"],
  },
];

export const PAID_PLAN_NAMES = [PLAN_STARTER, PLAN_GROWTH, PLAN_PRO] as const;

export function getPlan(name: string | null | undefined): PlanInfo {
  return PLANS.find((p) => p.name === name) ?? PLANS[0];
}
