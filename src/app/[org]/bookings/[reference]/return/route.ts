import { revalidateTag } from "next/cache";
import { isBookingReference } from "@/lib/booking-reference";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { syncCheckout } from "@/server/payment-service";
import { getPaymentProvider } from "@/server/payments";
import { getOrganization } from "@/server/queries";

/**
 * GET /{org}/bookings/{reference}/return — where the checkout sends the customer after
 * paying. Confirms the payment if the webhook has not done it yet (both paths are
 * idempotent), then redirects to the booking page, so a reload of that page does not
 * repeat this side effect.
 */
export async function GET(request: Request, ctx: RouteContext<"/[org]/bookings/[reference]/return">) {
  const { org, reference } = await ctx.params;
  const organization = isBookingReference(reference) ? await getOrganization(org) : null;

  if (organization) {
    const result = await syncCheckout(db, getPaymentProvider(), { organizationId: organization.id, reference });
    if (result?.ok) {
      // A late payment can take seats back (or refund), which changes availability.
      revalidateTag(cacheTags.eventAvailability(result.eventId), { expire: 0 });
    }
  }
  return Response.redirect(new URL(`/${org}/bookings/${reference}`, request.url), 303);
}
