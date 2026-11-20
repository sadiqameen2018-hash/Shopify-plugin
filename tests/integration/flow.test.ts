/**
 * End-to-end flow with a real (SQLite) database and fake Shopify / WhatsApp /
 * courier APIs:  orders/create → WhatsApp → button reply → tags → courier
 * booking → tracking sync, plus reminders and plan limits.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Fake Shopify Admin API -------------------------------------------------
interface Call {
  op: string;
  variables: Record<string, unknown>;
}
const shopify = {
  calls: [] as Call[],
  plan: "Free" as string,
  order: null as Record<string, unknown> | null,
  reset() {
    this.calls = [];
    this.plan = "Free";
    this.order = null;
  },
  ops(name: string) {
    return this.calls.filter((c) => c.op === name);
  },
  tagsAdded(orderId: string) {
    return this.ops("codAddTags")
      .filter((c) => c.variables.id === orderId)
      .flatMap((c) => c.variables.tags as string[]);
  },
};

const fakeAdmin = {
  graphql: vi.fn(async (query: string, opts?: { variables?: Record<string, unknown> }) => {
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "unknown";
    shopify.calls.push({ op, variables: opts?.variables ?? {} });
    const data: Record<string, unknown> = {
      codActivePlan: {
        currentAppInstallation: {
          activeSubscriptions: shopify.plan === "Free" ? [] : [{ name: shopify.plan, status: "ACTIVE" }],
        },
      },
      codShopName: { shop: { name: "Lahore Lawn House" } },
      codAddTags: { tagsAdd: { userErrors: [] } },
      codRemoveTags: { tagsRemove: { userErrors: [] } },
      codCancelOrder: { orderCancel: { orderCancelUserErrors: [] } },
      codOrderForBooking: { order: shopify.order },
      codFulfill: { fulfillmentCreate: { fulfillment: { id: "gid://shopify/Fulfillment/1" }, userErrors: [] } },
    };
    return new Response(JSON.stringify({ data: data[op] ?? {} }));
  }),
};

vi.mock("../../app/shopify.server", () => ({
  unauthenticated: { admin: async () => ({ admin: fakeAdmin }) },
}));

// ---- Fake WhatsApp + courier HTTP --------------------------------------------
const http = { requests: [] as { url: string; body: unknown }[] };
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  let body: unknown = init?.body;
  try {
    body = JSON.parse(String(init?.body));
  } catch {
    /* form or empty body */
  }
  http.requests.push({ url, body });
  const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

  if (url.includes("graph.facebook.com")) return json({ messages: [{ id: `wamid.${http.requests.length}` }] });
  if (url.includes("get-operational-city"))
    return json({ statusCode: "200", dist: [{ operationalCityName: "Lahore", isDeliveryCity: true }] });
  if (url.includes("create-order")) return json({ statusCode: "200", dist: { trackingNumber: "PX1001" } });
  if (url.includes("track-order")) return json({ statusCode: "200", dist: { transactionStatus: "Delivered" } });
  return new Response("not found", { status: 404 });
});
vi.stubGlobal("fetch", fetchMock);

process.env.WHATSAPP_PHONE_NUMBER_ID = "PHONE_ID";
process.env.WHATSAPP_ACCESS_TOKEN = "WA_TOKEN";

// Imported after mocks are registered.
const { default: db } = await import("../../app/db.server");
const { handleNewOrder, handleReply, runScheduledJobs } = await import("../../app/lib/verification.server");
const { bookOrder } = await import("../../app/lib/shipping.server");

const admin = fakeAdmin as unknown as Parameters<typeof handleNewOrder>[1];
// Loose JSON shape for asserting on captured request bodies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const SHOP = "lahore-lawn.myshopify.com";
let seq = 1000;

function codOrder(over: Record<string, unknown> = {}) {
  seq++;
  return {
    admin_graphql_api_id: `gid://shopify/Order/${seq}`,
    name: `#${seq}`,
    total_price: "2500.00",
    currency: "PKR",
    financial_status: "pending",
    payment_gateway_names: ["Cash on Delivery (COD)"],
    customer: { first_name: "Ayesha", orders_count: 1 },
    shipping_address: {
      first_name: "Ayesha",
      name: "Ayesha Khan",
      phone: "0300-1234567",
      address1: "House 5, Street 9, Model Town",
      city: "Lahore",
    },
    ...over,
  };
}

function waMessages() {
  return http.requests.filter((r) => r.url.includes("graph.facebook.com")).map((r) => r.body as Json);
}

beforeEach(async () => {
  shopify.reset();
  http.requests = [];
  await db.shipment.deleteMany();
  await db.orderVerification.deleteMany();
  await db.shopSettings.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("new COD order", () => {
  it("stores the order, tags it pending and sends the WhatsApp template", async () => {
    const order = codOrder();
    await handleNewOrder(SHOP, admin, order);

    const v = await db.orderVerification.findFirstOrThrow({ where: { orderId: order.admin_graphql_api_id } });
    expect(v.status).toBe("SENT");
    expect(v.phone).toBe("923001234567");
    expect(v.messageId).toMatch(/^wamid\./);
    expect(shopify.tagsAdded(order.admin_graphql_api_id)).toEqual(["cod-pending"]);

    const [msg] = waMessages();
    expect(msg.to).toBe("923001234567");
    expect(msg.template.name).toBe("cod_order_confirmation");
    expect(msg.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Ayesha",
      "Lahore Lawn House",
      order.name,
      "PKR 2500.00",
    ]);
    expect(msg.template.components[1].parameters[0].payload).toBe(`CONFIRM:${v.id}`);
  });

  it("ignores prepaid orders and duplicate webhook deliveries", async () => {
    await handleNewOrder(SHOP, admin, codOrder({ payment_gateway_names: ["shopify_payments"], financial_status: "paid" }));
    const order = codOrder();
    await handleNewOrder(SHOP, admin, order);
    await handleNewOrder(SHOP, admin, order);
    expect(await db.orderVerification.count()).toBe(1);
    expect(waMessages()).toHaveLength(1);
  });

  it("marks the order FAILED when there is no usable phone", async () => {
    const order = codOrder({ shipping_address: { first_name: "X", phone: "123", address1: "a", city: "Lahore" } });
    await handleNewOrder(SHOP, admin, order);
    const v = await db.orderVerification.findFirstOrThrow();
    expect(v.status).toBe("FAILED");
    expect(v.error).toMatch(/phone/i);
    expect(waMessages()).toHaveLength(0);
  });

  it("tags high-risk orders", async () => {
    const first = codOrder();
    await handleNewOrder(SHOP, admin, first);
    await db.orderVerification.updateMany({ data: { status: "CANCELLED" } });
    await db.orderVerification.create({
      data: { shop: SHOP, orderId: "gid://shopify/Order/old", orderName: "#old", phone: "923001234567", totalPrice: 1, currency: "PKR", status: "NO_RESPONSE" },
    });
    const second = codOrder({ total_price: "15000.00" });
    await handleNewOrder(SHOP, admin, second);
    const v = await db.orderVerification.findFirstOrThrow({ where: { orderId: second.admin_graphql_api_id } });
    expect(v.riskScore).toBeGreaterThanOrEqual(60);
    expect(shopify.tagsAdded(second.admin_graphql_api_id)).toEqual(["cod-pending", "cod-high-risk"]);
  });

  it("skips orders over the Free plan limit", async () => {
    await db.orderVerification.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        shop: SHOP, orderId: `gid://shopify/Order/f${i}`, orderName: `#f${i}`, totalPrice: 1, currency: "PKR", status: "CONFIRMED",
      })),
    });
    const order = codOrder();
    await handleNewOrder(SHOP, admin, order);
    const v = await db.orderVerification.findFirstOrThrow({ where: { orderId: order.admin_graphql_api_id } });
    expect(v.status).toBe("SKIPPED");
    expect(waMessages()).toHaveLength(0);
  });

  it("does not count another shop's history in the risk score", async () => {
    await db.orderVerification.create({
      data: { shop: "other.myshopify.com", orderId: "gid://shopify/Order/x", orderName: "#x", phone: "923001234567", totalPrice: 1, currency: "PKR", status: "CANCELLED" },
    });
    const order = codOrder({ customer: { first_name: "Ayesha", orders_count: 5 } });
    await handleNewOrder(SHOP, admin, order);
    const v = await db.orderVerification.findFirstOrThrow({ where: { shop: SHOP } });
    expect(v.riskScore).toBe(0);
  });
});

describe("customer reply", () => {
  async function sentOrder() {
    const order = codOrder();
    await handleNewOrder(SHOP, admin, order);
    const v = await db.orderVerification.findFirstOrThrow({ where: { orderId: order.admin_graphql_api_id } });
    shopify.calls = [];
    http.requests = [];
    return v;
  }

  it("confirm → tags confirmed and thanks the customer", async () => {
    const v = await sentOrder();
    await handleReply({ action: "CONFIRM", verificationId: v.id, from: "923001234567" });
    expect((await db.orderVerification.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("CONFIRMED");
    expect(shopify.ops("codRemoveTags")[0].variables.tags).toContain("cod-pending");
    expect(shopify.tagsAdded(v.orderId)).toEqual(["cod-confirmed"]);
    expect(waMessages()[0].text.body).toContain("confirm");
    // Second tap is ignored
    await handleReply({ action: "CANCEL", verificationId: v.id, from: "923001234567" });
    expect((await db.orderVerification.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("CONFIRMED");
  });

  it("ignores replies from a different number", async () => {
    const v = await sentOrder();
    await handleReply({ action: "CANCEL", verificationId: v.id, from: "923339999999" });
    expect((await db.orderVerification.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("SENT");
  });

  it("cancel with auto-cancel on Growth cancels the Shopify order", async () => {
    const v = await sentOrder();
    shopify.plan = "Growth";
    await db.shopSettings.update({ where: { shop: SHOP }, data: { autoCancel: true } });
    await handleReply({ action: "CANCEL", verificationId: v.id, from: "923001234567" });
    expect(shopify.tagsAdded(v.orderId)).toEqual(["cod-cancelled"]);
    expect(shopify.ops("codCancelOrder")).toHaveLength(1);
  });

  it("auto-cancel is not used on the Free plan", async () => {
    const v = await sentOrder();
    await db.shopSettings.update({ where: { shop: SHOP }, data: { autoCancel: true } });
    await handleReply({ action: "CANCEL", verificationId: v.id, from: "923001234567" });
    expect(shopify.ops("codCancelOrder")).toHaveLength(0);
  });

  it("confirm with auto-book on Growth books the parcel with PostEx", async () => {
    const v = await sentOrder();
    shopify.plan = "Growth";
    shopify.order = bookingOrder(v.orderId, v.orderName);
    await db.shopSettings.update({
      where: { shop: SHOP },
      data: { autoBookOnConfirm: true, courierProvider: "postex", postexToken: "PX_TOKEN" },
    });
    await handleReply({ action: "CONFIRM", verificationId: v.id, from: "923001234567" });
    const s = await db.shipment.findFirstOrThrow({ where: { orderId: v.orderId } });
    expect(s).toMatchObject({ status: "BOOKED", trackingNumber: "PX1001", provider: "postex", city: "Lahore" });
    expect(shopify.tagsAdded(v.orderId)).toContain("courier-booked");
  });
});

function bookingOrder(id: string, name: string) {
  return {
    id,
    name,
    email: "ayesha@example.com",
    phone: null,
    cancelledAt: null,
    totalOutstandingSet: { shopMoney: { amount: "2500.0" } },
    shippingAddress: {
      name: "Ayesha Khan",
      address1: "House 5, Street 9, Model Town",
      address2: null,
      city: "lahore",
      province: "Punjab",
      phone: "+92 300 1234567",
    },
    lineItems: { nodes: [{ title: "Lawn Suit", quantity: 2 }] },
    fulfillmentOrders: { nodes: [{ id: "gid://shopify/FulfillmentOrder/1", status: "OPEN" }] },
  };
}

describe("courier booking", () => {
  beforeEach(async () => {
    await db.shopSettings.create({
      data: { shop: SHOP, courierProvider: "postex", postexToken: "PX_TOKEN", fulfillOnBooking: true },
    });
  });

  it("books, fulfils with tracking, and is idempotent", async () => {
    shopify.order = bookingOrder("gid://shopify/Order/77", "#77");
    const s = await bookOrder(SHOP, admin, "gid://shopify/Order/77");
    expect(s.status).toBe("BOOKED");
    expect(s.error).toBeNull();

    const create = http.requests.find((r) => r.url.includes("create-order"))!.body as Record<string, unknown>;
    expect(create).toMatchObject({ orderRefNumber: "#77", invoicePayment: "2500", customerPhone: "03001234567", items: 2 });

    const fulfil = shopify.ops("codFulfill")[0].variables.fulfillment as Json;
    expect(fulfil.trackingInfo).toEqual({ company: "PostEx", number: "PX1001" });

    await bookOrder(SHOP, admin, "gid://shopify/Order/77");
    expect(http.requests.filter((r) => r.url.includes("create-order"))).toHaveLength(1);
  });

  it("records a failure for an order without an address and can retry", async () => {
    shopify.order = { ...bookingOrder("gid://shopify/Order/78", "#78"), shippingAddress: null };
    const failed = await bookOrder(SHOP, admin, "gid://shopify/Order/78");
    expect(failed.status).toBe("FAILED");

    shopify.order = bookingOrder("gid://shopify/Order/78", "#78");
    const ok = await bookOrder(SHOP, admin, "gid://shopify/Order/78");
    expect(ok.status).toBe("BOOKED");
    expect(await db.shipment.count()).toBe(1);
  });

  it("refuses to book a cancelled order", async () => {
    shopify.order = { ...bookingOrder("gid://shopify/Order/79", "#79"), cancelledAt: "2026-11-20T00:00:00Z" };
    await expect(bookOrder(SHOP, admin, "gid://shopify/Order/79")).rejects.toThrow(/cancelled/);
  });
});

describe("scheduled job", () => {
  it("sends one reminder, then expires, and syncs courier status", async () => {
    const order = codOrder();
    await handleNewOrder(SHOP, admin, order);
    const v = await db.orderVerification.findFirstOrThrow();
    const sentAt = v.sentAt!;
    const hours = (h: number) => new Date(sentAt.getTime() + h * 3600_000);

    http.requests = [];
    await runScheduledJobs(hours(3));
    expect(waMessages()).toHaveLength(0);

    const r1 = await runScheduledJobs(hours(7));
    expect(r1.reminders).toBe(1);
    expect(waMessages()).toHaveLength(1);
    const afterReminder = await db.orderVerification.findUniqueOrThrow({ where: { id: v.id } });
    expect(afterReminder.reminderSent).toBe(true);
    expect(afterReminder.sentAt!.getTime()).toBe(sentAt.getTime());

    const r2 = await runScheduledJobs(hours(8));
    expect(r2.reminders).toBe(0);

    const r3 = await runScheduledJobs(hours(25));
    expect(r3.expired).toBe(1);
    expect((await db.orderVerification.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("NO_RESPONSE");
    expect(shopify.tagsAdded(v.orderId)).toContain("cod-no-response");
  });

  it("updates delivered parcels and tags the order", async () => {
    await db.shopSettings.create({ data: { shop: SHOP, courierProvider: "postex", postexToken: "PX_TOKEN" } });
    await db.shipment.create({
      data: { shop: SHOP, orderId: "gid://shopify/Order/90", orderName: "#90", provider: "postex", trackingNumber: "PX90", status: "BOOKED", codAmount: 1000 },
    });
    const r = await runScheduledJobs();
    expect(r.shipmentsUpdated).toBe(1);
    const s = await db.shipment.findFirstOrThrow();
    expect(s).toMatchObject({ status: "DELIVERED", rawStatus: "Delivered" });
    expect(shopify.tagsAdded("gid://shopify/Order/90")).toEqual(["courier-delivered"]);
  });
});
