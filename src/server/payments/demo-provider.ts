import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@/server/payments/provider";

/**
 * Stand-in for Stripe when no Stripe keys are configured: the checkout is a page of
 * this app (/checkout/demo/{session}) with "Pay" and "Cancel" buttons. Paying there
 * calls the same confirmPayment() as the Stripe webhook, so everything after the
 * payment (confirmation, late payments, refunds) runs the real code path.
 */
export const demoPaymentProvider: PaymentProvider = {
  name: "demo",

  async createCheckout() {
    const sessionId = `demo_cs_${randomUUID()}`;
    return { sessionId, url: `/checkout/demo/${sessionId}` };
  },

  // The demo page confirms the payment itself, so there is never a payment to find here.
  async getCheckoutStatus() {
    return { paid: false };
  },

  async expireCheckout() {},

  async refund() {},
};
