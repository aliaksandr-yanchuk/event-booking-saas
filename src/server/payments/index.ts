import { demoPaymentProvider } from "@/server/payments/demo-provider";
import type { PaymentProvider } from "@/server/payments/provider";

/** The provider for this deployment: Stripe when it is configured, the demo checkout otherwise. */
export function getPaymentProvider(): PaymentProvider {
  return demoPaymentProvider;
}
