import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

/**
 * Public privacy policy page: https://YOUR-APP-URL/privacy
 * Paste this URL into the Partner Dashboard (App listing > Privacy policy).
 * Set APP_COMPANY_NAME and SUPPORT_EMAIL in the environment.
 */
export const loader = async () => ({
  company: process.env.APP_COMPANY_NAME || "[Your company name]",
  email: process.env.SUPPORT_EMAIL || "[support@your-domain.com]",
  updated: "November 20, 2026",
});

export const meta: MetaFunction = () => [{ title: "Privacy Policy – COD Confirm" }];

const style = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "40px 16px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  lineHeight: 1.6,
  color: "#1a1a1a",
};

export default function Privacy() {
  const { company, email, updated } = useLoaderData<typeof loader>();
  return (
    <main style={style}>
      <h1>Privacy Policy – COD Confirm</h1>
      <p>Last updated: {updated}</p>

      <p>
        COD Confirm (&quot;the App&quot;) is provided by {company} (&quot;we&quot;, &quot;us&quot;). The App
        helps Shopify merchants confirm Cash on Delivery (COD) orders with their customers over
        WhatsApp. This policy explains what information the App collects, how it is used, and the
        choices merchants and customers have.
      </p>

      <h2>Information we collect</h2>
      <p>When a merchant installs the App, we access the following through the Shopify API:</p>
      <ul>
        <li>
          <strong>Store information:</strong> shop domain and store name, and the App settings the
          merchant saves.
        </li>
        <li>
          <strong>Order information for COD orders:</strong> order ID, order number, order total
          and currency, payment method, and the customer&apos;s first name and phone number.
        </li>
        <li>
          <strong>Information used only for the risk score:</strong> the shipping address line,
          city and the customer&apos;s previous order count. These are read when the order is
          created and are <em>not</em> stored by the App.
        </li>
        <li>
          <strong>Customer replies:</strong> whether the customer tapped Confirm or Cancel on the
          WhatsApp message, and when.
        </li>
      </ul>
      <p>We do not collect payment card details, and we do not use cookies to track customers.</p>

      <h2>How we use information</h2>
      <ul>
        <li>To send the customer a WhatsApp message asking them to confirm or cancel their COD order.</li>
        <li>To add tags to the order in the merchant&apos;s Shopify admin and, if the merchant turns it on, cancel orders the customer declined.</li>
        <li>To calculate a risk score from that merchant&apos;s own earlier orders. Data from one store is never used for another store.</li>
        <li>To show the merchant statistics in the App dashboard and to bill the merchant through Shopify.</li>
      </ul>
      <p>We do not sell personal information and do not use it for advertising.</p>

      <h2>Sharing</h2>
      <p>We share information only with service providers needed to run the App:</p>
      <ul>
        <li>
          <strong>Meta Platforms (WhatsApp Business Platform)</strong> – the customer&apos;s phone
          number and the message content (first name, store name, order number and total) to
          deliver the WhatsApp message.
        </li>
        <li>
          <strong>Our hosting and database provider</strong> – to store the data described above.
        </li>
        <li><strong>Shopify</strong> – to read orders, update tags and handle billing.</li>
      </ul>
      <p>We may also disclose information if required by law.</p>

      <h2>Data retention</h2>
      <ul>
        <li>Order verification records are kept while the App is installed so the merchant can see history and risk scores.</li>
        <li>When a merchant uninstalls the App, all of that store&apos;s data is deleted within 48 hours after Shopify sends the shop redaction request.</li>
        <li>When Shopify sends a customer redaction request, we delete that customer&apos;s records.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Customers who want to access, correct or delete their information should contact the store
        where they placed the order; the store can ask us to act on the request. Residents of the
        EEA, UK and other regions with data protection laws have the right to access, correct,
        delete and object to the processing of their personal data. Merchants are the data
        controllers for their customers&apos; data; we process it on their behalf.
      </p>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections (HTTPS). Access to the database is restricted, and
        WhatsApp webhooks are verified with a cryptographic signature.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy. The &quot;Last updated&quot; date above shows when it last changed.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${email}`}>{email}</a>
      </p>
    </main>
  );
}
