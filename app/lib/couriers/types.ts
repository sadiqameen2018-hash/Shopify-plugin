export type ShipmentStatus =
  | "BOOKING"
  | "BOOKED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "RETURNING"
  | "RETURNED"
  | "CANCELLED"
  | "FAILED";

/** Statuses after which we stop polling the courier. */
export const FINAL_STATUSES: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELLED", "FAILED"];

export interface BookingRequest {
  orderName: string;
  /** Amount the rider collects from the customer. */
  codAmount: number;
  weightGrams: number;
  pieces: number;
  itemsDescription: string;
  instructions: string;
  customer: {
    name: string;
    /** Local format, e.g. 03001234567 */
    phone: string;
    email: string;
    address: string;
    city: string;
  };
}

export interface BookingResult {
  trackingNumber: string;
  labelUrl: string | null;
  /** City name as the courier knows it (after matching). */
  city: string;
}

export interface TrackingResult {
  rawStatus: string;
  status: ShipmentStatus;
}

export interface CourierClient {
  id: "leopards" | "postex";
  /** Company name used for the Shopify fulfillment tracking info. */
  displayName: string;
  book(req: BookingRequest): Promise<BookingResult>;
  track(trackingNumbers: string[]): Promise<Map<string, TrackingResult>>;
}

export class CourierError extends Error {}
