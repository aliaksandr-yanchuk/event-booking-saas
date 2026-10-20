import type { CheckoutRequest, PaymentProvider } from "@/server/payments/provider";

/** A payment provider that records what the code under test asked it to do. */
export function createFakePayments() {
  const calls = {
    created: [] as CheckoutRequest[],
    expired: [] as string[],
    refunds: [] as { paymentId: string; idempotencyKey: string }[],
  };
  const paid = new Map<string, string>();

  const provider: PaymentProvider = {
    name: "demo",
    async createCheckout(request) {
      calls.created.push(request);
      const sessionId = `fake_cs_${calls.created.length}_${Math.random().toString(36).slice(2)}`;
      return { sessionId, url: `https://pay.example/${sessionId}` };
    },
    async getCheckoutStatus(sessionId) {
      const paymentId = paid.get(sessionId);
      return paymentId ? { paid: true, paymentId } : { paid: false };
    },
    async expireCheckout(sessionId) {
      calls.expired.push(sessionId);
    },
    async refund(paymentId, { idempotencyKey }) {
      calls.refunds.push({ paymentId, idempotencyKey });
    },
  };

  return {
    provider,
    calls,
    // What the customer does on the provider's page.
    pay: (sessionId: string, paymentId = `pi_${sessionId}`) => paid.set(sessionId, paymentId),
  };
}
