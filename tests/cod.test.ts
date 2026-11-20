import { describe, expect, it } from "vitest";
import { isCodOrder } from "../app/lib/cod";

describe("isCodOrder", () => {
  it("detects Shopify's default COD method", () => {
    expect(isCodOrder({ payment_gateway_names: ["Cash on Delivery (COD)"], financial_status: "pending" })).toBe(true);
  });
  it("detects renamed COD methods", () => {
    expect(isCodOrder({ payment_gateway_names: ["COD - Pay at door"] })).toBe(true);
  });
  it("ignores paid card orders", () => {
    expect(isCodOrder({ payment_gateway_names: ["shopify_payments"], financial_status: "paid" })).toBe(false);
  });
  it("ignores words that only contain 'cod'", () => {
    expect(isCodOrder({ payment_gateway_names: ["Barcode Pay"] })).toBe(false);
  });
});
