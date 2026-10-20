import type Stripe from "stripe";
import type { Db } from "@/server/db";
import { confirmPayment, expireCheckout } from "@/server/payment-service";
import type { PaymentProvider } from "@/server/payments/provider";
import { checkoutStatus } from "@/server/payments/stripe-provider";

/**
 * Applies a verified Stripe event. Stripe delivers events at least once and in no
 * guaranteed order, and the return page may already have confirmed the payment, so
 * every branch is idempotent (see payment-service.ts). Returns the event whose seat
 * availability changed, if any, for cache invalidation.
 */
export async function handleStripeEvent(
  db: Db,
  payments: PaymentProvider,
  event: Stripe.Event,
): Promise<{ eventId: string } | null> {
  switch (event.type) {
    // completed: card payments are paid at this point. Delayed methods (bank transfer,
    // konbini) complete unpaid and report async_payment_succeeded later.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const status = checkoutStatus(event.data.object);
      if (!status.paid) return null;
      const result = await confirmPayment(db, payments, {
        sessionId: event.data.object.id,
        paymentId: status.paymentId,
      });
      // NOT_FOUND: a session from another integration on the same Stripe account.
      return result.ok ? { eventId: result.eventId } : null;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      return expireCheckout(db, { sessionId: event.data.object.id });
    default:
      return null;
  }
}
