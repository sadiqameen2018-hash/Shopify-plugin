# COD Confirm: Shopify App

Cash on Delivery (COD) orders ko **WhatsApp** par confirm karwane wala Shopify app.
Fake orders aur returns (RTO) kam karta hai. Pakistan, India aur Middle East ke stores ke liye.

## Features

| Feature | Detail |
|---|---|
| WhatsApp confirmation | Naye COD order par customer ko **Confirm / Cancel** buttons wala message jata hai |
| Order tags | `cod-pending` → `cod-confirmed` / `cod-cancelled` / `cod-no-response` |
| Risk score (0-100) | Purane cancel orders, ghalat phone number, adhoora address, bada order amount aur naya customer ko dekh kar |
| Reminder | Jawab na aaye to X ghante baad ek reminder, Y ghante baad "no response" |
| Auto-cancel | Customer Cancel dabaye to Shopify order khud cancel ho (Growth/Pro plan) |
| Dashboard | Confirmed, cancelled, response rate aur roke gaye risky orders ki value |
| Billing | Free / Starter $9.99 / Growth $29.99 / Pro $79.99 (Shopify Billing API, 7 din trial) |
| GDPR | App Store ke liye zaroori compliance webhooks lage hue hain |

## Tech stack
- **Node.js + TypeScript**, React Router (Shopify ka official app template)
- **Polaris web components** (admin UI)
- **Prisma** (local par SQLite, production mein PostgreSQL)
- **Shopify Admin GraphQL API** + webhooks
- **WhatsApp Cloud API** (Meta)

## Project ka dhancha

```
app/
  lib/
    cod.ts                    COD order pehchanna
    phone.ts                  Phone number ko WhatsApp format (923001234567) mein badalna
    risk.ts                   Risk score ke rules
    plans.ts                  Billing plans aur limits
    whatsapp.server.ts        WhatsApp API: message bhejna, reply parse karna, signature check
    shopify-orders.server.ts  Order tag, cancel, active plan
    verification.server.ts    Asal flow: new order → message → reply → tag, aur reminders
  routes/
    app._index.tsx            Dashboard
    app.settings.tsx          Settings page
    app.billing.tsx           Plans page
    webhooks.orders.create.tsx
    whatsapp.webhook.tsx      Meta webhook (GET verify + POST replies)
    jobs.run.tsx              Reminder/expiry cron endpoint
    webhooks.customers.*.tsx, webhooks.shop.redact.tsx   GDPR
tests/                        Unit tests (vitest)
```

## Local par chalana

Zaroori cheezen: Node.js 22+, [Shopify Partner account](https://partners.shopify.com), ek development store aur Shopify CLI.

```bash
npm install
cp .env.example .env          # WhatsApp aur CRON values bharein
npm run config:link           # Partner Dashboard mein app banaye/link kare
npm run dev                   # Tunnel ke saath app chalata hai, store par install karein
npm test                      # Unit tests
```

> `orders/create` webhook aur customer phone **protected customer data** hain.
> Partner Dashboard → App → **API access → Protected customer data** mein jaa kar
> "Orders" aur "Phone" fields ki request zaroor karein, warna webhook nahi aayega.

## WhatsApp setup (ek dafa)

1. [Meta for Developers](https://developers.facebook.com) par app banayein aur **WhatsApp** product add karein.
2. Business number add karein. **Phone number ID** aur ek **permanent System User token** lein.
3. WhatsApp Manager mein **Message Template** banayein:
   - Name: `cod_order_confirmation`, Category: **Utility**
   - Body (English):
     `Hi {{1}}, thank you for your order at {{2}}. Order {{3}} total {{4}} will be paid on delivery. Please confirm your order.`
   - Body (Urdu, language `ur`):
     `السلام علیکم {{1}}، {{2}} پر آرڈر کا شکریہ۔ آرڈر {{3}} کی رقم {{4}} ڈیلیوری پر ادا ہوگی۔ براہ کرم آرڈر کنفرم کریں۔`
   - Buttons: **Quick reply** → button 1: `✅ Confirm`, button 2: `❌ Cancel` (yahi tarteeb rakhein)
4. Webhook: Callback URL `https://YOUR-APP-URL/whatsapp/webhook`, Verify token = `WHATSAPP_VERIFY_TOKEN`.
   `messages` field ko subscribe karein.
5. `.env` mein `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` bharein.

Growth/Pro plan wale merchants Settings mein apna WhatsApp number bhi laga sakte hain.

## Reminder cron

Har 15-30 minute baad yeh call karein (Render/Fly cron, GitHub Actions ya cron-job.org se):

```bash
curl -X POST https://YOUR-APP-URL/jobs/run -H "Authorization: Bearer $CRON_SECRET"
```

## Production deploy

1. `prisma/schema.prisma` mein `provider = "postgresql"` aur `url = env("DATABASE_URL")` karein.
   `prisma/migrations` folder hata kar `npx prisma migrate dev --name init` chalayein (Postgres ke liye nayi migration).
2. Fly.io, Render ya Railway par `Dockerfile` se deploy karein. Saare env variables set karein.
3. `npm run deploy` se Shopify config (scopes, webhooks) push karein.

## App Store mein bechna: checklist

- [x] Shopify Billing API (sirf Shopify ke zariye charge)
- [x] GDPR webhooks: `customers/data_request`, `customers/redact`, `shop/redact`
- [x] Embedded app, Polaris UI, session token auth
- [x] Uninstall par session delete
- [ ] Protected customer data access approve karwana
- [ ] Privacy policy URL aur support email
- [ ] App listing: icon (1200×1200), screenshots, demo video, description
- [ ] Review ke dauran `BILLING_TEST=true` rakhein, approval ke baad hata dein
- [ ] Development store par poora flow test karein (COD order → WhatsApp → reply → tag)

## Aage kya banana hai (roadmap)
- Pakistani couriers (TCS, Leopards, PostEx, Trax) ki booking confirm orders se
- Urdu/Arabic admin interface
- SMS fallback jab WhatsApp na ho
- Shop owners ke darmiyan shared fake-number blacklist (merchant ki ijazat ke saath)
