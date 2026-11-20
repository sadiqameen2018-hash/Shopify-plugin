import type { ShipmentStatus } from "./types";

/**
 * Map a courier's free-text status to our normalised status.
 * Leopards examples: "Consignment Booked", "Arrived at Station", "Delivered",
 *   "Being Return", "Returned to shipper", "Cancelled".
 * PostEx examples: "Booked", "PostEx WareHouse", "Out For Delivery", "Delivered",
 *   "Out For Return", "Returned", "Attempted", "Cancelled".
 */
export function normalizeStatus(raw: string | null | undefined): ShipmentStatus {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "BOOKED";
  if (/cancel/.test(s)) return "CANCELLED";
  if (/^returned|return(ed)? to (shipper|merchant|origin)|return delivered/.test(s)) return "RETURNED";
  if (/return/.test(s)) return "RETURNING";
  if (/delivered/.test(s) && !/(un|not|non)[ -]?delivered|undelivered/.test(s)) return "DELIVERED";
  if (/^booked$|consignment booked|pickup request|un-?assigned|^unbooked/.test(s)) return "BOOKED";
  return "IN_TRANSIT";
}

/** "923001234567" -> "03001234567" (Pakistani couriers expect local format). */
export function toLocalPhone(e164: string, countryCode = "92"): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith(countryCode)) return "0" + digits.slice(countryCode.length);
  return digits;
}

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(city|district|cantt?|cantonment)\b/g, "")
    .replace(/[^a-z]/g, "");

/** Common spellings customers type at checkout. */
const ALIASES: Record<string, string> = {
  isb: "islamabad",
  lhr: "lahore",
  khi: "karachi",
  rwp: "rawalpindi",
  pindi: "rawalpindi",
  fsd: "faisalabad",
  lyallpur: "faisalabad",
  multan: "multan",
  pesh: "peshawar",
  hyd: "hyderabad",
  sialkot: "sialkot",
  gujranwala: "gujranwala",
  grw: "gujranwala",
};

/** Find the courier's city entry that matches what the customer typed. */
export function matchCity<T>(input: string, cities: T[], name: (c: T) => string): T | null {
  let wanted = clean(input);
  if (!wanted) return null;
  wanted = ALIASES[wanted] ?? wanted;
  const exact = cities.find((c) => clean(name(c)) === wanted);
  if (exact) return exact;
  // "Lahore Cantt" -> "Lahore", "DG Khan" vs "Dera Ghazi Khan" stays unmatched (merchant fixes it).
  const prefix = cities.filter((c) => {
    const n = clean(name(c));
    return n.length >= 4 && (wanted.startsWith(n) || n.startsWith(wanted));
  });
  return prefix.length === 1 ? prefix[0] : null;
}
