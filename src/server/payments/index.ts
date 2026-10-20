import Stripe from "stripe";
import { demoPaymentProvider } from "@/server/payments/demo-provider";
import type { PaymentProvider } from "@/server/payments/provider";
import { createStripeProvider } from "@/server/payments/stripe-provider";

let stripeClient: Stripe | undefined;

/** The Stripe client, or null when STRIPE_SECRET_KEY is not set (then the demo checkout is used). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }
  // This is a portfolio demo: refuse live keys, so no real card can ever be charged.
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_… or rk_test_…).");
  }
  stripeClient ??= new Stripe(key, { maxNetworkRetries: 2 });
  return stripeClient;
}

/** The provider for this deployment: Stripe when it is configured, the demo checkout otherwise. */
export function getPaymentProvider(): PaymentProvider {
  const stripe = getStripe();
  return stripe ? createStripeProvider(stripe) : demoPaymentProvider;
}
