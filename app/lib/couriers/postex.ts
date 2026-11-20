import { matchCity, normalizeStatus } from "./common";
import { CourierError, type BookingRequest, type CourierClient, type TrackingResult } from "./types";

/**
 * PostEx merchant API. Auth: `token` header.
 *   POST order/v3/create-order
 *   GET  order/v1/track-order/{trackingNumber}
 *   GET  order/v2/get-operational-city
 * Responses look like { statusCode: "200", statusMessage, dist: ... }.
 */
const BASE = "https://api.postex.pk/services/integration/api/";

interface PostExResponse<T> {
  statusCode?: string | number;
  statusMessage?: string;
  dist?: T;
}

const cityCache = new Map<string, { at: number; cities: string[] }>();
const DAY = 24 * 60 * 60 * 1000;

export function postexClient(opts: {
  token: string;
  pickupAddressCode?: string | null;
  fetchImpl?: typeof fetch;
}): CourierClient {
  const doFetch = opts.fetchImpl ?? fetch;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown) {
    const res = await doFetch(`${BASE}${path}`, {
      method,
      headers: {
        token: opts.token,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => null)) as PostExResponse<T> | null;
    if (!json) throw new CourierError(`PostEx API error (HTTP ${res.status})`);
    if (String(json.statusCode) !== "200") {
      throw new CourierError(`PostEx: ${json.statusMessage || `request failed (HTTP ${res.status})`}`);
    }
    return json.dist as T;
  }

  async function deliveryCities() {
    const hit = cityCache.get(opts.token);
    if (hit && Date.now() - hit.at < DAY) return hit.cities;
    const list =
      (await call<{ operationalCityName: string; isDeliveryCity?: boolean }[]>(
        "GET",
        "order/v2/get-operational-city?operationalCityType=Delivery",
      )) ?? [];
    const names = list.filter((c) => c.isDeliveryCity !== false).map((c) => c.operationalCityName);
    cityCache.set(opts.token, { at: Date.now(), cities: names });
    return names;
  }

  return {
    id: "postex",
    displayName: "PostEx",

    async book(req: BookingRequest) {
      const city = matchCity(req.customer.city, await deliveryCities(), (c) => c);
      if (!city) {
        throw new CourierError(
          `City "${req.customer.city}" is not a PostEx delivery city. Fix the city on the order and book again.`,
        );
      }
      const dist = await call<{ trackingNumber?: string }>("POST", "order/v3/create-order", {
        orderRefNumber: req.orderName,
        invoicePayment: String(Math.round(req.codAmount)),
        orderDetail: req.itemsDescription.slice(0, 250),
        customerName: req.customer.name,
        customerPhone: req.customer.phone,
        deliveryAddress: req.customer.address,
        transactionNotes: req.instructions,
        cityName: city,
        invoiceDivision: 1,
        items: req.pieces,
        orderType: "Normal",
        ...(opts.pickupAddressCode ? { pickupAddressCode: opts.pickupAddressCode } : {}),
      });
      if (!dist?.trackingNumber) throw new CourierError("PostEx did not return a tracking number");
      return { trackingNumber: dist.trackingNumber, labelUrl: null, city };
    },

    async track(trackingNumbers: string[]) {
      const out = new Map<string, TrackingResult>();
      for (const tn of trackingNumbers) {
        try {
          const dist = await call<{ transactionStatus?: string; orderStatus?: string }>(
            "GET",
            `order/v1/track-order/${encodeURIComponent(tn)}`,
          );
          const raw = dist?.transactionStatus ?? dist?.orderStatus ?? "";
          out.set(tn, { rawStatus: raw, status: normalizeStatus(raw) });
        } catch {
          // Skip this one; it is retried on the next run.
        }
      }
      return out;
    },
  };
}
