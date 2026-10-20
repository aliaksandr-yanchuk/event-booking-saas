import { absoluteUrl } from "@/lib/site";
import { db } from "@/server/db";
import { startCheckout } from "@/server/payment-service";
import { getPaymentProvider } from "@/server/payments";

/**
 * Starts (or resumes) the checkout of a pending booking, with this site's URLs for
 * the way back: after paying, the customer lands on the return route, which confirms
 * the payment if the webhook has not done so yet; after cancelling, on the booking page.
 */
export function beginCheckout(organization: { id: string; slug: string }, reference: string) {
  const bookingPath = `/${organization.slug}/bookings/${reference}`;
  return startCheckout(db, getPaymentProvider(), {
    organizationId: organization.id,
    reference,
    successUrl: absoluteUrl(`${bookingPath}/return`),
    cancelUrl: absoluteUrl(bookingPath),
  });
}
