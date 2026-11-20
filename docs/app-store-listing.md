# App Store listing – COD Confirm

Copy each field into Partner Dashboard → Apps → COD Confirm → **Distribution → Manage listing**.
Character limits change from time to time, so check the counter shown next to each field.
Shopify rejects listings with unverifiable claims ("#1", "best"), testimonials, contact details
or links in the description, so the text below avoids them.

---

## App name (max 30)
```
COD Confirm ‑ WhatsApp Verify
```

## App introduction / tagline (max 100)
```
Confirm Cash on Delivery orders on WhatsApp before you ship and cut fake orders and returns.
```

## App details (max 500)
```
Fake and refused COD orders cost you courier fees and stock. COD Confirm sends every new Cash on Delivery order a WhatsApp message with Confirm and Cancel buttons. The answer is tagged on the order automatically, so your team ships only confirmed orders. A risk score flags orders with invalid phone numbers, incomplete addresses or earlier refusals. Unanswered orders get a reminder and are tagged no-response. Supports English, Urdu, Arabic and Hindi templates.
```

## Feature list (up to 8 items, max 80 each)
```
WhatsApp message with Confirm / Cancel buttons for every COD order
Automatic order tags: confirmed, cancelled, no response, high risk
Risk score from phone, address, order value and past refusals
Automatic reminder for customers who have not replied
Optional auto-cancel when the customer declines
Dashboard with confirmation rate and risky order value
Use the shared WhatsApp number or connect your own
English, Urdu, Arabic and Hindi message templates
```

## Search terms (up to 5)
```
COD confirmation
WhatsApp order confirmation
cash on delivery
fake orders
RTO
```

## Categories
- Primary: **Orders and shipping → Order tracking / Order management**
- Secondary: **Customer support → Chat** (or Fraud protection, if offered)

## Pricing (must match `app/lib/plans.ts`)
| Plan | Price | Includes |
|---|---|---|
| Free | $0 | 50 COD orders / month, WhatsApp confirmation, order tags |
| Starter | $9.99 / month | 300 orders, risk score, reminders |
| Growth | $29.99 / month | 1,500 orders, auto-cancel, own WhatsApp number |
| Pro | $79.99 / month | Unlimited orders, priority support |

7-day free trial on paid plans.

## Links
| Field | Value |
|---|---|
| Privacy policy URL | `https://YOUR-APP-URL/privacy` |
| Support email | your support email (also set `SUPPORT_EMAIL`) |
| FAQ / docs URL | optional |
| Demo store URL | a development store with the app installed |

## Media to prepare
- **App icon:** 1200 × 1200 px PNG/JPG, no text, no Shopify logo.
- **Feature image / screenshots:** 1600 × 900 px, 3–6 images. Suggested set:
  1. Dashboard with stats and recent orders
  2. WhatsApp message on a phone with Confirm / Cancel buttons
  3. Shopify order page showing the `cod-confirmed` tag
  4. Settings page
  5. Plans page
- **Demo video (optional, recommended):** 1–2 minutes, place a COD order → message arrives → tap Confirm → tag appears.
  Do not show real customer data.

## Notes for the reviewer (App review form)
```
1. Install the app on the review store.
2. On the Settings page, keep "Send WhatsApp confirmation" turned on.
3. Place a test order using the "Cash on Delivery (COD)" payment method with the phone number
   [TEST PHONE NUMBER WHERE YOU WILL RECEIVE THE MESSAGE].
4. A WhatsApp message with Confirm / Cancel buttons is sent; the order is tagged "cod-pending".
5. After the customer taps Confirm, the order tag changes to "cod-confirmed".
Billing uses test charges for this review.
Protected customer data used: customer first name and phone (to send the WhatsApp message),
shipping address (risk score only, not stored).
```

## Protected customer data request (Partner Dashboard → API access)
Answer the questions with:
- **Why the app needs it:** to send the order confirmation WhatsApp message to the customer
  who placed the COD order and to tag the order with their answer.
- **Fields:** Name (first name), Phone, Address (read only, for risk score).
- **Data retention:** kept while installed; deleted on `shop/redact` and `customers/redact`.
- **Encryption:** HTTPS in transit; database encryption at rest from the hosting provider.
