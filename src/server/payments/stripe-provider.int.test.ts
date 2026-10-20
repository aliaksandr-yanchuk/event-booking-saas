import Stripe from "stripe";
import { createStripeProvider } from "@/server/payments/stripe-provider";

// Runs the Stripe adapter against stripe-mock (docker compose service), which rejects
// requests that do not match Stripe's API spec: unknown parameters, wrong types, a
// missing required field. It answers with fixtures, so these tests check the requests
// we send, not Stripe's behavior.

const mockUrl = process.env.STRIPE_MOCK_URL;
if (!mockUrl) {
  throw new Error("STRIPE_MOCK_URL is not set. Start it with `npm run db:up` (see .env.example).");
}
const { hostname, port, protocol } = new URL(mockUrl);
const stripe = new Stripe("sk_test_mock", {
  host: hostname,
  port,
  protocol: protocol === "https:" ? "https" : "http",
  maxNetworkRetries: 0,
});
const provider = createStripeProvider(stripe);

describe("Stripe provider (against stripe-mock)", () => {
  it("creates a checkout session that Stripe's API accepts", async () => {
    const session = await provider.createCheckout({
      bookingReference: "7KQM-4XPA",
      description: "Midnight Jazz Session: Floor · Row B · Seat 1",
      totalMinor: 8000,
      currency: "JPY",
      customerEmail: "aiko@example.com",
      successUrl: "https://seatline.example/harbor-hall/bookings/7KQM-4XPA/return",
      cancelUrl: "https://seatline.example/harbor-hall/bookings/7KQM-4XPA",
      expiresAt: new Date(Date.now() + 30 * 60_000),
      locale: "ja",
    });

    expect(session.sessionId).toMatch(/^cs_/);
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  it("reads the session status", async () => {
    // The fixture is an open, unpaid session.
    expect(await provider.getCheckoutStatus("cs_test_123")).toEqual({ paid: false });
  });

  it("expires an open session", async () => {
    expect(await provider.expireCheckout("cs_test_123")).toEqual({ completed: false });
  });

  it("sends refunds with the idempotency key", async () => {
    const keys: (string | undefined)[] = [];
    const listener = (event: { idempotency_key?: string; path: string }) => {
      if (event.path === "/v1/refunds") keys.push(event.idempotency_key);
    };
    stripe.on("request", listener);
    try {
      await provider.refund("pi_123", { idempotencyKey: "refund-booking_1" });
    } finally {
      stripe.off("request", listener);
    }

    expect(keys).toEqual(["refund-booking_1"]);
  });
});
