"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { localizePath, type Locale } from "@/i18n/config";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { scheduleEmailDelivery } from "@/server/email";
import { confirmPayment } from "@/server/payment-service";
import { getPaymentProvider } from "@/server/payments";

/**
 * "Pay" on the demo checkout: what Stripe's checkout.session.completed webhook does
 * in production, with a made-up payment ID. The session ID is bound on the server.
 */
export async function payDemoCheckoutAction(sessionId: string, locale: Locale) {
  const payments = getPaymentProvider();
  if (payments.name !== "demo") {
    notFound();
  }
  const result = await confirmPayment(db, payments, { sessionId, paymentId: `demo_pi_${randomUUID()}` });
  if (!result.ok) {
    notFound();
  }
  updateTag(cacheTags.eventAvailability(result.eventId));
  scheduleEmailDelivery();
  const booking = await db.booking.findUniqueOrThrow({
    where: { checkoutSessionId: sessionId },
    select: { organization: { select: { slug: true } } },
  });
  redirect(localizePath(locale, `/${booking.organization.slug}/bookings/${result.reference}`));
}
