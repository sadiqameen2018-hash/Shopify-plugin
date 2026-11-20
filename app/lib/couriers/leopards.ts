import { matchCity, normalizeStatus } from "./common";
import { CourierError, type BookingRequest, type CourierClient, type TrackingResult } from "./types";

/**
 * Leopards Courier merchant API.
 * Requests send api_key + api_password with every call (form fields / query string).
 * Endpoints: bookPacket, trackBookedPacket, getAllCities  (".../format/json/").
 */
const LIVE = "https://merchantapi.leopardscourier.com/api/";
const STAGING = "https://merchantapistaging.leopardscourier.com/api/";

interface LeopardsCity {
  id: number | string;
  name: string;
}

interface LeopardsResponse {
  status?: number | string;
  error?: string | string[] | null;
  track_number?: string;
  slip_link?: string;
  city_list?: LeopardsCity[];
  packet_list?: { track_number?: string; booked_packet_status?: string }[];
}

const cityCache = new Map<string, { at: number; cities: LeopardsCity[] }>();
const DAY = 24 * 60 * 60 * 1000;

export function leopardsClient(opts: {
  apiKey: string;
  apiPassword: string;
  testMode: boolean;
  fetchImpl?: typeof fetch;
}): CourierClient {
  const base = opts.testMode ? STAGING : LIVE;
  const doFetch = opts.fetchImpl ?? fetch;
  const auth = { api_key: opts.apiKey, api_password: opts.apiPassword };

  async function call(method: "GET" | "POST", path: string, params: Record<string, string>) {
    const body = new URLSearchParams({ ...auth, ...params });
    const res =
      method === "GET"
        ? await doFetch(`${base}${path}?${body}`)
        : await doFetch(`${base}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
    const json = (await res.json().catch(() => null)) as LeopardsResponse | null;
    if (!res.ok || !json) throw new CourierError(`Leopards API error (HTTP ${res.status})`);
    if (String(json.status) !== "1") {
      const err = Array.isArray(json.error) ? json.error.join(", ") : json.error;
      throw new CourierError(`Leopards: ${err || "request failed"}`);
    }
    return json;
  }

  async function cities() {
    const cacheKey = `${base}|${opts.apiKey}`;
    const hit = cityCache.get(cacheKey);
    if (hit && Date.now() - hit.at < DAY) return hit.cities;
    const json = await call("GET", "getAllCities/format/json/", {});
    const list = json.city_list ?? [];
    cityCache.set(cacheKey, { at: Date.now(), cities: list });
    return list;
  }

  return {
    id: "leopards",
    displayName: "Leopards Courier",

    async book(req: BookingRequest) {
      const city = matchCity(req.customer.city, await cities(), (c) => c.name);
      if (!city) {
        throw new CourierError(
          `City "${req.customer.city}" was not found in the Leopards city list. Fix the city on the order and book again.`,
        );
      }
      const json = await call("POST", "bookPacket/format/json/", {
        booked_packet_weight: String(req.weightGrams),
        booked_packet_no_piece: String(req.pieces),
        booked_packet_collect_amount: String(Math.round(req.codAmount)),
        booked_packet_order_id: req.orderName,
        origin_city: "self",
        destination_city: String(city.id),
        shipment_name_eng: "self",
        shipment_email: "self",
        shipment_phone: "self",
        shipment_address: "self",
        consignment_name_eng: req.customer.name,
        consignment_email: req.customer.email,
        consignment_phone: req.customer.phone,
        consignment_address: req.customer.address,
        special_instructions: req.instructions || req.itemsDescription || "-",
      });
      if (!json.track_number) throw new CourierError("Leopards did not return a tracking number");
      return { trackingNumber: json.track_number, labelUrl: json.slip_link ?? null, city: city.name };
    },

    async track(trackingNumbers: string[]) {
      const out = new Map<string, TrackingResult>();
      if (!trackingNumbers.length) return out;
      const json = await call("GET", "trackBookedPacket/format/json/", {
        track_numbers: trackingNumbers.join(","),
      });
      for (const p of json.packet_list ?? []) {
        if (!p.track_number) continue;
        const raw = p.booked_packet_status ?? "";
        out.set(p.track_number, { rawStatus: raw, status: normalizeStatus(raw) });
      }
      return out;
    },
  };
}
