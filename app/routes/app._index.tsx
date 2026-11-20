import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../lib/settings.server";
import { getActivePlan } from "../lib/shopify-orders.server";
import { getPlan } from "../lib/plans";
import { monthlyUsage } from "../lib/verification.server";
import { resolveCredentials } from "../lib/whatsapp.server";

type Tone = "neutral" | "info" | "success" | "caution" | "warning" | "critical";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  SENT: { label: "Waiting for reply", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "critical" },
  NO_RESPONSE: { label: "No response", tone: "warning" },
  FAILED: { label: "Failed", tone: "critical" },
  SKIPPED: { label: "Skipped (limit)", tone: "caution" },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [settings, grouped, cancelledValue, recent, usage, planName] = await Promise.all([
    getSettings(shop),
    db.orderVerification.groupBy({
      by: ["status"],
      where: { shop, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.orderVerification.aggregate({
      where: { shop, createdAt: { gte: since }, status: { in: ["CANCELLED", "NO_RESPONSE"] } },
      _sum: { totalPrice: true },
    }),
    db.orderVerification.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    monthlyUsage(shop),
    getActivePlan(admin),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  const total = grouped.reduce((n, g) => n + g._count._all, 0);
  const answered = (counts.CONFIRMED ?? 0) + (counts.CANCELLED ?? 0);
  const plan = getPlan(planName);

  return {
    whatsappReady: !!resolveCredentials(settings),
    enabled: settings.enabled,
    stats: {
      total,
      confirmed: counts.CONFIRMED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
      noResponse: counts.NO_RESPONSE ?? 0,
      waiting: counts.SENT ?? 0,
      responseRate: total ? Math.round((answered / total) * 100) : 0,
      blockedValue: cancelledValue._sum.totalPrice ?? 0,
      currency: recent[0]?.currency ?? "",
    },
    plan: { name: plan.name, limit: plan.monthlyOrders, usage },
    orders: recent.map((r) => ({
      id: r.id,
      orderId: r.orderId.split("/").pop(),
      orderName: r.orderName,
      customerName: r.customerName,
      phone: r.phone,
      total: `${r.currency} ${r.totalPrice.toFixed(2)}`,
      status: r.status,
      riskScore: r.riskScore,
      riskReasons: JSON.parse(r.riskReasons) as string[],
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    })),
  };
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{String(value)}</s-heading>
      </s-stack>
    </s-box>
  );
}

export default function Dashboard() {
  const { whatsappReady, enabled, stats, plan, orders } = useLoaderData<typeof loader>();
  const nearLimit = plan.limit !== null && plan.usage >= plan.limit * 0.8;

  return (
    <s-page heading="COD Confirm">
      <s-button slot="primary-action" href="/app/settings">
        Settings
      </s-button>

      {!whatsappReady && (
        <s-banner tone="warning" heading="WhatsApp is not connected">
          Add your WhatsApp Business number on the <s-link href="/app/settings">Settings</s-link> page
          so customers receive confirmation messages.
        </s-banner>
      )}
      {!enabled && (
        <s-banner tone="info" heading="Verification is paused">
          New COD orders are not being sent for confirmation.
        </s-banner>
      )}
      {nearLimit && (
        <s-banner tone="warning" heading="You are close to your monthly limit">
          {plan.usage} of {plan.limit} orders used on the {plan.name} plan.{" "}
          <s-link href="/app/billing">Upgrade your plan</s-link>
        </s-banner>
      )}

      <s-section heading="Last 30 days">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))" gap="base">
          <Stat label="COD orders" value={stats.total} />
          <Stat label="Confirmed" value={stats.confirmed} />
          <Stat label="Cancelled by customer" value={stats.cancelled} />
          <Stat label="No response" value={stats.noResponse} />
          <Stat label="Response rate" value={`${stats.responseRate}%`} />
          <Stat
            label="Risky order value stopped"
            value={`${stats.currency} ${stats.blockedValue.toLocaleString()}`}
          />
        </s-grid>
      </s-section>

      <s-section heading="Recent COD orders">
        {orders.length === 0 ? (
          <s-paragraph>
            No COD orders yet. When a customer places a Cash on Delivery order, it will appear here
            and they will get a WhatsApp message to confirm it.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Total</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Risk</s-table-header>
              <s-table-header>Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, tone: "neutral" as Tone };
                const riskTone: Tone =
                  o.riskScore >= 60 ? "critical" : o.riskScore >= 30 ? "warning" : "success";
                return (
                  <s-table-row key={o.id}>
                    <s-table-cell>
                      <s-link href={`shopify://admin/orders/${o.orderId}`}>{o.orderName}</s-link>
                    </s-table-cell>
                    <s-table-cell>
                      {o.customerName ?? "—"}
                      {o.phone ? ` (+${o.phone})` : ""}
                    </s-table-cell>
                    <s-table-cell>{o.total}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone={st.tone}>{st.label}</s-badge>
                      {o.error && (
                        <s-text color="subdued"> {o.error}</s-text>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-tooltip id={`risk-${o.id}`}>
                        {o.riskReasons.join(" • ") || "No risk signals"}
                      </s-tooltip>
                      <s-text interestFor={`risk-${o.id}`}>
                        <s-badge tone={riskTone}>{String(o.riskScore)}</s-badge>
                      </s-text>
                    </s-table-cell>
                    <s-table-cell>{new Date(o.createdAt).toLocaleString()}</s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Your plan">
        <s-paragraph>
          <s-text type="strong">{plan.name}</s-text>
        </s-paragraph>
        <s-paragraph>
          {plan.usage} / {plan.limit ?? "Unlimited"} orders used (last 30 days)
        </s-paragraph>
        <s-button href="/app/billing">See plans</s-button>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-ordered-list>
          <s-list-item>Customer places a COD order</s-list-item>
          <s-list-item>We send a WhatsApp message with Confirm / Cancel buttons</s-list-item>
          <s-list-item>The order is tagged automatically with the answer</s-list-item>
          <s-list-item>Ship only confirmed orders and cut fake orders and returns</s-list-item>
        </s-ordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
