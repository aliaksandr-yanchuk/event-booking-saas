/**
 * @jest-environment node
 */
import Stripe from "stripe";
import { handleStripeEvent } from "@/server/payments/stripe-webhook";
import { POST } from "./route";

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("@/server/db", () => ({ db: {} }));
jest.mock("@/server/email", () => ({ scheduleEmailDelivery: jest.fn() }));
jest.mock("@/server/payments/stripe-webhook", () => ({ handleStripeEvent: jest.fn(async () => null) }));

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_123");

function webhookRequest(payload: string, signature: string) {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

const payload = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", object: "checkout.session", payment_status: "paid", payment_intent: "pi_1" } },
});

describe("POST /api/webhooks/stripe", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, STRIPE_SECRET_KEY: "sk_test_123", STRIPE_WEBHOOK_SECRET: SECRET };
    jest.mocked(handleStripeEvent).mockClear();
  });

  afterAll(() => {
    process.env = env;
  });

  it("handles an event signed with the webhook secret", async () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    const response = await POST(webhookRequest(payload, signature));

    expect(response.status).toBe(200);
    expect(handleStripeEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "stripe" }),
      expect.objectContaining({ id: "evt_1", type: "checkout.session.completed" }),
    );
  });

  it("rejects a forged or modified event", async () => {
    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    expect((await POST(webhookRequest(payload, forged))).status).toBe(400);
    expect((await POST(webhookRequest(payload.replace("pi_1", "pi_2"), signature))).status).toBe(400);
    expect((await POST(webhookRequest(payload, ""))).status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("does not exist when Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;

    expect((await POST(webhookRequest(payload, "t=1,v1=x"))).status).toBe(404);
  });
});
