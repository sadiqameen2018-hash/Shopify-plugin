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
| Courier booking | **Leopards** aur **PostEx** par ek click (ya ek saath 25 orders) mein booking. Tracking number, slip print, aur chahein to Shopify order fulfill + customer ko tracking email |
| Tracking sync | Courier ka status khud update hota hai: `courier-delivered` / `courier-returned` tags. Returned parcel us number ka risk score barhata hai |
| Auto-book | Customer WhatsApp par Confirm dabaye to parcel khud book ho (Growth/Pro) |
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
    couriers/                 Leopards aur PostEx API clients, city matching, status mapping
    shipping.server.ts        Booking flow aur tracking sync
    crypto.server.ts          Courier password/token ko encrypt kar ke save karna
    whatsapp.server.ts        WhatsApp API: message bhejna, reply parse karna, signature check
    shopify-orders.server.ts  Order tag, cancel, active plan
    verification.server.ts    Asal flow: new order → message → reply → tag, aur reminders
  routes/
    app._index.tsx            Dashboard
    app.settings.tsx          Settings page
    app.billing.tsx           Plans page
    app.shipments.tsx         Courier booking aur tracking page
    webhooks.orders.create.tsx
    whatsapp.webhook.tsx      Meta webhook (GET verify + POST replies)
    jobs.run.tsx              Reminder/expiry cron endpoint
    webhooks.customers.*.tsx, webhooks.shop.redact.tsx   GDPR
tests/                        Unit tests (vitest)
tests/integration/            Poora flow: order → WhatsApp → reply → booking → tracking (nakli Shopify/APIs)
```

## Local par chalana

Zaroori cheezen: Node.js 22+, [Shopify Partner account](https://partners.shopify.com), ek development store aur Shopify CLI.

```bash
npm install
cp .env.example .env          # WhatsApp aur CRON values bharein
npm run config:link           # Partner Dashboard mein app banaye/link kare
npm run dev                   # Tunnel ke saath app chalata hai, store par install karein
npm test                      # Unit + integration tests (alag test database: prisma/test.sqlite)
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

## Courier setup (merchant ki taraf se)

Settings → **Courier booking**:

| Courier | Kya chahiye | Kahan se milega |
|---|---|---|
| Leopards | API key + API password | Leopards merchant portal → API Management. Pehle "staging" tick rakh kar test karein |
| PostEx | API token (+ pickup address code optional) | PostEx merchant portal → Integration |

- Booking ke liye shipping address mein **city** courier ki city list se milni chahiye (jaise "Lahore Cantt" → Lahore, "Pindi" → Rawalpindi khud match ho jata hai). Na mile to error dikhata hai. Order mein city theek kar ke "Try again" dabayein.
- COD amount = order ka outstanding amount. Weight = Settings wala default.
- Server par `ENCRYPTION_KEY` zaroor set karein (`openssl rand -base64 32`), taake courier passwords encrypt ho kar save hon.

> Leopards aur PostEx ka API format un ke open-source SDKs se liya gaya hai, aur tests nakli (mock)
> responses par chalte hain. Live jane se pehle dono ke **test/staging account** se ek booking zaroor karein.

## Reminder cron

Yahi job courier tracking bhi update karta hai. Har 15-30 minute baad yeh call karein (Render/Fly cron, GitHub Actions ya cron-job.org se):

```bash
curl -X POST https://YOUR-APP-URL/jobs/run -H "Authorization: Bearer $CRON_SECRET"
```

## Production deploy

1. `prisma/schema.prisma` mein `provider = "postgresql"` karein aur `DATABASE_URL` mein Postgres ka URL dein.
   `prisma/migrations` folder hata kar `npx prisma migrate dev --name init` chalayein (Postgres ke liye nayi migration).
2. Fly.io, Render ya Railway par `Dockerfile` se deploy karein. Saare env variables set karein.
3. `npm run deploy` se Shopify config (scopes, webhooks) push karein.

## App Store mein bechna: checklist

- [x] Shopify Billing API (sirf Shopify ke zariye charge)
- [x] GDPR webhooks: `customers/data_request`, `customers/redact`, `shop/redact`
- [x] Embedded app, Polaris UI, session token auth
- [x] Uninstall par session delete
- [ ] Protected customer data access approve karwana
- [x] Privacy policy page: `/privacy` (`APP_COMPANY_NAME`, `SUPPORT_EMAIL` env set karein)
- [ ] Support email
- [x] Listing ka text: `docs/app-store-listing.md`
- [ ] Icon (1200×1200), screenshots (1600×900), demo video
- [ ] Review ke dauran `BILLING_TEST=true` rakhein, approval ke baad hata dein
- [ ] Development store par poora flow test karein (COD order → WhatsApp → reply → tag)

## Aage kya banana hai (roadmap)
- TCS, Trax aur M&P courier (API docs milne par; `app/lib/couriers/` mein naya client add karna hai)
- COD payment reconciliation (courier se kitne paise aaye)
- Urdu/Arabic admin interface
- SMS fallback jab WhatsApp na ho
- Risk score abhi sirf usi store ke orders dekhta hai (Shopify data rules)
