/**
 * The status a customer should see. A PENDING booking whose hold has run out is
 * expired, even if nothing has released its seats in the database yet (holds are
 * released lazily, see src/server/holds.ts).
 */
export type BookingStatusValue = "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "REFUNDED";

export function effectiveStatus(
  booking: { status: BookingStatusValue; expiresAt: Date | null },
  now = new Date(),
): BookingStatusValue {
  if (booking.status === "PENDING" && booking.expiresAt && booking.expiresAt <= now) {
    return "EXPIRED";
  }
  return booking.status;
}

/** Status names in the public API (snake_case, and clearer than PENDING for clients). */
export const API_BOOKING_STATUS = {
  PENDING: "pending_payment",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  REFUNDED: "refunded",
} as const satisfies Record<BookingStatusValue, string>;
