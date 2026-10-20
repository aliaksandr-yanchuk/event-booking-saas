import { revalidateTag } from "next/cache";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";
import { isBookingReference } from "@/lib/booking-reference";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { scheduleEmailDelivery } from "@/server/email";
import { syncCheckout } from "@/server/payment-service";
import { getPaymentProvider } from "@/server/payments";
import { getOrganization } from "@/server/queries";

/**
 * GET /{org}/bookings/{reference}/return — where the checkout sends the customer after
 * paying. Confirms the payment if the webhook has not done it yet (both paths are
 * idempotent), then redirects to the booking page, so a reload of that page does not
 * repeat this side effect.
 */
export async function GET(request: Request, ctx: RouteContext<"/[lang]/[org]/bookings/[reference]/return">) {
  const { lang, org, reference } = await ctx.params;
  const organization = isBookingReference(reference) ? await getOrganization(org) : null;

  if (organization) {
    const result = await syncCheckout(db, getPaymentProvider(), { organizationId: organization.id, reference });
    if (result?.ok) {
      // A late payment can take seats back (or refund), which changes availability.
      revalidateTag(cacheTags.eventAvailability(result.eventId), { expire: 0 });
      scheduleEmailDelivery();
    }
  }
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  return Response.redirect(new URL(localizePath(locale, `/${org}/bookings/${reference}`), request.url), 303);
}
