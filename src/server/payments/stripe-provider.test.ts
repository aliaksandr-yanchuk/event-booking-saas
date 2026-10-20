/**
 * @jest-environment node
 */
import type Stripe from "stripe";
import { checkoutStatus } from "./stripe-provider";

const session = (fields: Partial<Stripe.Checkout.Session>) => fields as Stripe.Checkout.Session;

describe("checkoutStatus", () => {
  it("is paid with the PaymentIntent ID, whether or not the intent is expanded", () => {
    expect(checkoutStatus(session({ payment_status: "paid", payment_intent: "pi_1" }))).toEqual({
      paid: true,
      paymentId: "pi_1",
    });
    expect(
      checkoutStatus(session({ payment_status: "paid", payment_intent: { id: "pi_2" } as Stripe.PaymentIntent })),
    ).toEqual({ paid: true, paymentId: "pi_2" });
  });

  it("is not paid while a delayed payment method is still pending", () => {
    expect(checkoutStatus(session({ payment_status: "unpaid", payment_intent: "pi_1" }))).toEqual({ paid: false });
  });
});
