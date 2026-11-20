import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../lib/settings.server";
import { getActivePlan } from "../lib/shopify-orders.server";
import { PLAN_GROWTH, PLAN_PRO } from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const [settings, plan] = await Promise.all([getSettings(session.shop), getActivePlan(admin)]);
  const { waAccessToken, ...safe } = settings;
  return {
    settings: { ...safe, hasOwnToken: !!waAccessToken },
    sharedNumberAvailable: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    advancedAllowed: plan === PLAN_GROWTH || plan === PLAN_PRO,
  };
};

const int = (v: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v: FormDataEntryValue | null, fallback: string) =>
  (typeof v === "string" && v.trim()) || fallback;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const current = await getSettings(session.shop);
  const plan = await getActivePlan(admin);
  const advancedAllowed = plan === PLAN_GROWTH || plan === PLAN_PRO;

  const newToken = String(form.get("waAccessToken") ?? "").trim();
  const highValue = Number(form.get("highValueAmount"));

  await db.shopSettings.update({
    where: { shop: session.shop },
    data: {
      enabled: form.get("enabled") === "true",
      defaultCountryCode: str(form.get("defaultCountryCode"), "92").replace(/\D/g, "") || "92",
      templateName: str(form.get("templateName"), current.templateName),
      templateLanguage: str(form.get("templateLanguage"), current.templateLanguage),
      reminderAfterHours: int(form.get("reminderAfterHours"), 1, 72, current.reminderAfterHours),
      expireAfterHours: int(form.get("expireAfterHours"), 2, 168, current.expireAfterHours),
      highRiskThreshold: int(form.get("highRiskThreshold"), 0, 100, current.highRiskThreshold),
      highValueAmount: Number.isFinite(highValue) && highValue >= 0 ? highValue : current.highValueAmount,
      autoCancel: advancedAllowed && form.get("autoCancel") === "true",
      ...(advancedAllowed
        ? {
            waPhoneNumberId: String(form.get("waPhoneNumberId") ?? "").trim() || null,
            // Empty field keeps the saved token; "clear" checkbox removes it.
            ...(form.get("clearToken") === "true"
              ? { waAccessToken: null }
              : newToken
                ? { waAccessToken: newToken }
                : {}),
          }
        : {}),
    },
  });
  return { ok: true };
};

export default function SettingsPage() {
  const { settings: s, sharedNumberAvailable, advancedAllowed } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const shopify = useAppBridge();

  useEffect(() => {
    if (result?.ok) shopify.toast.show("Settings saved");
  }, [result, shopify]);

  return (
    <s-page heading="Settings">
      <Form method="post">
        <s-stack direction="block" gap="base">
          <s-section heading="General">
            <s-stack direction="block" gap="base">
              <s-checkbox
                name="enabled"
                value="true"
                defaultChecked={s.enabled}
                label="Send WhatsApp confirmation for new COD orders"
              />
              <s-text-field
                name="defaultCountryCode"
                label="Default country code"
                details="Used when a phone number has no + prefix. 92 = Pakistan, 91 = India, 971 = UAE, 966 = Saudi Arabia."
                defaultValue={s.defaultCountryCode}
              />
            </s-stack>
          </s-section>

          <s-section heading="WhatsApp message">
            <s-stack direction="block" gap="base">
              <s-text-field
                name="templateName"
                label="Approved template name"
                details="Template with 4 variables (name, store, order number, total) and two quick-reply buttons: Confirm, Cancel."
                defaultValue={s.templateName}
              />
              <s-select name="templateLanguage" label="Template language" value={s.templateLanguage}>
                <s-option value="en">English</s-option>
                <s-option value="ur">Urdu</s-option>
                <s-option value="ar">Arabic</s-option>
                <s-option value="hi">Hindi</s-option>
              </s-select>
              <s-number-field
                name="reminderAfterHours"
                label="Send a reminder after (hours)"
                min={1}
                max={72}
                defaultValue={String(s.reminderAfterHours)}
              />
              <s-number-field
                name="expireAfterHours"
                label="Mark as 'no response' after (hours)"
                min={2}
                max={168}
                defaultValue={String(s.expireAfterHours)}
              />
            </s-stack>
          </s-section>

          <s-section heading="Risk score">
            <s-stack direction="block" gap="base">
              <s-number-field
                name="highRiskThreshold"
                label="Tag as high risk at score"
                min={0}
                max={100}
                defaultValue={String(s.highRiskThreshold)}
              />
              <s-number-field
                name="highValueAmount"
                label="High order value (store currency)"
                min={0}
                defaultValue={String(s.highValueAmount)}
              />
            </s-stack>
          </s-section>

          <s-section heading="Advanced (Growth and Pro plans)">
            <s-stack direction="block" gap="base">
              {!advancedAllowed && (
                <s-banner tone="info">
                  Upgrade to Growth or Pro to use your own WhatsApp number and auto-cancel.{" "}
                  <s-link href="/app/billing">See plans</s-link>
                </s-banner>
              )}
              <s-checkbox
                name="autoCancel"
                value="true"
                defaultChecked={s.autoCancel}
                disabled={!advancedAllowed}
                label="Cancel the Shopify order automatically when the customer taps Cancel"
              />
              <s-text-field
                name="waPhoneNumberId"
                label="Own WhatsApp phone number ID"
                details={
                  sharedNumberAvailable
                    ? "Leave empty to use the app's shared WhatsApp number."
                    : "From Meta WhatsApp Manager > API Setup."
                }
                defaultValue={s.waPhoneNumberId ?? ""}
                disabled={!advancedAllowed}
              />
              <s-password-field
                name="waAccessToken"
                label="WhatsApp access token"
                details={s.hasOwnToken ? "A token is saved. Leave empty to keep it." : "Permanent system user token."}
                disabled={!advancedAllowed}
              />
              {s.hasOwnToken && (
                <s-checkbox name="clearToken" value="true" label="Remove saved token" disabled={!advancedAllowed} />
              )}
            </s-stack>
          </s-section>

          <s-button type="submit" variant="primary" {...(nav.state === "submitting" ? { loading: true } : {})}>
            Save
          </s-button>
        </s-stack>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
