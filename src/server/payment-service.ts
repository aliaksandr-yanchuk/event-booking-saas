import type { Db } from "@/server/db";
import { enqueueEmail } from "@/server/email/outbox";
import { isUniqueViolation } from "@/server/db-errors";
import { CHECKOUT_TTL_MS, HOLD_TTL_MS, type PaymentProvider } from "@/server/payments/provider";

/**
 * Everything between "seats held" and "booking confirmed". Each function is safe to
 * call more than once with the same input, because the Stripe webhook, the return page
 * after checkout and a retrying client can all report the same payment. Instead of a
 * table of processed webhook events, the booking's status makes repeats no-ops: every
 * transition is an UPDATE … WHERE status = <expected>.
 */

export type StartCheckoutResult =
  // expiresAt: the hold, renewed when the checkout was created.
  | { ok: true; url: string; expiresAt: Date }
  | { ok: false; code: "NOT_FOUND" }
  // The booking is no longer waiting for payment (paid, cancelled, expired or free).
  | { ok: false; code: "NOT_PENDING"; status: string };

/**
 * Returns the checkout URL of a pending booking, creating the checkout on first use.
 * A booking that was created but whose checkout could not be created (provider down)
 * gets one on the next call.
 */
export async function startCheckout(
  db: Db,
  payments: PaymentProvider,
  command: { organizationId: string; reference: string; successUrl: string; cancelUrl: string },
  options: { now?: Date } = {},
): Promise<StartCheckoutResult> {
  const now = options.now ?? new Date();
  const booking = await db.booking.findFirst({
    where: { organizationId: command.organizationId, reference: command.reference },
    select: {
      id: true,
      reference: true,
      status: true,
      expiresAt: true,
      checkoutUrl: true,
      totalMinor: true,
      customerEmail: true,
      seatLabels: true,
      event: { select: { title: true, currency: true } },
    },
  });
  if (!booking) return { ok: false, code: "NOT_FOUND" };
  if (booking.status !== "PENDING" || !booking.expiresAt || booking.expiresAt <= now) {
    return { ok: false, code: "NOT_PENDING", status: booking.status };
  }
  if (booking.checkoutUrl) return { ok: true, url: booking.checkoutUrl, expiresAt: booking.expiresAt };

  const session = await payments.createCheckout({
    bookingReference: booking.reference,
    description: `${booking.event.title}: ${booking.seatLabels.join(", ")}`,
    totalMinor: booking.totalMinor,
    currency: booking.event.currency,
    customerEmail: booking.customerEmail,
    successUrl: command.successUrl,
    cancelUrl: command.cancelUrl,
    expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MS),
  });

  // The checkout lives CHECKOUT_TTL_MS from now, so the hold is renewed to outlast it.
  // The condition keeps only the first checkout if two requests got here at once.
  const expiresAt = new Date(now.getTime() + HOLD_TTL_MS);
  const { count } = await db.booking.updateMany({
    where: { id: booking.id, status: "PENDING", checkoutSessionId: null },
    data: {
      paymentProvider: payments.name,
      checkoutSessionId: session.sessionId,
      checkoutUrl: session.url,
      expiresAt,
    },
  });
  if (count === 0) {
    await payments.expireCheckout(session.sessionId);
    return startCheckout(db, payments, command, options);
  }
  return { ok: true, url: session.url, expiresAt };
}

export type ConfirmPaymentResult =
  | { ok: true; outcome: "CONFIRMED" | "ALREADY_CONFIRMED"; reference: string; eventId: string }
  // Paid too late: the hold had expired and another customer took a seat. Refunded.
  | { ok: true; outcome: "REFUNDED"; reference: string; eventId: string }
  | { ok: false; code: "NOT_FOUND" };

/** Records a successful payment for a checkout session and confirms its booking. */
export async function confirmPayment(
  db: Db,
  payments: PaymentProvider,
  command: { sessionId: string; paymentId: string },
  options: { now?: Date } = {},
): Promise<ConfirmPaymentResult> {
  const now = options.now ?? new Date();
  const booking = await db.booking.findUnique({
    where: { checkoutSessionId: command.sessionId },
    select: { id: true, reference: true, eventId: true, status: true, seatIds: true, customerEmail: true },
  });
  if (!booking) return { ok: false, code: "NOT_FOUND" };
  const result = { reference: booking.reference, eventId: booking.eventId };

  switch (booking.status) {
    case "CONFIRMED":
      return { ok: true, outcome: "ALREADY_CONFIRMED", ...result };
    case "REFUNDED":
      return { ok: true, outcome: "REFUNDED", ...result };

    case "PENDING": {
      // Still holding its seats (even if expiresAt has just passed, nobody has taken
      // them yet: they are only released by the UPDATE in releaseStaleHolds).
      const confirmed = await db.$transaction(async (tx) => {
        const { count } = await tx.booking.updateMany({
          where: { id: booking.id, status: "PENDING" },
          data: { status: "CONFIRMED", paidAt: now, paymentId: command.paymentId, expiresAt: null },
        });
        // Queued with the confirmation: exactly one email per confirmed booking.
        if (count === 1) await enqueueEmail(tx, booking, "booking-confirmed");
        return count === 1;
      });
      // Lost a race against the release of the stale hold: handle it as expired.
      return confirmed ? { ok: true, outcome: "CONFIRMED", ...result } : confirmPayment(db, payments, command, options);
    }

    case "EXPIRED": {
      // The customer paid after the hold ran out. Take the seats back if they are still
      // free; the UNIQUE constraint decides, exactly as for a new booking.
      try {
        await db.$transaction(async (tx) => {
          await tx.bookingSeat.createMany({
            data: booking.seatIds.map((seatId) => ({ bookingId: booking.id, seatId })),
          });
          const { count } = await tx.booking.updateMany({
            where: { id: booking.id, status: "EXPIRED" },
            data: { status: "CONFIRMED", paidAt: now, paymentId: command.paymentId },
          });
          if (count === 0) throw new StateChanged();
          await enqueueEmail(tx, booking, "booking-confirmed");
        });
        return { ok: true, outcome: "CONFIRMED", ...result };
      } catch (error) {
        if (error instanceof StateChanged) return confirmPayment(db, payments, command, options);
        if (!isUniqueViolation(error)) throw error;
      }
      return refundLatePayment(db, payments, booking, command.paymentId, now, result);
    }

    case "CANCELLED":
      // The customer released the seats, and a payment still came through (it was in
      // progress when the checkout was expired). They did not want the seats: refund.
      return refundLatePayment(db, payments, booking, command.paymentId, now, result);
  }
}

async function refundLatePayment(
  db: Db,
  payments: PaymentProvider,
  booking: { id: string; customerEmail: string },
  paymentId: string,
  now: Date,
  result: { reference: string; eventId: string },
): Promise<ConfirmPaymentResult> {
  await payments.refund(paymentId, { idempotencyKey: `refund-${booking.id}` });
  await db.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ["EXPIRED", "CANCELLED"] } },
      data: { status: "REFUNDED", paidAt: now, paymentId, refundedAt: now },
    });
    if (count === 1) await enqueueEmail(tx, booking, "payment-refunded");
  });
  return { ok: true, outcome: "REFUNDED", ...result };
}

/**
 * The provider reports that a checkout ended without payment: release the hold now
 * instead of waiting for the next booking of those seats.
 */
export async function expireCheckout(db: Db, command: { sessionId: string }) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { checkoutSessionId: command.sessionId },
      select: { id: true, eventId: true },
    });
    if (!booking) return null;
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    if (count === 0) return null;
    await tx.bookingSeat.deleteMany({ where: { bookingId: booking.id } });
    return { eventId: booking.eventId };
  });
}

class StateChanged extends Error {}

/**
 * Asks the provider whether a pending booking has been paid, and confirms it if so.
 * Called when the customer returns from the checkout: the webhook usually arrives
 * first, but it can be late, and the customer should not see "awaiting payment"
 * right after paying.
 */
export async function syncCheckout(
  db: Db,
  payments: PaymentProvider,
  command: { organizationId: string; reference: string },
): Promise<ConfirmPaymentResult | null> {
  const booking = await db.booking.findFirst({
    where: { organizationId: command.organizationId, reference: command.reference, status: "PENDING" },
    select: { checkoutSessionId: true },
  });
  if (!booking?.checkoutSessionId) return null;
  const status = await payments.getCheckoutStatus(booking.checkoutSessionId);
  if (!status.paid) return null;
  return confirmPayment(db, payments, { sessionId: booking.checkoutSessionId, paymentId: status.paymentId });
}
