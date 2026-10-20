import Stripe from "stripe";
import type { PaymentProvider } from "@/server/payments/provider";

/**
 * Stripe Checkout behind the PaymentProvider interface. Amounts are already in the
 * currency's minor unit, which is what Stripe expects (yen for JPY, cents for USD).
 */
export function createStripeProvider(stripe: Stripe): PaymentProvider {
  return {
    name: "stripe",

    async createCheckout(request) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        // Shown in the Stripe dashboard and sent back in webhooks, so every payment can be
        // traced to its booking.
        client_reference_id: request.bookingReference,
        metadata: { bookingReference: request.bookingReference },
        payment_intent_data: { metadata: { bookingReference: request.bookingReference } },
        customer_email: request.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.totalMinor,
              product_data: { name: request.description },
            },
          },
        ],
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        expires_at: Math.floor(request.expiresAt.getTime() / 1000),
      });
      if (!session.url) {
        throw new Error(`Stripe returned checkout session ${session.id} without a URL`);
      }
      return { sessionId: session.id, url: session.url };
    },

    async getCheckoutStatus(sessionId) {
      return checkoutStatus(await stripe.checkout.sessions.retrieve(sessionId));
    },

    async expireCheckout(sessionId) {
      // Only an open session can be expired; look first, so a session that was just paid
      // is reported instead of failing with an API error.
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(sessionId);
        return { completed: false };
      }
      const status = checkoutStatus(session);
      return status.paid ? { completed: true, paymentId: status.paymentId } : { completed: false };
    },

    async refund(paymentId, { idempotencyKey }) {
      await stripe.refunds.create({ payment_intent: paymentId }, { idempotencyKey });
    },
  };
}

/** Paid, with the PaymentIntent ID, or not paid (yet). */
export function checkoutStatus(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" || !session.payment_intent) {
    return { paid: false } as const;
  }
  const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
  return { paid: true, paymentId } as const;
}
