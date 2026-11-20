import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { isCodOrder } from "./cod";
import { normalizePhone } from "./phone";
import { getPlan, PLAN_GROWTH, PLAN_PRO } from "./plans";
import { bookOrder, syncShipments } from "./shipping.server";
import { scoreRisk } from "./risk";
import { getSettings, type Settings } from "./settings.server";
import {
  addTags,
  cancelOrder,
  getActivePlan,
  setStatusTag,
} from "./shopify-orders.server";
import {
  buildConfirmationPayload,
  buildTextPayload,
  REPLY_CONFIRM,
  resolveCredentials,
  sendWhatsApp,
  type ButtonReply,
} from "./whatsapp.server";

type Admin = Pick<AdminApiContext, "graphql">;

/** Subset of the `orders/create` webhook payload that we use. */
export interface OrderPayload {
  admin_graphql_api_id: string;
  name: string;
  total_price: string;
  currency: string;
  financial_status?: string | null;
  gateway?: string | null;
  payment_gateway_names?: string[];
  phone?: string | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    orders_count?: number | null;
  } | null;
  shipping_address?: {
    first_name?: string | null;
    name?: string | null;
    phone?: string | null;
    address1?: string | null;
    city?: string | null;
  } | null;
  billing_address?: { phone?: string | null } | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function monthlyUsage(shop: string) {
  return db.orderVerification.count({
    where: {
      shop,
      status: { not: "SKIPPED" },
      createdAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) },
    },
  });
}

async function getShopName(admin: Admin, fallback: string) {
  try {
    const res = await admin.graphql(`#graphql
      query codShopName { shop { name } }`);
    const json = (await res.json()) as { data?: { shop?: { name?: string } } };
    return json.data?.shop?.name || fallback;
  } catch {
    return fallback;
  }
}

/** Called from the `orders/create` webhook. */
export async function handleNewOrder(shop: string, admin: Admin, order: OrderPayload) {
  const settings = await getSettings(shop);
  if (!settings.enabled || !isCodOrder(order)) return;

  const orderId = order.admin_graphql_api_id;
  // Webhooks can be delivered more than once.
  const existing = await db.orderVerification.findUnique({
    where: { shop_orderId: { shop, orderId } },
  });
  if (existing) return;

  const rawPhone =
    order.shipping_address?.phone ||
    order.phone ||
    order.billing_address?.phone ||
    order.customer?.phone;
  const phone = normalizePhone(rawPhone, settings.defaultCountryCode);
  const customerName =
    order.shipping_address?.first_name ||
    order.customer?.first_name ||
    order.shipping_address?.name ||
    null;
  const totalPrice = Number(order.total_price) || 0;

  const base = {
    shop,
    orderId,
    orderName: order.name,
    customerName,
    phone,
    totalPrice,
    currency: order.currency,
  };

  // Plan limit check.
  const plan = getPlan(await getActivePlan(admin));
  if (plan.monthlyOrders !== null && (await monthlyUsage(shop)) >= plan.monthlyOrders) {
    await db.orderVerification.create({
      data: { ...base, status: "SKIPPED", error: `Monthly limit of ${plan.name} plan reached` },
    });
    return;
  }

  const history = phone
    ? await db.orderVerification.findMany({
        where: { shop, phone, NOT: { orderId } },
        select: { status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  const returnedParcels = phone
    ? await db.shipment.count({ where: { shop, phone, status: "RETURNED" } })
    : 0;

  const risk = scoreRisk({
    returnedParcels,
    phone,
    totalPrice,
    highValueAmount: settings.highValueAmount,
    address1: order.shipping_address?.address1,
    city: order.shipping_address?.city,
    customerOrdersCount: order.customer?.orders_count,
    history,
  });

  const record = await db.orderVerification.create({
    data: { ...base, riskScore: risk.score, riskReasons: JSON.stringify(risk.reasons) },
  });

  const tags = [settings.tagPending];
  if (risk.score >= settings.highRiskThreshold) tags.push(settings.tagHighRisk);
  await addTags(admin, orderId, tags);

  await sendConfirmation(admin, settings, record);
}

async function sendConfirmation(
  admin: Admin,
  settings: Settings,
  record: { id: string; phone: string | null; customerName: string | null; orderName: string; totalPrice: number; currency: string; shop: string },
) {
  const fail = (error: string) =>
    db.orderVerification.update({ where: { id: record.id }, data: { status: "FAILED", error } });

  if (!record.phone) return fail("No valid phone number on the order");
  const creds = resolveCredentials(settings);
  if (!creds) return fail("WhatsApp is not configured");

  const shopName = await getShopName(admin, record.shop.replace(".myshopify.com", ""));
  const payload = buildConfirmationPayload({
    to: record.phone,
    templateName: settings.templateName,
    languageCode: settings.templateLanguage,
    verificationId: record.id,
    bodyParams: [
      record.customerName || "Customer",
      shopName,
      record.orderName,
      `${record.currency} ${record.totalPrice.toFixed(2)}`,
    ],
  });

  try {
    const { messageId } = await sendWhatsApp(creds, payload);
    await db.orderVerification.update({
      where: { id: record.id },
      data: { status: "SENT", messageId, sentAt: new Date(), error: null },
    });
  } catch (e) {
    await fail(e instanceof Error ? e.message : String(e));
  }
}

/** Called from the WhatsApp webhook when a customer taps a button. */
export async function handleReply(reply: ButtonReply) {
  const record = await db.orderVerification.findUnique({ where: { id: reply.verificationId } });
  if (!record) return;
  // Ignore replies from a different number than the one we messaged.
  if (record.phone && reply.from && record.phone !== reply.from) return;
  // Already answered (customer tapped twice) — keep the first answer.
  if (record.status === "CONFIRMED" || record.status === "CANCELLED") return;

  const { admin } = await unauthenticated.admin(record.shop);
  await applyAnswer(admin, record, reply.action === REPLY_CONFIRM, { thankCustomer: true });
}

type VerificationRecord = NonNullable<Awaited<ReturnType<typeof db.orderVerification.findUnique>>>;

/**
 * Save the answer and act on it in Shopify: swap tags, then auto-book
 * (confirmed) or auto-cancel (cancelled) when the shop's plan and settings allow.
 */
async function applyAnswer(
  admin: Admin,
  record: VerificationRecord,
  confirmed: boolean,
  opts: { thankCustomer: boolean },
) {
  await db.orderVerification.update({
    where: { id: record.id },
    data: { status: confirmed ? "CONFIRMED" : "CANCELLED", respondedAt: new Date(), error: null },
  });

  const settings = await getSettings(record.shop);
  const others = [settings.tagPending, settings.tagNoResponse, settings.tagConfirmed, settings.tagCancelled];

  if (confirmed) {
    await setStatusTag(admin, record.orderId, others.filter((t) => t !== settings.tagConfirmed), settings.tagConfirmed);
    if (settings.autoBookOnConfirm && settings.courierProvider !== "none") {
      const plan = await getActivePlan(admin);
      if (plan === PLAN_GROWTH || plan === PLAN_PRO) {
        await bookOrder(record.shop, admin, record.orderId).catch((e) =>
          console.error(`Auto-booking failed for ${record.orderName}`, e),
        );
      }
    }
  } else {
    await setStatusTag(admin, record.orderId, others.filter((t) => t !== settings.tagCancelled), settings.tagCancelled);
    if (settings.autoCancel) {
      const plan = await getActivePlan(admin);
      if (plan === PLAN_GROWTH || plan === PLAN_PRO) {
        try {
          await cancelOrder(admin, record.orderId);
        } catch (e) {
          await db.orderVerification.update({
            where: { id: record.id },
            data: { error: `Auto-cancel failed: ${e instanceof Error ? e.message : e}` },
          });
        }
      }
    }
  }

  // Free-text WhatsApp messages are only allowed within 24h of the customer's
  // own message, so we only thank customers who just tapped a button.
  const creds = resolveCredentials(settings);
  if (opts.thankCustomer && creds && record.phone) {
    const text = confirmed
      ? `Shukriya! Aap ka order ${record.orderName} confirm ho gaya hai. Thank you, your order is confirmed.`
      : `Aap ka order ${record.orderName} cancel kar diya gaya hai. Your order has been cancelled.`;
    await sendWhatsApp(creds, buildTextPayload(record.phone, text)).catch(() => undefined);
  }
}

/** Merchant marked the order confirmed/cancelled by hand (e.g. after a phone call). */
export async function setAnswerManually(shop: string, admin: Admin, id: string, confirmed: boolean) {
  const record = await db.orderVerification.findFirst({ where: { id, shop } });
  if (!record) throw new Error("Order not found");
  if (record.status === (confirmed ? "CONFIRMED" : "CANCELLED")) return;
  await applyAnswer(admin, record, confirmed, { thankCustomer: false });
}

/** Send the confirmation message again (failed, unanswered or expired orders). */
export async function resendConfirmation(shop: string, admin: Admin, id: string) {
  const record = await db.orderVerification.findFirst({ where: { id, shop } });
  if (!record) throw new Error("Order not found");
  if (!["SENT", "FAILED", "NO_RESPONSE", "PENDING"].includes(record.status)) {
    throw new Error("This order has already been answered");
  }
  const settings = await getSettings(shop);
  if (record.status === "NO_RESPONSE") {
    await setStatusTag(admin, record.orderId, [settings.tagNoResponse], settings.tagPending);
  }
  await db.orderVerification.update({
    where: { id: record.id },
    data: { status: "PENDING", reminderSent: false, error: null },
  });
  await sendConfirmation(admin, settings, record);
  return db.orderVerification.findUniqueOrThrow({ where: { id: record.id } });
}

/**
 * Periodic job (call every 15–60 minutes via /jobs/run):
 *  - send one reminder to customers who have not answered yet
 *  - mark orders as "no response" after the expiry window
 *  - refresh courier tracking status
 */
export async function runScheduledJobs(now = new Date()) {
  const result = { reminders: 0, expired: 0, errors: 0, shipmentsChecked: 0, shipmentsUpdated: 0 };
  const allSettings = await db.shopSettings.findMany({ where: { enabled: true } });

  for (const settings of allSettings) {
    const hours = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
    try {
      const expired = await db.orderVerification.findMany({
        where: { shop: settings.shop, status: "SENT", sentAt: { lte: hours(settings.expireAfterHours) } },
        take: 200,
      });
      const toRemind = await db.orderVerification.findMany({
        where: {
          shop: settings.shop,
          status: "SENT",
          reminderSent: false,
          sentAt: { lte: hours(settings.reminderAfterHours), gt: hours(settings.expireAfterHours) },
        },
        take: 200,
      });
      if (!expired.length && !toRemind.length) continue;

      const { admin } = await unauthenticated.admin(settings.shop);

      for (const r of expired) {
        await db.orderVerification.update({ where: { id: r.id }, data: { status: "NO_RESPONSE" } });
        await setStatusTag(admin, r.orderId, [settings.tagPending], settings.tagNoResponse).catch(
          () => result.errors++,
        );
        result.expired++;
      }

      for (const r of toRemind) {
        await db.orderVerification.update({ where: { id: r.id }, data: { reminderSent: true } });
        const keepSentAt = r.sentAt;
        await sendConfirmation(admin, settings, r);
        // Keep the original send time so expiry is measured from the first message.
        await db.orderVerification.updateMany({
          where: { id: r.id, status: "SENT" },
          data: { sentAt: keepSentAt },
        });
        result.reminders++;
      }
    } catch (e) {
      console.error(`Scheduled job failed for ${settings.shop}`, e);
      result.errors++;
    }
  }

  const ship = await syncShipments();
  result.shipmentsChecked = ship.checked;
  result.shipmentsUpdated = ship.updated;
  result.errors += ship.errors;
  return result;
}
