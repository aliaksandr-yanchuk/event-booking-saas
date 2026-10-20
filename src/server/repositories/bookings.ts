import type { Db } from "@/server/db";

export async function findBookingByReference(db: Db, organizationId: string, reference: string) {
  return db.booking.findFirst({
    where: { organizationId, reference },
    // The email is deliberately not selected: anyone with the link can see this page.
    select: {
      reference: true,
      customerName: true,
      status: true,
      totalMinor: true,
      seatLabels: true,
      createdAt: true,
      cancelledAt: true,
      expiresAt: true,
      paymentProvider: true,
      checkoutUrl: true,
      paidAt: true,
      refundedAt: true,
      event: {
        select: {
          slug: true,
          title: true,
          startsAt: true,
          currency: true,
          venue: { select: { name: true, city: true } },
        },
      },
    },
  });
}

export type BookingDetails = NonNullable<Awaited<ReturnType<typeof findBookingByReference>>>;

/**
 * The booking behind a checkout session, for the demo checkout page. The session ID is
 * an unguessable secret, like a Stripe Checkout URL, so it is looked up on its own.
 */
export async function findBookingByCheckoutSession(db: Db, sessionId: string) {
  return db.booking.findUnique({
    where: { checkoutSessionId: sessionId },
    select: {
      reference: true,
      status: true,
      totalMinor: true,
      seatLabels: true,
      expiresAt: true,
      paymentProvider: true,
      organization: { select: { slug: true } },
      event: { select: { title: true, currency: true } },
    },
  });
}
