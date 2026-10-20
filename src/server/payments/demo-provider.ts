import { randomUUID } from "node:crypto";
import { localizePath } from "@/i18n/config";
import type { PaymentProvider } from "@/server/payments/provider";

/**
 * Stand-in for Stripe when no Stripe keys are configured: the checkout is a page of
 * this app (/checkout/demo/{session}) with "Pay" and "Cancel" buttons. Paying there
 * calls the same confirmPayment() as the Stripe webhook, so everything after the
 * payment (confirmation, late payments, refunds) runs the real code path.
 */
export const demoPaymentProvider: PaymentProvider = {
  name: "demo",

  async createCheckout(request) {
    const sessionId = `demo_cs_${randomUUID()}`;
    // In the customer's language, like Stripe Checkout with its locale parameter.
    return { sessionId, url: localizePath(request.locale, `/checkout/demo/${sessionId}`) };
  },

  // The demo page confirms the payment itself, so there is never a payment to find here.
  async getCheckoutStatus() {
    return { paid: false };
  },

  // A demo checkout can only be paid through the demo page, which checks the booking's
  // status first, so there is nothing to expire.
  async expireCheckout() {
    return { completed: false };
  },

  async refund() {},
};
