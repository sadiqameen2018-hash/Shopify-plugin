import { describe, expect, it } from "vitest";
import { scoreRisk } from "../app/lib/risk";

const now = new Date("2026-11-20T12:00:00Z");
const good = {
  phone: "923001234567",
  totalPrice: 2500,
  highValueAmount: 10000,
  address1: "House 12, Street 4, Gulberg III",
  city: "Lahore",
  customerOrdersCount: 3,
  history: [],
  now,
};

describe("scoreRisk", () => {
  it("scores a normal repeat customer as low risk", () => {
    const r = scoreRisk(good);
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
  });

  it("flags missing phone and incomplete address", () => {
    const r = scoreRisk({ ...good, phone: null, address1: "abc", city: "" });
    expect(r.score).toBe(50);
    expect(r.level).toBe("medium");
    expect(r.reasons).toContain("Phone number missing or invalid");
  });

  it("flags numbers that refused earlier orders as high risk", () => {
    const old = new Date("2026-10-01T00:00:00Z");
    const r = scoreRisk({
      ...good,
      customerOrdersCount: 1,
      totalPrice: 15000,
      history: [
        { status: "CANCELLED", createdAt: old },
        { status: "NO_RESPONSE", createdAt: old },
      ],
    });
    expect(r.score).toBe(75);
    expect(r.level).toBe("high");
  });

  it("lowers the score for numbers with confirmed history", () => {
    const r = scoreRisk({
      ...good,
      customerOrdersCount: 1,
      history: [{ status: "CONFIRMED", createdAt: new Date("2026-09-01") }],
    });
    expect(r.score).toBe(0);
  });

  it("never goes outside 0..100", () => {
    const old = new Date("2026-11-20T10:00:00Z");
    const r = scoreRisk({
      ...good,
      phone: null,
      totalPrice: 99999,
      address1: "",
      customerOrdersCount: 0,
      history: Array.from({ length: 5 }, () => ({ status: "CANCELLED", createdAt: old })),
    });
    expect(r.score).toBe(100);
  });
});
