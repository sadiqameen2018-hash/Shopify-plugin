export interface RiskInput {
  phone: string | null;
  totalPrice: number;
  highValueAmount: number;
  address1?: string | null;
  city?: string | null;
  /** Number of earlier orders from this customer known to Shopify. */
  customerOrdersCount?: number | null;
  /** Earlier verifications for the same phone number in the same shop. */
  history: { status: string; createdAt: Date }[];
  now?: Date;
}

export interface RiskResult {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
}

/**
 * A transparent, rule-based risk score from 0 to 100.
 * Every rule adds points and a human-readable reason that is shown to the
 * merchant, so they can see *why* an order was flagged.
 */
export function scoreRisk(input: RiskInput): RiskResult {
  const now = input.now ?? new Date();
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  if (!input.phone) {
    add(40, "Phone number missing or invalid");
  }

  const refused = input.history.filter(
    (h) => h.status === "CANCELLED" || h.status === "NO_RESPONSE",
  ).length;
  if (refused > 0) {
    add(Math.min(refused * 25, 50), `${refused} earlier order(s) cancelled or ignored on this number`);
  }

  const confirmed = input.history.filter((h) => h.status === "CONFIRMED").length;
  if (confirmed > 0 && refused === 0) {
    score -= 15;
    reasons.push(`${confirmed} earlier order(s) confirmed on this number`);
  }

  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const recent = input.history.filter((h) => h.createdAt.getTime() >= dayAgo).length;
  if (recent >= 2) {
    add(15, `${recent} orders from this number in the last 24 hours`);
  }

  if (input.highValueAmount > 0 && input.totalPrice >= input.highValueAmount) {
    add(15, "High order value");
  }

  if (!input.customerOrdersCount || input.customerOrdersCount <= 1) {
    add(10, "First-time customer");
  }

  const address = `${input.address1 ?? ""}`.trim();
  if (address.length < 10 || !input.city?.trim()) {
    add(10, "Incomplete shipping address");
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, level, reasons };
}
