import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { courierFor, CourierError, FINAL_STATUSES, type ShipmentStatus } from "./couriers/index.server";
import { toLocalPhone } from "./couriers/common";
import { normalizePhone } from "./phone";
import { getSettings } from "./settings.server";
import { addTags } from "./shopify-orders.server";

type Admin = Pick<AdminApiContext, "graphql">;

export const TAG_BOOKED = "courier-booked";
export const TAG_DELIVERED = "courier-delivered";
export const TAG_RETURNED = "courier-returned";

interface OrderForBooking {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cancelledAt: string | null;
  totalOutstandingSet: { shopMoney: { amount: string } };
  shippingAddress: {
    name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    phone: string | null;
  } | null;
  lineItems: { nodes: { title: string; quantity: number }[] };
  fulfillmentOrders: { nodes: { id: string; status: string }[] };
}

async function fetchOrder(admin: Admin, orderId: string): Promise<OrderForBooking | null> {
  const res = await admin.graphql(
    `#graphql
    query codOrderForBooking($id: ID!) {
      order(id: $id) {
        id
        name
        email
        phone
        cancelledAt
        totalOutstandingSet { shopMoney { amount } }
        shippingAddress { name address1 address2 city province phone }
        lineItems(first: 50) { nodes { title quantity } }
        fulfillmentOrders(first: 10) { nodes { id status } }
      }
    }`,
    { variables: { id: orderId } },
  );
  const json = (await res.json()) as { data?: { order?: OrderForBooking | null } };
  return json.data?.order ?? null;
}

async function fulfillWithTracking(
  admin: Admin,
  order: OrderForBooking,
  company: string,
  trackingNumber: string,
) {
  const open = order.fulfillmentOrders.nodes.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS");
  if (!open.length) return;
  const res = await admin.graphql(
    `#graphql
    mutation codFulfill($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        fulfillment: {
          lineItemsByFulfillmentOrder: open.map((f) => ({ fulfillmentOrderId: f.id })),
          trackingInfo: { company, number: trackingNumber },
          notifyCustomer: true,
        },
      },
    },
  );
  const json = (await res.json()) as {
    data?: { fulfillmentCreate?: { userErrors: { message: string }[] } };
    errors?: unknown;
  };
  const errs = json.data?.fulfillmentCreate?.userErrors ?? [];
  if (json.errors || errs.length) {
    throw new Error(errs.map((e) => e.message).join("; ") || JSON.stringify(json.errors));
  }
}

/**
 * Book one Shopify order with the shop's courier. Safe to call twice:
 * an order that is already booked returns the existing shipment.
 */
export async function bookOrder(shop: string, admin: Admin, orderId: string) {
  const settings = await getSettings(shop);
  const courier = courierFor(settings);
  if (!courier) throw new CourierError("Courier is not set up. Add your courier account on the Settings page.");

  const existing = await db.shipment.findUnique({ where: { shop_orderId: { shop, orderId } } });
  if (existing && existing.status !== "FAILED") return existing;

  const order = await fetchOrder(admin, orderId);
  if (!order) throw new CourierError("Order not found in Shopify");
  if (order.cancelledAt) throw new CourierError(`Order ${order.name} is cancelled`);

  const addr = order.shippingAddress;
  const phone = normalizePhone(addr?.phone || order.phone, settings.defaultCountryCode);
  const codAmount = Number(order.totalOutstandingSet.shopMoney.amount) || 0;
  const items = order.lineItems.nodes;

  const base = {
    orderName: order.name,
    phone,
    provider: courier.id,
    codAmount,
    city: addr?.city ?? null,
    status: "BOOKING",
    error: null,
    trackingNumber: null,
    labelUrl: null,
    rawStatus: null,
  };
  const shipment = await db.shipment.upsert({
    where: { shop_orderId: { shop, orderId } },
    create: { shop, orderId, ...base },
    update: base,
  });

  const fail = (error: string) =>
    db.shipment.update({ where: { id: shipment.id }, data: { status: "FAILED", error } });

  if (!addr?.address1 || !addr.city) return fail("Order has no shipping address or city");
  if (!phone) return fail("Order has no valid phone number");

  try {
    const result = await courier.book({
      orderName: order.name,
      codAmount,
      weightGrams: settings.defaultWeightGrams,
      pieces: Math.max(1, items.reduce((n, i) => n + i.quantity, 0)),
      itemsDescription: items.map((i) => `${i.quantity} x ${i.title}`).join(", "),
      instructions: settings.specialInstructions,
      customer: {
        name: addr.name || "Customer",
        phone: toLocalPhone(phone, settings.defaultCountryCode),
        email: order.email || "",
        address: [addr.address1, addr.address2, addr.province].filter(Boolean).join(", "),
        city: addr.city,
      },
    });

    let error: string | null = null;
    await addTags(admin, orderId, [TAG_BOOKED]).catch(() => undefined);
    if (settings.fulfillOnBooking) {
      try {
        await fulfillWithTracking(admin, order, courier.displayName, result.trackingNumber);
      } catch (e) {
        error = `Booked, but marking the order fulfilled failed: ${e instanceof Error ? e.message : e}`;
      }
    }

    return db.shipment.update({
      where: { id: shipment.id },
      data: {
        status: "BOOKED",
        trackingNumber: result.trackingNumber,
        labelUrl: result.labelUrl,
        city: result.city,
        error,
        lastCheckedAt: new Date(),
      },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** Refresh courier status for open shipments. Called from the scheduled job. */
export async function syncShipments(opts: { shop?: string; minAgeMinutes?: number } = {}) {
  const result = { checked: 0, updated: 0, errors: 0 };
  const staleBefore = new Date(Date.now() - (opts.minAgeMinutes ?? 120) * 60 * 1000);

  const open = await db.shipment.findMany({
    where: {
      ...(opts.shop ? { shop: opts.shop } : {}),
      status: { notIn: [...FINAL_STATUSES, "BOOKING"] },
      trackingNumber: { not: null },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: staleBefore } }],
    },
    orderBy: { lastCheckedAt: "asc" },
    take: 500,
  });

  const groups = new Map<string, typeof open>();
  for (const s of open) {
    const k = `${s.shop}|${s.provider}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  for (const [key, list] of groups) {
    const [shop, provider] = key.split("|");
    try {
      const settings = await getSettings(shop);
      const courier = courierFor(settings, provider);
      if (!courier) continue;
      let admin: Admin | null = null;

      for (let i = 0; i < list.length; i += 50) {
        const batch = list.slice(i, i + 50);
        const statuses = await courier.track(batch.map((s) => s.trackingNumber!));
        for (const s of batch) {
          result.checked++;
          const t = statuses.get(s.trackingNumber!);
          const data: { lastCheckedAt: Date; status?: ShipmentStatus; rawStatus?: string } = {
            lastCheckedAt: new Date(),
          };
          if (t && (t.status !== s.status || t.rawStatus !== s.rawStatus)) {
            data.status = t.status;
            data.rawStatus = t.rawStatus;
            result.updated++;
            if (t.status === "DELIVERED" || t.status === "RETURNED") {
              admin ??= (await unauthenticated.admin(shop)).admin;
              await addTags(admin, s.orderId, [t.status === "DELIVERED" ? TAG_DELIVERED : TAG_RETURNED]).catch(
                () => result.errors++,
              );
            }
          }
          await db.shipment.update({ where: { id: s.id }, data });
        }
      }
    } catch (e) {
      console.error(`Shipment sync failed for ${key}`, e);
      result.errors++;
    }
  }
  return result;
}
