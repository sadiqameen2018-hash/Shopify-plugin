import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../lib/settings.server";
import { getActivePlan } from "../lib/shopify-orders.server";
import { courierFor } from "../lib/couriers/index.server";
import { COURIERS } from "../lib/couriers/list";
import { bookOrder, syncShipments } from "../lib/shipping.server";

type Tone = "neutral" | "info" | "success" | "warning" | "critical";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  BOOKING: { label: "Booking…", tone: "neutral" },
  BOOKED: { label: "Booked", tone: "info" },
  IN_TRANSIT: { label: "In transit", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "success" },
  RETURNING: { label: "Returning", tone: "warning" },
  RETURNED: { label: "Returned", tone: "critical" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  FAILED: { label: "Booking failed", tone: "critical" },
};

const BULK_LIMIT = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const [settings, plan, shipments] = await Promise.all([
    getSettings(shop),
    getActivePlan(admin),
    db.shipment.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const booked = await db.shipment.findMany({
    where: { shop, status: { not: "FAILED" } },
    select: { orderId: true },
  });
  const ready = await db.orderVerification.findMany({
    where: { shop, status: "CONFIRMED", orderId: { notIn: booked.map((b) => b.orderId) } },
    orderBy: { respondedAt: "desc" },
    take: 50,
  });

  return {
    courierLabel: COURIERS.find((c) => c.id === settings.courierProvider)?.label ?? "No courier",
    courierReady: !!courierFor(settings),
    paidPlan: plan !== "Free",
    ready: ready.map((r) => ({
      orderId: r.orderId,
      orderName: r.orderName,
      customerName: r.customerName,
      total: `${r.currency} ${r.totalPrice.toFixed(2)}`,
      riskScore: r.riskScore,
    })),
    shipments: shipments.map((s) => ({
      id: s.id,
      orderId: s.orderId,
      orderName: s.orderName,
      provider: COURIERS.find((c) => c.id === s.provider)?.label ?? s.provider,
      trackingNumber: s.trackingNumber,
      labelUrl: s.labelUrl,
      status: s.status,
      rawStatus: s.rawStatus,
      city: s.city,
      cod: s.codAmount,
      error: s.error,
      createdAt: s.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "refresh") {
    const r = await syncShipments({ shop, minAgeMinutes: 0 });
    return { message: `Checked ${r.checked} parcel(s), ${r.updated} updated` };
  }

  if ((await getActivePlan(admin)) === "Free") {
    return { message: "Courier booking needs a paid plan", error: true };
  }

  let orderIds: string[] = [];
  if (intent === "book") {
    orderIds = [String(form.get("orderId"))];
  } else if (intent === "bookAll") {
    orderIds = form.getAll("orderIds").map(String).slice(0, BULK_LIMIT);
  }

  let ok = 0;
  let failed = 0;
  for (const id of orderIds) {
    // Only orders this shop actually has a verification record for.
    const known = await db.orderVerification.findUnique({ where: { shop_orderId: { shop, orderId: id } } });
    if (!known) continue;
    try {
      const s = await bookOrder(shop, admin, id);
      if (s.status === "FAILED") failed++;
      else ok++;
    } catch (e) {
      return { message: e instanceof Error ? e.message : String(e), error: true };
    }
  }
  return {
    message: `${ok} booked${failed ? `, ${failed} failed (see the error in the table)` : ""}`,
    error: failed > 0 && ok === 0,
  };
};

export default function ShipmentsPage() {
  const { courierLabel, courierReady, paidPlan, ready, shipments } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message, { isError: !!fetcher.data.error });
    }
  }, [fetcher.data, shopify]);

  const submit = (data: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) {
      for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
    }
    fetcher.submit(fd, { method: "POST" });
  };

  const canBook = courierReady && paidPlan;

  return (
    <s-page heading="Shipments">
      <s-button
        slot="primary-action"
        disabled={!canBook || ready.length === 0 || busy}
        onClick={() => submit({ intent: "bookAll", orderIds: ready.map((r) => r.orderId) })}
      >
        Book all confirmed ({Math.min(ready.length, BULK_LIMIT)})
      </s-button>
      <s-button slot="secondary-actions" onClick={() => submit({ intent: "refresh" })} disabled={busy}>
        Refresh tracking
      </s-button>

      {!courierReady && (
        <s-banner tone="warning" heading="Courier is not set up">
          Choose your courier and add its API details on the <s-link href="/app/settings">Settings</s-link> page.
        </s-banner>
      )}
      {!paidPlan && (
        <s-banner tone="info" heading="Courier booking is a paid feature">
          <s-link href="/app/billing">Choose a plan</s-link> to book parcels from the app.
        </s-banner>
      )}

      <s-section heading={`Ready to book with ${courierLabel}`}>
        {ready.length === 0 ? (
          <s-paragraph>No confirmed orders waiting. Orders appear here once the customer confirms on WhatsApp.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>COD amount</s-table-header>
              <s-table-header>Risk</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {ready.map((r) => (
                <s-table-row key={r.orderId}>
                  <s-table-cell>
                    <s-link href={`shopify://admin/orders/${r.orderId.split("/").pop()}`}>{r.orderName}</s-link>
                  </s-table-cell>
                  <s-table-cell>{r.customerName ?? "—"}</s-table-cell>
                  <s-table-cell>{r.total}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={r.riskScore >= 60 ? "critical" : r.riskScore >= 30 ? "warning" : "success"}>
                      {String(r.riskScore)}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      disabled={!canBook || busy}
                      onClick={() => submit({ intent: "book", orderId: r.orderId })}
                    >
                      Book
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Booked parcels">
        {shipments.length === 0 ? (
          <s-paragraph>No parcels booked yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order</s-table-header>
              <s-table-header>Courier</s-table-header>
              <s-table-header>Tracking</s-table-header>
              <s-table-header>City</s-table-header>
              <s-table-header>COD</s-table-header>
              <s-table-header>Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {shipments.map((s) => {
                const st = STATUS[s.status] ?? { label: s.status, tone: "neutral" as Tone };
                return (
                  <s-table-row key={s.id}>
                    <s-table-cell>
                      <s-link href={`shopify://admin/orders/${s.orderId.split("/").pop()}`}>{s.orderName}</s-link>
                    </s-table-cell>
                    <s-table-cell>{s.provider}</s-table-cell>
                    <s-table-cell>
                      {s.trackingNumber ?? "—"}
                      {s.labelUrl && (
                        <>
                          {" "}
                          <s-link href={s.labelUrl} target="_blank">
                            Print slip
                          </s-link>
                        </>
                      )}
                    </s-table-cell>
                    <s-table-cell>{s.city ?? "—"}</s-table-cell>
                    <s-table-cell>{s.cod.toLocaleString()}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-200">
                        <s-badge tone={st.tone}>{st.label}</s-badge>
                        {s.rawStatus && <s-text color="subdued">{s.rawStatus}</s-text>}
                        {s.error && <s-text tone="critical">{s.error}</s-text>}
                        {s.status === "FAILED" && (
                          <s-button
                            variant="tertiary"
                            disabled={!canBook || busy}
                            onClick={() => submit({ intent: "book", orderId: s.orderId })}
                          >
                            Try again
                          </s-button>
                        )}
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
