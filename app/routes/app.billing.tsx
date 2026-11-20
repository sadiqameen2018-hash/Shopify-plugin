import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PAID_PLAN_NAMES, PLANS } from "../lib/plans";

const isTest = () => process.env.NODE_ENV !== "production" || process.env.BILLING_TEST === "true";

type PaidPlan = (typeof PAID_PLAN_NAMES)[number];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { appSubscriptions } = await billing.check({
    plans: [...PAID_PLAN_NAMES],
    isTest: isTest(),
  });
  const active = appSubscriptions[0];
  return { current: active?.name ?? "Free", subscriptionId: active?.id ?? null };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "subscribe") {
    const plan = String(form.get("plan")) as PaidPlan;
    if (!PAID_PLAN_NAMES.includes(plan)) return { error: "Unknown plan" };
    // Redirects the merchant to Shopify's approval page.
    // Changing between paid plans replaces the current subscription.
    await billing.request({ plan, isTest: isTest() });
  }

  if (intent === "cancel") {
    const { appSubscriptions } = await billing.check({ plans: [...PAID_PLAN_NAMES], isTest: isTest() });
    for (const sub of appSubscriptions) {
      await billing.cancel({ subscriptionId: sub.id, isTest: isTest(), prorate: true });
    }
  }
  return { error: null };
};

export default function BillingPage() {
  const { current } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Plans">
      <s-section>
        <s-paragraph>
          All paid plans include a 7-day free trial. Charges appear on your Shopify invoice.
        </s-paragraph>
      </s-section>
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
        {PLANS.map((p) => {
          const isCurrent = p.name === current;
          return (
            <s-section key={p.name} heading={p.name}>
              <s-stack direction="block" gap="base">
                <s-heading>{p.price === 0 ? "Free" : `$${p.price} / month`}</s-heading>
                <s-unordered-list>
                  {p.features.map((f) => (
                    <s-list-item key={f}>{f}</s-list-item>
                  ))}
                </s-unordered-list>
                {isCurrent ? (
                  <s-badge tone="success">Current plan</s-badge>
                ) : p.price === 0 ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <s-button type="submit">Downgrade to Free</s-button>
                  </Form>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="subscribe" />
                    <input type="hidden" name="plan" value={p.name} />
                    <s-button type="submit" variant="primary">
                      Choose {p.name}
                    </s-button>
                  </Form>
                )}
              </s-stack>
            </s-section>
          );
        })}
      </s-grid>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
