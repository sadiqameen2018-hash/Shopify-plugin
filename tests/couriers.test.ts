import { describe, expect, it, vi } from "vitest";
import { matchCity, normalizeStatus, toLocalPhone } from "../app/lib/couriers/common";
import { leopardsClient } from "../app/lib/couriers/leopards";
import { postexClient } from "../app/lib/couriers/postex";
import type { BookingRequest } from "../app/lib/couriers/types";

const req: BookingRequest = {
  orderName: "#1001",
  codAmount: 2499.6,
  weightGrams: 500,
  pieces: 2,
  itemsDescription: "2 x Lawn Suit",
  instructions: "Call before delivery",
  customer: {
    name: "Ali Khan",
    phone: "03001234567",
    email: "ali@example.com",
    address: "House 12, Street 4, Gulberg III",
    city: "Lahore Cantt",
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("normalizeStatus", () => {
  it.each([
    ["Consignment Booked", "BOOKED"],
    ["Booked", "BOOKED"],
    ["Pickup Request Sent", "BOOKED"],
    ["Arrived at Station", "IN_TRANSIT"],
    ["Out For Delivery", "IN_TRANSIT"],
    ["PostEx WareHouse", "IN_TRANSIT"],
    ["Delivered", "DELIVERED"],
    ["Undelivered", "IN_TRANSIT"],
    ["Being Return", "RETURNING"],
    ["Out For Return", "RETURNING"],
    ["Returned to shipper", "RETURNED"],
    ["Returned", "RETURNED"],
    ["Cancelled", "CANCELLED"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeStatus(raw)).toBe(expected);
  });
});

describe("helpers", () => {
  it("converts to local phone format", () => {
    expect(toLocalPhone("923001234567")).toBe("03001234567");
  });
  it("matches cities with aliases and suffixes", () => {
    const cities = ["Lahore", "Karachi", "Rawalpindi", "Islamabad"];
    const id = (c: string) => c;
    expect(matchCity("lahore cantt", cities, id)).toBe("Lahore");
    expect(matchCity("Pindi", cities, id)).toBe("Rawalpindi");
    expect(matchCity(" KARACHI ", cities, id)).toBe("Karachi");
    expect(matchCity("Quetta", cities, id)).toBeNull();
  });
});

describe("Leopards client", () => {
  it("books a packet with the matched city id and form-encoded body", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("getAllCities")) {
        expect(u).toContain("merchantapistaging.leopardscourier.com");
        expect(u).toContain("api_key=KEY");
        return json({ status: 1, city_list: [{ id: 789, name: "Lahore" }, { id: 475, name: "Karachi" }] });
      }
      expect(u).toBe("https://merchantapistaging.leopardscourier.com/api/bookPacket/format/json/");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("api_password")).toBe("PASS");
      expect(body.get("destination_city")).toBe("789");
      expect(body.get("origin_city")).toBe("self");
      expect(body.get("booked_packet_collect_amount")).toBe("2500");
      expect(body.get("booked_packet_no_piece")).toBe("2");
      expect(body.get("consignment_phone")).toBe("03001234567");
      return json({ status: 1, track_number: "LE123456", slip_link: "https://example.com/slip.pdf" });
    });
    const c = leopardsClient({ apiKey: "KEY", apiPassword: "PASS", testMode: true, fetchImpl });
    await expect(c.book(req)).resolves.toEqual({
      trackingNumber: "LE123456",
      labelUrl: "https://example.com/slip.pdf",
      city: "Lahore",
    });
  });

  it("surfaces API errors", async () => {
    const fetchImpl = vi.fn(async () => json({ status: 0, error: "Invalid API Key" }));
    const c = leopardsClient({ apiKey: "BAD", apiPassword: "x", testMode: false, fetchImpl });
    await expect(c.book(req)).rejects.toThrow("Leopards: Invalid API Key");
  });

  it("reports an unknown city instead of booking", async () => {
    const fetchImpl = vi.fn(async () => json({ status: 1, city_list: [{ id: 1, name: "Karachi" }] }));
    const c = leopardsClient({ apiKey: "K2", apiPassword: "x", testMode: false, fetchImpl });
    await expect(c.book(req)).rejects.toThrow(/not found in the Leopards city list/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tracks several packets in one call", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("track_numbers=A1%2CB2");
      return json({
        status: 1,
        packet_list: [
          { track_number: "A1", booked_packet_status: "Delivered" },
          { track_number: "B2", booked_packet_status: "Returned to shipper" },
        ],
      });
    });
    const c = leopardsClient({ apiKey: "K", apiPassword: "P", testMode: false, fetchImpl });
    const r = await c.track(["A1", "B2"]);
    expect(r.get("A1")?.status).toBe("DELIVERED");
    expect(r.get("B2")?.status).toBe("RETURNED");
  });
});

describe("PostEx client", () => {
  it("creates an order with the token header and the PostEx city name", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      expect((init?.headers as Record<string, string>).token).toBe("TOKEN");
      if (u.includes("get-operational-city")) {
        return json({
          statusCode: "200",
          dist: [
            { operationalCityName: "Lahore", isDeliveryCity: true },
            { operationalCityName: "Karachi", isDeliveryCity: true },
          ],
        });
      }
      expect(u).toBe("https://api.postex.pk/services/integration/api/order/v3/create-order");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        orderRefNumber: "#1001",
        invoicePayment: "2500",
        customerPhone: "03001234567",
        cityName: "Lahore",
        items: 2,
        orderType: "Normal",
        pickupAddressCode: "PK001",
      });
      return json({ statusCode: "200", dist: { trackingNumber: "PX987", orderStatus: "Booked" } });
    });
    const c = postexClient({ token: "TOKEN", pickupAddressCode: "PK001", fetchImpl });
    await expect(c.book(req)).resolves.toEqual({ trackingNumber: "PX987", labelUrl: null, city: "Lahore" });
  });

  it("surfaces API errors", async () => {
    const fetchImpl = vi.fn(async () => json({ statusCode: "401", statusMessage: "Invalid token" }, 401));
    const c = postexClient({ token: "BAD", fetchImpl });
    await expect(c.book(req)).rejects.toThrow("PostEx: Invalid token");
  });

  it("tracks orders one by one and skips failures", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/PX1")) return json({ statusCode: "200", dist: { transactionStatus: "Out For Delivery" } });
      return json({ statusCode: "404", statusMessage: "Not found" }, 404);
    });
    const c = postexClient({ token: "T", fetchImpl });
    const r = await c.track(["PX1", "PX2"]);
    expect(r.get("PX1")).toEqual({ rawStatus: "Out For Delivery", status: "IN_TRANSIT" });
    expect(r.has("PX2")).toBe(false);
  });
});
