/**
 * The payment provider behind the checkout. The booking service only talks to this
 * interface, so the same flow runs with Stripe in production and with the built-in
 * demo checkout locally, in CI and on a demo without Stripe keys.
 */

export type CheckoutRequest = {
  // Shown to the customer and sent back with the payment, so a payment can always
  // be traced to its booking.
  bookingReference: string;
  description: string;
  totalMinor: number;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  // The language of the checkout page (Stripe shows its own texts in it).
  locale: "en" | "ja";
  // The checkout stops accepting payment at this moment (before the hold runs out).
  expiresAt: Date;
};

export type CheckoutSession = { sessionId: string; url: string };

export type CheckoutStatus = { paid: true; paymentId: string } | { paid: false };

// completed: too late to expire, the customer has just paid. The caller then has a
// payment to record (and, if it wanted to release the seats, to refund).
export type ExpireCheckoutResult = { completed: false } | { completed: true; paymentId: string };

export interface PaymentProvider {
  readonly name: "stripe" | "demo";
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  getCheckoutStatus(sessionId: string): Promise<CheckoutStatus>;
  // Makes an unpaid checkout unusable, so a released hold cannot be paid afterwards.
  expireCheckout(sessionId: string): Promise<ExpireCheckoutResult>;
  // idempotencyKey: retrying a refund (after a timeout, or a crash before the database
  // update) must not refund twice.
  refund(paymentId: string, options: { idempotencyKey: string }): Promise<void>;
}

/**
 * Checkout lifetime. Stripe requires at least 30 minutes. The seat hold lasts a little
 * longer than the checkout, so a payment completed at the last second still finds its
 * seats held.
 */
export const CHECKOUT_TTL_MS = 30 * 60_000;
export const HOLD_TTL_MS = CHECKOUT_TTL_MS + 5 * 60_000;
